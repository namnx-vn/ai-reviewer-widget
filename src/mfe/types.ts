import type { ReviewFinding } from "../review/types";

export interface MicroFrontendSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface MicroFrontendAnalysisResult {
  readonly findings: readonly ReviewFinding[];
}
