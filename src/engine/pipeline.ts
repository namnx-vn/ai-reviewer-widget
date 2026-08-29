import { ReviewFinding } from "../domain/review";

export interface PipelineContext {
  deterministicFindings: ReviewFinding[];
  aiFindings: ReviewFinding[];
}