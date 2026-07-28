import { describe, expect, it } from "vitest";

import {
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
  createSecurityFindingId,
  type SecurityFinding,
  type SecurityRule,
} from "..";

const context = {
  source: "const input = request.query.value;",
  file: "src/handler.ts",
  ast: {
    type: "Program",
    body: [],
    sourceType: "module",
    range: [0, 0],
    loc: {
      start: { line: 1, column: 0 },
      end: { line: 1, column: 0 },
    },
  },
};

function createRule(
  id: string,
  check: SecurityRule["check"] = () => [],
): SecurityRule {
  return {
    meta: {
      id,
      title: `Rule ${id}`,
      description: "Detects a test security condition.",
      category: "injection",
      defaultSeverity: "high",
      defaultConfidence: "high",
      standards: [{ standard: "cwe", id: "CWE-89" }],
    },
    check,
  };
}

function createFinding(ruleId: string, start = 10): SecurityFinding {
  return {
    id: createSecurityFindingId({
      ruleId,
      path: "src/handler.ts",
      range: { start, end: start + 5 },
      sinkKind: "sql-query",
    }),
    ruleId,
    title: "Unsafe query",
    message: "Untrusted input reaches a SQL query.",
    severity: "high",
    confidence: "high",
    category: "injection",
    location: { path: "src/handler.ts", range: { start, end: start + 5 } },
    evidence: [],
  };
}

describe("security architecture foundation", () => {
  it("registers rules once and preserves registration order", () => {
    const registry = new SecurityRuleRegistry();
    const first = createRule("security.test.first");
    const second = createRule("security.test.second");

    registry.register(second);
    registry.register(first);

    expect(registry.getRules().map((rule) => rule.meta.id)).toEqual([
      "security.test.second",
      "security.test.first",
    ]);
    expect(() => registry.register(first)).toThrow(/already registered/);
  });

  it("filters rules by category and policy enablement without changing order", () => {
    const registry = new SecurityRuleRegistry();
    registry.register(createRule("security.test.injection"));
    const secretsRule = createRule("security.test.secrets");
    registry.register({
      ...secretsRule,
      meta: {
        ...secretsRule.meta,
        category: "secrets",
      },
    });

    expect(registry.getByCategory("injection").map((rule) => rule.meta.id)).toEqual([
      "security.test.injection",
    ]);
    expect(registry.getRulesForPolicy({
      id: "strict",
      disabledRuleIds: ["security.test.injection"],
    }).map((rule) => rule.meta.id)).toEqual(["security.test.secrets"]);
  });

  it("creates stable finding IDs from rule, file, range, and sink", () => {
    const input = {
      ruleId: "security.injection.sql-query",
      path: "src/api/users.ts",
      range: { start: 14, end: 42 },
      sinkKind: "sql-query" as const,
    };

    expect(createSecurityFindingId(input)).toBe(createSecurityFindingId(input));
    expect(createSecurityFindingId(input)).not.toBe(createSecurityFindingId({
      ...input,
      range: { start: 15, end: 42 },
    }));
  });

  it("rejects invalid rule metadata and invalid finding severity or confidence", () => {
    const registry = new SecurityRuleRegistry();

    expect(() => registry.register({
      ...createRule("invalid rule id"),
      meta: { ...createRule("invalid rule id").meta, id: "invalid rule id" },
    })).toThrow(/id/);

    const engine = new SecurityAnalysisEngine();
    const invalidFinding = {
      ...createFinding("security.test.invalid"),
      severity: "urgent",
      confidence: "absolute",
    };
    registry.register(createRule("security.test.invalid", () => [invalidFinding]));

    expect(engine.analyze(context, registry)).toEqual([]);
  });

  it("returns empty output and isolates failures while retaining valid findings", () => {
    const registry = new SecurityRuleRegistry();
    const engine = new SecurityAnalysisEngine();

    expect(engine.analyze(context, registry)).toEqual([]);

    registry.register(createRule("security.test.failure", () => {
      throw new Error("unexpected rule failure");
    }));
    registry.register(createRule("security.test.first", () => [
      createFinding("security.test.first", 10),
      createFinding("security.test.first", 10),
    ]));
    registry.register(createRule("security.test.second", () => [
      createFinding("security.test.second", 20),
    ]));

    expect(engine.analyze(context, registry).map((finding) => finding.id)).toEqual([
      createFinding("security.test.first", 10).id,
      createFinding("security.test.second", 20).id,
    ]);
  });
});
