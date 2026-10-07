import type { FrameworkContext } from "../../../semantic/framework-context";

export function hasEstablishedAppRouterContext(
  framework: FrameworkContext | undefined,
): boolean {
  const router = framework?.nextjs?.router;
  return router === "app" || router === "mixed";
}
