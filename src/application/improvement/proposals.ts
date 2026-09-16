import type { FailureOpportunity, LearningEvent } from "./contracts";
import { mineLearningFailures } from "./outcomes";

export interface ProposalNarrative {
  readonly hypothesis: string; readonly changeKind: "detection" | "configuration" | "prompt";
  readonly changeDescription: string; readonly expectedImpact: string; readonly regressionRisk: string;
}
export interface PendingImprovementProposal extends ProposalNarrative {
  readonly schemaVersion: 1; readonly proposalId: string; readonly state: "pending";
  readonly repositoryId: string; readonly ruleId: string; readonly datasetVersion: string;
  readonly outcomeRefs: readonly string[]; readonly testRefs: readonly string[]; readonly cohortRefs: readonly string[];
  readonly evidenceRefs: readonly string[]; readonly requiredRegressionOutcomeRefs: readonly string[];
  readonly lowConfidence: boolean; readonly mandatoryControls: "preserved";
}
export interface UntrustedProposalPort { propose(opportunity: FailureOpportunity, signal: AbortSignal): Promise<unknown> }
export interface ProposalGenerationOptions { readonly datasetVersion: string; readonly cohortRefs: readonly string[]; readonly timeoutMs?: number }

function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 2000; }
function narrative(value: unknown): ProposalNarrative {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid improvement proposal.");
  const keys = ["hypothesis", "changeKind", "changeDescription", "expectedImpact", "regressionRisk"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))
    || !("hypothesis" in value) || !text(value.hypothesis) || !("changeDescription" in value) || !text(value.changeDescription)
    || !("expectedImpact" in value) || !text(value.expectedImpact) || !("regressionRisk" in value) || !text(value.regressionRisk)
    || !("changeKind" in value) || !["detection", "configuration", "prompt"].includes(String(value.changeKind))) throw new Error("Invalid improvement proposal fields.");
  if (value.changeKind !== "detection" && value.changeKind !== "configuration" && value.changeKind !== "prompt") throw new Error("Invalid proposal change kind.");
  return { hypothesis: value.hypothesis, changeKind: value.changeKind, changeDescription: value.changeDescription,
    expectedImpact: value.expectedImpact, regressionRisk: value.regressionRisk };
}
async function requestNarrative(port: UntrustedProposalPort, opportunity: FailureOpportunity, timeoutMs: number): Promise<ProposalNarrative> {
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return narrative(await Promise.race([port.propose(structuredClone(opportunity), controller.signal), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { reject(new Error("Improvement proposal deadline exceeded.")); controller.abort(); }, timeoutMs);
    })]));
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
export async function generateImprovementProposals(events: readonly LearningEvent[], repositoryId: string,
  options: ProposalGenerationOptions, port?: UntrustedProposalPort): Promise<readonly PendingImprovementProposal[]> {
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!text(repositoryId) || !text(options.datasetVersion) || options.cohortRefs.length === 0 || options.cohortRefs.length > 64
    || !options.cohortRefs.every(text) || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error("Invalid proposal generation limits.");
  const opportunities = mineLearningFailures(events, repositoryId);
  if (opportunities.length > 100 || opportunities.some((opportunity) => opportunity.outcomeRefs.length > 100)) throw new Error("Improvement proposal batch limit exceeded.");
  const proposals: PendingImprovementProposal[] = [];
  for (const opportunity of opportunities) {
    const proposed = port === undefined ? {
      hypothesis: `${opportunity.verdict} observations suggest ${opportunity.ruleId} requires evidence review.`,
      changeKind: "detection" as const, changeDescription: "Inspect the verified evidence and propose a minimal detector change after regression reproduction.",
      expectedImpact: "Address the verified failure class without suppressing protected findings.", regressionRisk: "A detector change may introduce false positives or miss existing positives.",
    } : await requestNarrative(port, opportunity, timeoutMs);
    proposals.push({ ...proposed, schemaVersion: 1, proposalId: JSON.stringify(["proposal-v1", repositoryId, options.datasetVersion, opportunity.ruleId, opportunity.verdict, opportunity.outcomeRefs]),
      state: "pending", repositoryId, ruleId: opportunity.ruleId, datasetVersion: options.datasetVersion,
      outcomeRefs: [...opportunity.outcomeRefs], evidenceRefs: [...opportunity.regressionRefs], requiredRegressionOutcomeRefs: [...opportunity.outcomeRefs],
      testRefs: events.filter((event) => event.kind === "regression" && opportunity.outcomeRefs.includes(event.outcomeRef))
        .flatMap((event) => event.kind === "regression" ? [event.regressionRef] : []).sort(), cohortRefs: [...new Set(options.cohortRefs)].sort(),
      lowConfidence: opportunity.lowConfidence, mandatoryControls: "preserved" });
  }
  return proposals;
}
