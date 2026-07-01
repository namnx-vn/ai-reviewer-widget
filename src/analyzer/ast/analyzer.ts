import { parseSource } from "./parser";
import type { ASTRule } from "./rules";
import type { ReviewFinding } from "../../review/types";

export function analyzeAST(
  source: string,
  file: string,
  rules: ASTRule[],
): ReviewFinding[] {
  const ast = parseSource(source);

  const findings: ReviewFinding[] = [];

  function visit(node: any) {
    if (!node || typeof node !== "object") {
      return;
    }

    for (const rule of rules) {
      findings.push(...rule.check(node, file));
    }

    for (const key of Object.keys(node)) {
      if (
        key === "parent" ||
        key === "loc" ||
        key === "range" ||
        key === "tokens" ||
        key === "comments"
      ) {
        continue;
      }

      const value = node[key];

      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        visit(value);
      }
    }
  }

  visit(ast);

  return findings;
}