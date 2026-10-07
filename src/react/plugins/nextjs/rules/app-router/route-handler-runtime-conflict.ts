import type { ReactRule } from "../../../../engine/react-rule";
import type { FrameworkMinimumVersion } from "../../../../semantic/framework-context";
import { findDirectExport, getDeclaredRuntime } from "../../semantic/module";
import { hasEstablishedAppRouterContext } from "../../semantic/project";
import { getAppRouterSpecialFileRole } from "../../semantic/route-segment";
import { createNextFinding } from "../finding";

export const nextjsRouteHandlerRuntimeConflictRule: ReactRule = {
  id: "next.app.route-handler-runtime-conflict",
  description: "Detect unsupported revalidation config in Edge Route Handlers.",
  rollout: "advisory",

  check(node, context) {
    if (
      node !== context.ast ||
      !hasEstablishedAppRouterContext(context.framework) ||
      getAppRouterSpecialFileRole(context.file) !== "route" ||
      getDeclaredRuntime(context.ast) !== "edge" ||
      !hasEstablishedRouteSegmentConfig(
        context.framework?.nextjs?.minimumVersion,
        context.framework?.nextjs?.cacheComponents,
      )
    ) {
      return [];
    }

    const revalidateExport = findDirectExport(context.ast, "revalidate");
    if (revalidateExport === undefined) {
      return [];
    }

    return [createNextFinding(context.file, revalidateExport, {
      ruleId: "next.app.route-handler-runtime-conflict",
      title: "Revalidation configured for an Edge Route Handler",
      message: "The revalidate route-segment option is unavailable when this Route Handler uses the Edge runtime.",
      severity: "high",
      suggestion: "Use the Node.js runtime for revalidation, or remove the route-segment revalidate export.",
    })];
  },
};

function hasEstablishedRouteSegmentConfig(
  minimumVersion: FrameworkMinimumVersion | undefined,
  cacheComponents: boolean | "unknown" | undefined,
): boolean {
  if (cacheComponents === false) {
    return true;
  }

  if (cacheComponents === true || minimumVersion === undefined) {
    return false;
  }

  return minimumVersion.major >= 13 && minimumVersion.major <= 15;
}
