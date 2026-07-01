import type { ReviewFinding } from "../../review/types";

export interface ASTRule {
  id: string;

  description: string;

  check(
    node: unknown,
    file: string,
  ): ReviewFinding[];
}
