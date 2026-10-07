import type { ReactRule } from "../../../../engine/react-rule";
import { findDirectExport, isClientModule } from "../../semantic/module";
import { hasEstablishedAppRouterContext } from "../../semantic/project";
import { getAppRouterSpecialFileRole } from "../../semantic/route-segment";
import { createNextFinding } from "../finding";

export const nextjsInvalidMetadataClientComponentRule: ReactRule = {
  id: "next.app.invalid-metadata-client-component",
  description: "Detect metadata exports in Client page and layout modules.",
  rollout: "advisory",

  check(node, context) {
    if (
      node !== context.ast ||
      !hasEstablishedAppRouterContext(context.framework) ||
      !isMetadataFileRole(getAppRouterSpecialFileRole(context.file)) ||
      !isClientModule(context.ast)
    ) {
      return [];
    }

    const metadataExport = findDirectExport(context.ast, "metadata") ??
      findDirectExport(context.ast, "generateMetadata");

    if (metadataExport === undefined) {
      return [];
    }

    return [createNextFinding(context.file, metadataExport, {
      ruleId: "next.app.invalid-metadata-client-component",
      title: "Metadata exported from a Client Component",
      message: "Next.js metadata exports run on the server, but this App Router module is marked \"use client\".",
      severity: "high",
      suggestion: "Keep the page or layout as a Server Component and move interactive UI into a child Client Component.",
    })];
  },
};

function isMetadataFileRole(role: string | undefined): boolean {
  return role === "page" || role === "layout";
}
