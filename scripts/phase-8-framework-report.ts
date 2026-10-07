import { createDefaultReviewUseCases } from "../src/application/review";
import {
  PHASE_8_FRAMEWORK_CORPUS,
  runPhase8FrameworkQualification,
} from "../src/evaluation";

const report = runPhase8FrameworkQualification(
  createDefaultReviewUseCases(),
  PHASE_8_FRAMEWORK_CORPUS,
);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (report.status === "fail") {
  process.exitCode = 1;
}
