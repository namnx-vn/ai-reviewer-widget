import { ReviewFinding } from "../review/types";

export interface PipelineContext {
  deterministicFindings: ReviewFinding[];
  aiFindings: ReviewFinding[];
}