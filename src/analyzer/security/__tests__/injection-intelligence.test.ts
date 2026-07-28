import { describe, expect, it } from "vitest";

import { parseSource } from "../../ast/parser";
import {
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
  injectionRules,
} from "..";

function analyze(source: string, file = "src/handler.ts") {
  const registry = new SecurityRuleRegistry();
  for (const rule of injectionRules) {
    registry.register(rule);
  }

  return new SecurityAnalysisEngine().analyze({
    source,
    file,
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.2 injection intelligence", () => {
  it("registers the ten stable injection rule IDs", () => {
    expect(injectionRules.map((rule) => rule.meta.id)).toEqual([
      "security.injection.command",
      "security.injection.sql",
      "security.injection.nosql",
      "security.injection.template",
      "security.injection.expression",
      "security.injection.crlf",
      "security.injection.header",
      "security.injection.ldap",
      "security.injection.xpath",
      "security.injection.graphql",
    ]);
  });

  it.each([
    [
      "command",
      `import { exec } from "node:child_process";\nexec(req.query.command);`,
      "security.injection.command",
    ],
    [
      "sql",
      `db.query("SELECT * FROM users WHERE id = " + req.query.id);`,
      "security.injection.sql",
    ],
    [
      "nosql",
      `collection.find({ $where: req.query.where });`,
      "security.injection.nosql",
    ],
    [
      "template",
      `import ejs from "ejs";\nejs.render(req.body.template, { user: "alice" });`,
      "security.injection.template",
    ],
    [
      "expression",
      `import jexl from "jexl";\njexl.eval(req.query.expression);`,
      "security.injection.expression",
    ],
    [
      "crlf",
      `res.setHeader("X-Trace", req.headers["x-trace"]);`,
      "security.injection.crlf",
    ],
    [
      "header",
      `res.setHeader(req.query.name, "value");`,
      "security.injection.header",
    ],
    [
      "ldap",
      `ldapClient.search("dc=example,dc=com", { filter: req.query.filter });`,
      "security.injection.ldap",
    ],
    [
      "xpath",
      `xpath.select(req.query.path, document);`,
      "security.injection.xpath",
    ],
    [
      "graphql",
      `import { graphql } from "graphql";\ngraphql({ schema, source: req.body.query });`,
      "security.injection.graphql",
    ],
  ])("detects direct %s request-to-sink flow", (_name, source, expectedRuleId) => {
    expect(ruleIds(source)).toContain(expectedRuleId);
  });

  it("tracks assignment, alias, template literal, concatenation, and multi-hop propagation", () => {
    const source = `
      import { exec as execute } from "node:child_process";
      const first = req.query.command;
      const second = first;
      const third = \`prefix \${second}\`;
      const finalCommand = third + " --verbose";
      execute(finalCommand);
    `;

    const findings = analyze(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("security.injection.command");
    expect(findings[0]?.flow?.map((step) => step.kind)).toContain("source");
    expect(findings[0]?.flow?.map((step) => step.kind)).toContain("transform");
    expect(findings[0]?.flow?.at(-1)?.kind).toBe("sink");
  });

  it("distinguishes SQL query text from parameter values", () => {
    const safe = `db.query("SELECT * FROM users WHERE id = $1", [req.query.id]);`;
    const unsafe = "db.query(`SELECT * FROM users WHERE id = ${req.query.id}`);";

    expect(ruleIds(safe)).not.toContain("security.injection.sql");
    expect(ruleIds(unsafe)).toContain("security.injection.sql");
  });

  it("applies sink-aware sanitizers and does not accept the wrong sanitizer", () => {
    const commandSafe = `
      import { exec } from "node:child_process";
      import { quote } from "shell-quote";
      exec(quote([req.query.command]));
    `;
    const commandWrongSanitizer = `
      import { exec } from "node:child_process";
      exec(encodeURIComponent(req.query.command));
    `;
    const headerSafe = `res.setHeader("X-Trace", encodeURIComponent(req.query.trace));`;

    expect(ruleIds(commandSafe)).not.toContain("security.injection.command");
    expect(ruleIds(commandWrongSanitizer)).toContain("security.injection.command");
    expect(ruleIds(headerSafe)).not.toContain("security.injection.crlf");
  });

  it("resolves imported sink aliases without treating unrelated names as sinks", () => {
    const aliased = `
      import { exec as runCommand } from "child_process";
      const invoke = runCommand;
      invoke(req.query.command);
    `;
    const unrelated = `
      function exec(value: string) { return value; }
      exec(req.query.command);
      metrics.query(req.query.id);
      renderer.render(req.body.template);
    `;

    expect(ruleIds(aliased)).toContain("security.injection.command");
    expect(analyze(unrelated)).toEqual([]);
  });

  it("keeps GraphQL variable values separate from the operation document", () => {
    const source = `
      import { graphql } from "graphql";
      graphql({
        schema,
        source: "query User($id: ID!) { user(id: $id) { id } }",
        variableValues: { id: req.query.id },
      });
    `;

    expect(ruleIds(source)).not.toContain("security.injection.graphql");
  });

  it("does not flag constants, parameterized values, or strings that merely name sink APIs", () => {
    const source = `
      const example = "exec(req.query.command)";
      db.query("SELECT 1");
      collection.find({ status: "active" });
      res.setHeader("Cache-Control", "no-store");
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("produces stable finding IDs and stable evidence ordering", () => {
    const source = `
      db.query("SELECT * FROM users WHERE name = '" + req.query.name + "'");
    `;

    const first = analyze(source);
    const second = analyze(source);

    expect(first.map((finding) => finding.id)).toEqual(second.map((finding) => finding.id));
    expect(first[0]?.flow).toEqual(second[0]?.flow);
  });
});
