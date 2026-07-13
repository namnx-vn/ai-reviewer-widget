import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { analyzeRscModule, getImportSource } from "./semantic";

const RULE_ID = "react.rsc.incompatible-boundary-import";

export const reactRscIncompatibleBoundaryImportRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect server-only imports in client modules and client-only imports in server modules.",

  check(node, context) {
    if (node.type !== "ImportDeclaration") {
      return [];
    }

    const source = getImportSource(node);
    const analysis = analyzeRscModule(context);
    const clientEvidence =
      analysis.clientDirective !== undefined || analysis.clientOnlyImports.length > 0;
    const serverEvidence =
      analysis.serverDirective !== undefined || analysis.serverOnlyImports.length > 0;

    if (source === "server-only" && clientEvidence) {
      return [createFinding(context.file, node, "server-only", "client")];
    }

    if (source === "client-only" && serverEvidence) {
      return [createFinding(context.file, node, "client-only", "server")];
    }

    return [];
  },
};

function createFinding(
  file: string,
  node: TSESTree.ImportDeclaration,
  importedBoundary: "server-only" | "client-only",
  moduleBoundary: "client" | "server",
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "Incompatible RSC boundary import",
    message:
      `This ${moduleBoundary} module imports \"${importedBoundary}\", which declares the opposite React Server Component execution boundary.`,
    severity: "high",
    source: "ast",
    location: { file, line, column },
    suggestion:
      "Move the boundary-specific dependency behind a module with the matching execution boundary, then import only serializable data or an allowed server/client interface across the boundary.",
    confidence: 0.99,
  };
}
