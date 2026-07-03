import type { ReviewFinding } from "../../review/types";

export interface ReactRuleContext {
  readonly source: string;
  readonly file: string;
}

export interface ReactRule {
  readonly id: string;
  readonly description: string;

  check(
    node: unknown,
    context: ReactRuleContext,
  ): ReviewFinding[];
}