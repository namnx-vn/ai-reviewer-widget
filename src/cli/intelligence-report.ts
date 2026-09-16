import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultReviewUseCases } from "../application/review";
import { buildCalibrationReport, buildReliabilityScorecard, buildReliabilitySloReport, compareCalibrationReports,
  parseAdversarialCorpus, parseReliabilitySloInput, runSemanticStabilityEvaluation } from "../evaluation";
import type { CliIO } from "./run";

export const INTELLIGENCE_REPORT_COMMANDS = ["scorecard", "calibration", "calibration-drift", "slo", "semantic"] as const;
export function runIntelligenceReport(command: string, path: string, io: CliIO): number {
  const input: unknown = JSON.parse(readFileSync(resolve(io.cwd, path), "utf8"));
  if (command === "scorecard") {
    const report = buildReliabilityScorecard(input);
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return report.summary.precisionStatus === "measured" && report.summary.recall.value !== null ? 0 : 1;
  }
  if (command === "calibration") {
    const report = buildCalibrationReport(input);
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return report.summary.evaluatedSamples > 0 && report.summary.pendingSamples === 0
      && report.summary.excludedSamples === 0 && report.summary.missingProbabilities === 0 ? 0 : 1;
  }
  if (command === "calibration-drift") {
    if (typeof input !== "object" || input === null || Array.isArray(input) || !("current" in input)
      || !("baseline" in input) || !("policy" in input) || Object.keys(input).some((k) => !["current", "baseline", "policy"].includes(k))) {
      throw new Error("Invalid calibration comparison bundle.");
    }
    const report = compareCalibrationReports(input.current, input.baseline, input.policy);
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === "pass" ? 0 : 1;
  }
  if (command === "slo") {
    const report = buildReliabilitySloReport(parseReliabilitySloInput(input));
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return report.operationalStatus === "pass" && report.findingQualityStatus === "pass" ? 0 : 1;
  }
  if (command === "semantic") {
    const report = runSemanticStabilityEvaluation(createDefaultReviewUseCases(), parseAdversarialCorpus(input));
    io.stdout(`${JSON.stringify(report, null, 2)}\n`);
    return report.summary.status === "passed" ? 0 : 1;
  }
  throw new Error("Unknown intelligence report command.");
}
