import type { OperationalTelemetryEvent } from "./contracts";
import type { OperationalTelemetryPort } from "./ports";

export const NOOP_OPERATIONAL_TELEMETRY: OperationalTelemetryPort = {
  record: () => undefined,
};

export function recordOperationalTelemetry(
  telemetry: OperationalTelemetryPort | undefined,
  event: OperationalTelemetryEvent,
): void {
  try {
    (telemetry ?? NOOP_OPERATIONAL_TELEMETRY).record(event);
  } catch {
    // Observability is best-effort and must never alter review behavior.
  }
}
