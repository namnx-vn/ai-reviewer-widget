import type { ReviewFinding } from "../../../review/types";
import type { ASTRule } from "../rules";

export const noConsoleRule: ASTRule = {
  id: "quality.no-console",

  description: "Detect console logging.",

  check(node: any, file: string): ReviewFinding[] {
    if (
      node?.type !== "CallExpression" ||
      node.callee?.type !== "MemberExpression"
    ) {
      return [];
    }

    if (
      node.callee.object?.name !== "console" ||
      node.callee.property?.name !== "log"
    ) {
      return [];
    }

    const item = {
      id: `quality.no-console:${file}:${node.loc.start.line}`,
      ruleId: "quality.no-console",
      title: "Console logging detected",
      message:
        "Production code should use the application's structured logging mechanism.",
      severity: "low",
      confidence: "high",
      source: "ast",
      location: {
        file,
        line: node.loc.start.line,
        column: node.loc.start.column,
      },
      suggestion:
        "Replace console.log() with the project's logging abstraction.",
    };

    return [item as unknown as ReviewFinding];
  },
};
