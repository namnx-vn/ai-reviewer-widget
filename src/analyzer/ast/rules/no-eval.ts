import type { ReviewFinding } from "../../../domain/review";
import type { ASTRule } from "../rules";

export const noEvalRule: ASTRule = {
  id: "security.no-eval",

  description: "Detect unsafe eval usage.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isEvalCall(node)) {
      return [];
    }

    const location = node.loc.start;
    return [{
      id: `security.no-eval:${file}:${location.line}`,

      ruleId: "security.no-eval",

      title: "Unsafe eval() usage",

      message:
        "eval() can execute arbitrary code and introduces code injection risks.",

      severity: "critical",

      source: "ast",

      location: {
        file,
        line: location.line,
        column: location.column,
      },

      suggestion:
        "Replace eval() with explicit parsing or a data-driven implementation.",
      confidence: 1,
    }];
  },
};

function isEvalCall(node: unknown): node is {
  callee: { name: string };
  loc: { start: { line: number; column: number } };
} {
  if (!node || typeof node !== "object") {
    return false;
  }

  const candidate = node as Record<string, unknown>;
  const callee = candidate.callee;
  const location = candidate.loc;
  if (!callee || typeof callee !== "object" || !location || typeof location !== "object") {
    return false;
  }

  const start = (location as Record<string, unknown>).start;
  return Boolean(
    candidate.type === "CallExpression" &&
      (callee as Record<string, unknown>).type === "Identifier" &&
      (callee as Record<string, unknown>).name === "eval" &&
      start &&
      typeof start === "object" &&
      typeof (start as Record<string, unknown>).line === "number" &&
      typeof (start as Record<string, unknown>).column === "number",
  );
}
