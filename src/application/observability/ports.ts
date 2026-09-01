import type { OperationalTelemetryEvent } from "./contracts";

export interface OperationalTelemetryPort {
  record(event: OperationalTelemetryEvent): void;
}
