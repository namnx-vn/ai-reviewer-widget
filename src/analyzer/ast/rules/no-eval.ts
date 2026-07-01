import type { ReviewFinding } from "../../../review/types";
import type { ASTRule } from "../rules";

export const noEvalRule: ASTRule = {
  id: "security.no-eval",

  description: "Detect unsafe eval usage.",

  check(node: any, file: string): ReviewFinding[] {
    if (
      node?.type !== "CallExpression" ||
      node.callee?.type !== "Identifier" ||
      node.callee.name !== "eval"
    ) {
      return [];
    }

    return [
      {
        id: `security.no-eval:${file}:${node.loc.start.line}`,

        ruleId: "security.no-eval",

        title: "Unsafe eval() usage",

        message:
          "eval() can execute arbitrary code and introduces code injection risks.",

        severity: "critical",

        source: "ast",

        location: {
          file,
          line: node.loc.start.line,
          column: node.loc.start.column,
        },

        suggestion:
          "Replace eval() with explicit parsing or a data-driven implementation.",
      },
    ];
  },
};