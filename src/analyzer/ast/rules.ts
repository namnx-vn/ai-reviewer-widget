import type { ReviewFinding } from "../../domain/review";

export interface ASTRule {
  id: string;

  description: string;

  check(
    node: unknown,
    file: string,
  ): ReviewFinding[];
}
