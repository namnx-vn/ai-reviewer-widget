import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDefaultReviewUseCases } from "../../application/review";
import { applySemanticTransformation, parseAdversarialCorpus, runSemanticStabilityEvaluation, type SemanticStabilityCorpus } from "../semantic-stability";

const corpus = () => parseAdversarialCorpus(JSON.parse(readFileSync(new URL("../../../evaluation/fixtures/phase-7/adversarial.json", import.meta.url), "utf8")));

describe("versioned semantic/adversarial evaluation", () => {
  it("runs the shared deterministic pipeline and keeps hand-audited misses explicit", () => {
    const report = runSemanticStabilityEvaluation(createDefaultReviewUseCases(), corpus());
    expect(report.corpusVersion).toBe(1);
    expect(report.summary.caseCount).toBe(8);
    expect(report.summary.evidenceStatus).toBe("insufficient-evidence");
    expect(report.summary.broadQualityGuarantee).toBe(false);
    expect(report.cases.find(({ id }) => id === "dynamic-module")?.expectations.some(({ detected }) => !detected)).toBe(true);
    expect(report.cases.find(({ id }) => id === "async-component")?.expectations.every(({ satisfied }) => satisfied)).toBe(true);
  });

  it("preserves finding multisets across line shifts/comments/type-import ordering", () => {
    const report = runSemanticStabilityEvaluation(createDefaultReviewUseCases(), corpus());
    expect(report.summary.stableComparisons).toBe(report.summary.supportedComparisons);
    expect(report.cases.every(({ identicalInputStable }) => identicalInputStable)).toBe(true);
  });

  it("renames only the bounded local parameter and refuses observable/shadowed binding changes", () => {
    const item = corpus().cases.find(({ id }) => id === "test-dynamic-api")!;
    const renamed = applySemanticTransformation(item, "identifier-rename");
    expect(renamed.status).toBe("supported");
    expect(renamed.files.find(({ path }) => path.endsWith("execute.test.ts"))?.content).toContain("new Function(payload)");
    const shadowed = { ...item, files: [{ path: item.rename!.file, content: "function run(input: string) { const nested = (input: string) => input; return nested(input); }" }] };
    expect(applySemanticTransformation(shadowed, "identifier-rename").status).toBe("unsupported");
    const directEval = { ...item, files: [{ path: item.rename!.file, content: "function run(input: string) { return eval(input); }" }] };
    expect(applySemanticTransformation(directEval, "identifier-rename").status).toBe("unsupported");
  });

  it("refuses runtime import reordering and helper extraction as unsupported transformations", () => {
    const item = { ...corpus().cases[0], files: [{ path: "src/a.ts", content: "import './side-effect'; import './other';" }] };
    expect(applySemanticTransformation(item, "type-import-order").status).toBe("unsupported");
    expect(applySemanticTransformation(item, "helper-extraction").status).toBe("unsupported");
  });

  it("detects severity/message/multiplicity drift and repeated-input instability", () => {
    const actual = createDefaultReviewUseCases();
    let count = 0;
    const unstable = { ...actual, reviewFiles: (...args: Parameters<typeof actual.reviewFiles>) => {
      const result = actual.reviewFiles(...args); count += 1;
      return { ...result, findings: count % 2 ? result.findings : [] };
    } };
    const report = runSemanticStabilityEvaluation(unstable, { ...corpus(), cases: [corpus().cases[0]] }, { repetitions: 3 });
    expect(report.summary.unstableCases).toBe(1);
    expect(report.summary.status).toBe("failed");
  });

  it("marks parse and analyzer diagnostics incomplete rather than semantically stable/clean", () => {
    const invalid: SemanticStabilityCorpus = { ...corpus(), cases: [{ ...corpus().cases[0], files: [{ path: "src/a.ts", content: "export const =" }] }] };
    const report = runSemanticStabilityEvaluation(createDefaultReviewUseCases(), invalid);
    expect(report.cases[0].status).toBe("incomplete");
    expect(report.summary.status).toBe("incomplete");
  });

  it("rejects corrupted corpus versions and unknown expectation verdicts", () => {
    expect(() => parseAdversarialCorpus({ ...corpus(), version: 2 })).toThrow("version");
    expect(() => parseAdversarialCorpus({ ...corpus(), cases: [{ ...corpus().cases[0], expectations: [{ kind: "guessed", ruleId: "x", rationale: "x" }] }] })).toThrow("expectation");
  });
  it.each(["severity", "message", "duplicate"])("detects transformed %s drift even when rule/file identities match", (kind) => {
    const actual = createDefaultReviewUseCases();
    const brittle = { ...actual, reviewFiles: (...args: Parameters<typeof actual.reviewFiles>) => {
      const result = actual.reviewFiles(...args);
      if (!args[0][0].content.startsWith("/*")) return result;
      const finding = result.findings[0];
      if (kind === "duplicate") return { ...result, findings: [...result.findings, finding] };
      return { ...result, findings: result.findings.map((item) => kind === "message"
        ? { ...item, message: "A different causal claim." } : { ...item, severity: "info" as const }) };
    } };
    const report = runSemanticStabilityEvaluation(brittle, { ...corpus(), cases: [corpus().cases[0]] });
    expect(report.cases[0].identicalInputStable).toBe(true);
    expect(report.cases[0].comparisons.find(({ transformation }) => transformation === "comments")?.status).toBe("changed");
    expect(report.summary.status).toBe("failed");
  });

  it("refuses exported/shorthand/colliding/reserved-name renames", () => {
    const original = corpus().cases.find(({ id }) => id === "test-dynamic-api")!;
    for (const content of [
      "export function run(input: string) { return input; }",
      "function run(input: string) { return { input }; }",
      "function run(input: string) { type Options = { input: string }; return input; }",
      "function run(input: string) { return <input value={input} />; }",
      "function run(input: string) { const payload = 1; return input + payload; }",
    ]) {
      expect(applySemanticTransformation({ ...original, files: [{ path: original.rename!.file, content }] }, "identifier-rename").status).toBe("unsupported");
    }
    expect(applySemanticTransformation({ ...original, rename: { ...original.rename!, to: "return" } }, "identifier-rename").status).toBe("unsupported");
  });

  it("preserves hashbang input rather than applying a partial transformation", () => {
    const original = corpus().cases[0];
    const files = [{ path: "src/a.ts", content: "#!/usr/bin/env node\nconsole.log('x');" }, ...original.files];
    const result = applySemanticTransformation({ ...original, files }, "comments");
    expect(result.status).toBe("unsupported");
    expect(result.files).toEqual(files);
  });

});
