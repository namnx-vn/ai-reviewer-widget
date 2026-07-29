import type { PerformanceFindingIdInput } from "../model/types";
export function createPerformanceFindingId(input: PerformanceFindingIdInput): string { const range = input.range ? `${input.range.start}-${input.range.end}` : "no-range"; return [input.ruleId, input.path, range, input.operationKind ?? "none"].map(encodeURIComponent).join(":"); }
