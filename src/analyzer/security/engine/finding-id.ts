import type { SecurityFindingIdInput } from "../model/types";

export function createSecurityFindingId(input: SecurityFindingIdInput): string {
  return [
    input.ruleId,
    input.path,
    formatRange(input.range),
    input.sinkKind ?? "unknown",
  ].map(encodeURIComponent).join(":");
}

function formatRange(range: SecurityFindingIdInput["range"]): string {
  if (!range) {
    return "no-range";
  }

  return `${range.start}-${range.end}`;
}
