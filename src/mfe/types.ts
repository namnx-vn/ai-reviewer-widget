import type { ReviewFinding } from "../domain/review";

export interface MicroFrontendSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface MicroFrontendAnalysisResult {
  readonly findings: readonly ReviewFinding[];
}
