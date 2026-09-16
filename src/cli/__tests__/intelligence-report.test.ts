import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIntelligenceCli } from "../intelligence";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));
async function run(command: string, data: unknown) {
  const cwd = mkdtempSync(join(tmpdir(), "phase7-reports-")); directories.push(cwd);
  writeFileSync(join(cwd, "input.json"), JSON.stringify(data));
  let output = "", errors = "";
  const exit = await runIntelligenceCli([command, "input.json"], { cwd,
    stdout: (value) => { output += value; }, stderr: (value) => { errors += value; } });
  return { exit, output, errors };
}
describe("reliability operator reports", () => {
  it("outputs calibration with missing evidence and a nonzero qualification exit", async () => {
    const result = await run("calibration", { modelVersion: "candidate", datasetVersion: "dataset", binCount: 5, samples: [] });
    expect(result.exit).toBe(1);
    expect(JSON.parse(result.output).summary.brierScore).toBeNull();
  });
  it("reports a scorecard without treating zero findings as proven quality", async () => {
    const result = await run("scorecard", { datasetVersion: "dataset", reviewerVersion: "reviewer", findings: [], expectations: [], executions: [] });
    expect(result.exit).toBe(1);
    expect(JSON.parse(result.output).summary.precisionStatus).toBe("insufficient-evidence");
  });
  it("rejects malformed external SLO and semantic manifests", async () => {
    expect((await run("slo", { samples: "invalid" })).exit).toBe(2);
    expect((await run("semantic", { version: 1, cases: "invalid" })).exit).toBe(2);
  });
});
