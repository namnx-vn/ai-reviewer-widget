import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding, Severity } from "../../../../domain/review";

interface NextFindingDetails {
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: Severity;
  readonly suggestion: string;
  readonly source?: ReviewFinding["source"];
}

export function createNextFinding(
  file: string,
  node: TSESTree.Node,
  details: NextFindingDetails,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [details.ruleId, file, line, column].join(":"),
    ruleId: details.ruleId,
    title: details.title,
    message: details.message,
    severity: details.severity,
    source: details.source ?? "ast",
    confidence: 1,
    location: { file, line, column },
    suggestion: details.suggestion,
  };
}
