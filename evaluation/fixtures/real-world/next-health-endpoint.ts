type HealthStatus = "healthy" | "unhealthy" | "degraded";

interface HealthCheckResult {
  readonly status: HealthStatus;
  readonly services: Readonly<Record<string, { readonly status: HealthStatus; readonly message?: string }>>;
  readonly system: {
    readonly memoryUsage: NodeJS.MemoryUsage;
    readonly uptime: number;
  };
}

declare const monitor: { check(): Promise<HealthCheckResult> };
declare const NextResponse: {
  json(body: unknown, init: { readonly status: number }): unknown;
};

export async function GET(): Promise<unknown> {
  const result = await monitor.check();
  const status = result.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(result, { status });
}
