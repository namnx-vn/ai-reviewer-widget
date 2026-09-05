export interface RealWorldRuleMapping {
  readonly caseId: string;
  readonly expectationId: string;
  readonly acceptableRuleIds: readonly string[];
  readonly rationale: string;
}

export const REAL_WORLD_RULE_MAPPINGS: readonly RealWorldRuleMapping[] = [
  {
    caseId: "vercel-next-95182-edge-action-body-limit",
    expectationId: "unbounded-action-body",
    acceptableRuleIds: ["performance.backpressure.unbounded-queue"],
    rationale: "The production backpressure rule directly identifies the unbounded chunk accumulation that makes the Edge Server Action body-size limit missing in the minimized reproduction.",
  },
];

export function findRealWorldRuleMapping(
  caseId: string,
  expectationId: string,
): RealWorldRuleMapping | undefined {
  return REAL_WORLD_RULE_MAPPINGS.find(
    (mapping) => mapping.caseId === caseId && mapping.expectationId === expectationId,
  );
}
