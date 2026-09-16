import {
  fingerprintFindingClaim,
  validateFindingEvidenceGraph,
  type FindingEvidenceGraph,
  type FindingEvidenceNode,
  type ReviewFinding,
} from "../../domain/review";

export interface CounterexampleResult {
  readonly action: "downgrade" | "reject";
  readonly reasonCode: string;
  readonly evidenceNodeIds: readonly string[];
}

export interface RuleCounterexample {
  readonly id: string;
  readonly ruleId: string;
  /** Trusted analyzer-owned predicate. Feedback and model prose are not inputs. */
  readonly evaluate: (input: {
    readonly finding: Readonly<ReviewFinding>;
    readonly graph: FindingEvidenceGraph;
    readonly trustedEvidenceNodes: readonly FindingEvidenceNode[];
  }) => CounterexampleResult | undefined;
}

export type CounterexampleRegistry = readonly RuleCounterexample[];

export interface FindingVerificationContext {
  readonly knownFiles: readonly string[];
  readonly trustedEvidenceNodes: readonly FindingEvidenceNode[];
  readonly counterexamples: CounterexampleRegistry;
  readonly mandatoryRuleIds?: readonly string[];
}

export interface FindingVerificationResult {
  readonly action: "publish" | "downgrade" | "reject";
  readonly finding?: ReviewFinding;
  readonly reasons: readonly string[];
  readonly evidenceGraph?: FindingEvidenceGraph;
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

export function createCounterexampleRegistry(entries: readonly RuleCounterexample[]): CounterexampleRegistry {
  if (entries.length > 100) throw new Error("Counterexample registry exceeds its budget.");
  const ids = new Set<string>();
  return Object.freeze(entries.map((entry) => {
    if (!IDENTIFIER.test(entry.id) || !IDENTIFIER.test(entry.ruleId) || ids.has(entry.id) || typeof entry.evaluate !== "function") {
      throw new Error("Counterexamples require unique IDs and exact rule IDs.");
    }
    ids.add(entry.id);
    return Object.freeze({ id: entry.id, ruleId: entry.ruleId, evaluate: entry.evaluate });
  }));
}

export function verifyFindingCandidate(
  candidate: { readonly finding: ReviewFinding; readonly graph?: unknown },
  context: FindingVerificationContext,
): FindingVerificationResult {
  const { finding } = candidate;
  const mandatory = context.mandatoryRuleIds?.includes(finding.ruleId) === true;
  const validation = validateFindingEvidenceGraph(candidate.graph);
  if (!validation.valid || validation.graph === undefined) return downgrade(finding, [candidate.graph === undefined ? "missing-evidence" : "invalid-evidence", ...validation.issues], mandatory);
  const graph = validation.graph;
  if (graph.claim.fingerprint !== fingerprintFindingClaim(finding)) return downgrade(finding, ["claim-mismatch"], mandatory, graph);
  const knownFiles = new Set(context.knownFiles.map(normalizePath));
  if (finding.location === undefined || !knownFiles.has(normalizePath(finding.location.file)) ||
    !positiveLine(finding.location.line)) return downgrade(finding, ["unknown-file"], mandatory, graph);

  // Equal IDs alone prove nothing: the complete fact metadata and canonical
  // conclusion binding must agree with independently supplied analyzer facts.
  const trusted = graph.nodes.filter((node) =>
    node.claimFingerprint === graph.claim.fingerprint &&
    (node.location === undefined || knownFiles.has(normalizePath(node.location.file))) &&
    context.trustedEvidenceNodes.some((canonical) => sameNode(node, canonical)),
  );
  const supportingIds = new Set(trusted.filter((node) => node.assertion === "supports").map((node) => node.id));
  const contradictingIds = new Set(trusted.filter((node) => node.assertion === "contradicts").map((node) => node.id));
  if (graph.edges.some((edge) => edge.to === graph.claim.id && edge.relation === "contradicts" && contradictingIds.has(edge.from))) {
    return { action: "reject", reasons: ["claim-contradicted", ...(mandatory ? ["mandatory-control-unverified"] : [])], evidenceGraph: graph };
  }
  if (!graph.edges.some((edge) => edge.to === graph.claim.id && edge.relation === "supports" && supportingIds.has(edge.from))) {
    return downgrade(finding, ["missing-support"], mandatory, graph);
  }
  return applyCounterexamples(finding, graph, trusted, context, mandatory);
}

function applyCounterexamples(
  finding: ReviewFinding,
  graph: FindingEvidenceGraph,
  trusted: readonly FindingEvidenceNode[],
  context: FindingVerificationContext,
  mandatory: boolean,
): FindingVerificationResult {
  const trustedIds = new Set(trusted.map((node) => node.id));
  const reasons: string[] = ["claim-supported"];
  let advisory = false;
  for (const predicate of context.counterexamples.filter((entry) => entry.ruleId === finding.ruleId)) {
    try {
      const result = predicate.evaluate({ finding: immutableFinding(finding), graph: immutableGraph(graph), trustedEvidenceNodes: immutableGraph({ ...graph, nodes: trusted }).nodes });
      if (result === undefined) continue;
      if (!validCounterexample(result) || result.evidenceNodeIds.some((id) => !trustedIds.has(id))) {
        reasons.push(`counterexample-unverified:${predicate.id}`);
        continue;
      }
      if (mandatory) {
        reasons.push(`mandatory-counterexample-retained:${predicate.id}`);
        continue;
      }
      reasons.push(`counterexample:${predicate.id}:${result.reasonCode}`);
      if (result.action === "reject") return { action: "reject", reasons, evidenceGraph: graph };
      advisory = true;
    } catch {
      reasons.push(`counterexample-failed:${predicate.id}`);
      advisory = !mandatory || advisory;
    }
  }
  return advisory ? downgrade(finding, reasons, mandatory, graph) : { action: "publish", finding: { ...finding }, reasons, evidenceGraph: graph };
}

function sameNode(left: FindingEvidenceNode, right: FindingEvidenceNode): boolean {
  return left.id === right.id && left.kind === right.kind && left.reference === right.reference &&
    left.claimFingerprint === right.claimFingerprint && left.assertion === right.assertion &&
    normalizePath(left.location?.file ?? "") === normalizePath(right.location?.file ?? "") &&
    left.location?.line === right.location?.line && left.location?.column === right.location?.column;
}

function validCounterexample(value: CounterexampleResult): boolean {
  return (value.action === "reject" || value.action === "downgrade") && IDENTIFIER.test(value.reasonCode) &&
    Array.isArray(value.evidenceNodeIds) && value.evidenceNodeIds.length > 0 && value.evidenceNodeIds.length <= 256 &&
    value.evidenceNodeIds.every((id) => typeof id === "string");
}

function downgrade(finding: ReviewFinding, reasons: readonly string[], mandatory: boolean, graph?: FindingEvidenceGraph): FindingVerificationResult {
  return {
    action: "downgrade",
    finding: { ...finding, severity: "info", confidence: Number.isFinite(finding.confidence) ? Math.min(0.4, Math.max(0, finding.confidence)) : 0 },
    reasons: [...reasons, ...(mandatory ? ["mandatory-control-unverified"] : [])],
    evidenceGraph: graph,
  };
}

function immutableFinding(finding: ReviewFinding): Readonly<ReviewFinding> {
  return Object.freeze({
    ...finding,
    location: finding.location === undefined ? undefined : Object.freeze({ ...finding.location }),
    evidence: finding.evidence === undefined ? undefined : Object.freeze({
      ...finding.evidence,
      provenance: Object.freeze(finding.evidence.provenance.map((reference) => Object.freeze({ ...reference }))),
    }),
  });
}
function immutableGraph(graph: FindingEvidenceGraph): FindingEvidenceGraph {
  return Object.freeze({
    ...graph, claim: Object.freeze({ ...graph.claim }),
    nodes: Object.freeze(graph.nodes.map((node) => Object.freeze({ ...node, location: node.location === undefined ? undefined : Object.freeze({ ...node.location }) }))),
    edges: Object.freeze(graph.edges.map((edge) => Object.freeze({ ...edge }))),
  });
}
function positiveLine(line: number | undefined): boolean { return line !== undefined && Number.isSafeInteger(line) && line > 0; }
function normalizePath(path: string): string { return path.replace(/\\/g, "/").replace(/^\.\//, ""); }
