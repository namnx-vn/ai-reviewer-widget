import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import { filesystemRules } from "../../src/analyzer/security/rules/filesystem";

function analyze(source: string) {
  const ast = parseSource(source);
  return filesystemRules.flatMap((rule) =>
    rule.check({ source, file: "src/files.ts", ast }),
  );
}

describe("phase 3.6.11 filesystem security", () => {
  it("reports request-controlled paths at read and write filesystem sinks", () => {
    const findings = analyze(`
      import * as fs from "node:fs";
      fs.readFileSync(req.params.name);
      fs.writeFileSync("/uploads/" + req.body.name, "content");
    `);
    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.filesystem.path-traversal",
      "security.filesystem.path-traversal",
      "security.filesystem.arbitrary-read",
      "security.filesystem.arbitrary-write",
    ]);
  });

  it("tracks path taint through join and local wrapper calls", () => {
    const findings = analyze(`
      import { readFile } from "node:fs/promises";
      import { join } from "node:path";
      const pathFor = (name: string) => join("/srv/files", name);
      readFile(pathFor(request.query.name));
    `);
    expect(findings.map((finding) => finding.ruleId)).toEqual([
      "security.filesystem.path-traversal",
      "security.filesystem.arbitrary-read",
    ]);
  });

  it("accepts only modeled containment and allowlist mitigations", () => {
    expect(analyze(`
      import * as fs from "node:fs";
      import * as path from "node:path";
      const name = req.params.name;
      const target = path.resolve("/srv/files", name);
      if (!target.startsWith("/srv/files/")) throw new Error("bad path");
      fs.readFileSync(target);
    `)).toEqual([]);

    expect(analyze(`
      import * as fs from "node:fs";
      import * as path from "node:path";
      fs.readFileSync(path.basename(req.params.name));
    `).map((finding) => finding.ruleId)).toEqual([
      "security.filesystem.path-traversal",
      "security.filesystem.arbitrary-read",
    ]);
  });

  it("reports unsafe upload, unrestricted upload, zip-slip, temp file, and symlink patterns", () => {
    const findings = analyze(`
      app.post("/upload", upload.single("file"), (req) => fs.writeFileSync(req.file.originalname, req.file.buffer));
      app.post("/upload", upload.any(), handler);
      archive.extract(req.body.destination);
      fs.mkdtempSync("/tmp/upload-");
      fs.writeFileSync(req.query.link, "value");
    `);
    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "security.filesystem.unsafe-upload",
      "security.filesystem.unrestricted-upload",
      "security.filesystem.zip-slip",
      "security.filesystem.insecure-temp-file",
      "security.filesystem.symlink-risk",
    ]));
  });

  it("is deterministic and ignores constant filesystem paths", () => {
    const source = `import * as fs from "node:fs"; fs.readFileSync("/app/config.json");`;
    expect(analyze(source)).toEqual([]);
    expect(analyze(source)).toEqual(analyze(source));
  });
});
