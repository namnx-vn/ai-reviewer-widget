import { analyzeRemoteContracts } from "./contracts";
import { analyzeModuleFederation } from "./module-federation";
import type { MicroFrontendAnalysisResult, MicroFrontendSourceFile } from "./types";

export function analyzeMicroFrontends(
  files: readonly MicroFrontendSourceFile[],
): MicroFrontendAnalysisResult {
  return {
    findings: [
      ...analyzeRemoteContracts(files),
      ...analyzeModuleFederation(files),
    ],
  };
}

export type {
  MicroFrontendAnalysisResult,
  MicroFrontendSourceFile,
} from "./types";
