import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";
import { analyzeRscModule } from "./semantic";

const RULE_ID = "react.rsc.conflicting-boundary";

export const reactRscConflictingBoundaryRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect modules that declare both client and server React boundaries.",

  check(node, context) {
    if (node !== context.ast) {
      return [];
    }

    const analysis = analyzeRscModule(context);

    if (
      analysis.clientDirective === undefined ||
      analysis.serverDirective === undefined
    ) {
      return [];
    }

    const line = analysis.serverDirective.loc?.start.line ?? 1;
    const column = analysis.serverDirective.loc?.start.column ?? 0;

    return [
      createFinding(context.file, line, column),
    ];
  },
};

function createFinding(
  file: string,
  line: number,
  column: number,
): ReviewFinding {
  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Conflicting React Server Component boundary",
    message:
      "This module declares both \"use client\" and \"use server\" in its directive prologue, so the module cannot have one unambiguous React Server Component boundary.",
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Keep one module-level boundary directive. Move client code and server functions into separate modules when both behaviors are required.",
    confidence: 1,
  };
}
