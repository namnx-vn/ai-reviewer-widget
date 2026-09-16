import type { ReviewFinding, ReviewLocation } from "./contracts";
import { fingerprintFindingIdentity } from "./lifecycle";

export type EvidenceKind = "ast" | "symbol" | "scope" | "call" | "data-flow" | "control-flow" | "configuration" | "import" | "history";
export type EvidenceRelation = "supports" | "contradicts" | "declares" | "contains" | "calls" | "flows-to" | "imports";

/** Metadata only. References identify facts; source snippets are deliberately absent. */
export interface FindingEvidenceNode {
  readonly id: string;
  readonly kind: EvidenceKind;
  readonly reference: string;
  readonly location?: Readonly<ReviewLocation>;
  readonly claimFingerprint?: string;
  readonly assertion?: "supports" | "contradicts";
}

export interface FindingEvidenceGraph {
  readonly schemaVersion: 1;
  readonly claim: { readonly id: string; readonly fingerprint: string };
  readonly nodes: readonly FindingEvidenceNode[];
  readonly edges: readonly {
    readonly from: string;
    readonly to: string;
    readonly relation: EvidenceRelation;
  }[];
}

export interface FindingEvidenceValidation {
  readonly valid: boolean;
  readonly graph?: FindingEvidenceGraph;
  readonly issues: readonly string[];
}

const KINDS: readonly string[] = ["ast", "symbol", "scope", "call", "data-flow", "control-flow", "configuration", "import", "history"];
const RELATIONS: readonly string[] = ["supports", "contradicts", "declares", "contains", "calls", "flows-to", "imports"];
const MAX_NODES = 256;
const MAX_EDGES = 512;
const METADATA_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:/@#-]{0,299}$/;

/** Unlike lifecycle identity, evidence binding includes exact location and severity. */
export function fingerprintFindingClaim(finding: ReviewFinding): string {
  return fingerprintFindingIdentity({
    ruleId: finding.ruleId,
    path: finding.location?.file ?? "",
    semanticContext: `${finding.source}:${finding.title}`,
    locationClass: `${finding.severity}:${finding.location?.line ?? "missing"}:${finding.location?.column ?? "missing"}`,
    evidence: finding.message,
  });
}

export function createFindingEvidenceGraph(finding: ReviewFinding, node: FindingEvidenceNode): FindingEvidenceGraph {
  const fingerprint = fingerprintFindingClaim(finding);
  const claim = { id: `claim:${fingerprint}`, fingerprint };
  return {
    schemaVersion: 1,
    claim,
    nodes: [{ ...node, location: node.location === undefined ? undefined : { ...node.location }, claimFingerprint: fingerprint, assertion: node.assertion ?? "supports" }],
    edges: [{ from: node.id, to: claim.id, relation: node.assertion ?? "supports" }],
  };
}

/** Structural validity establishes no semantic truth; callers must corroborate facts. */
export function validateFindingEvidenceGraph(input: unknown): FindingEvidenceValidation {
  try {
    if (!record(input) || !keys(input, ["schemaVersion", "claim", "nodes", "edges"]) || input.schemaVersion !== 1) return invalid("invalid-schema");
    const claim = parseClaim(input.claim);
    if (claim === undefined) return invalid("invalid-claim");
    if (!Array.isArray(input.nodes) || input.nodes.length > MAX_NODES || !Array.isArray(input.edges) || input.edges.length > MAX_EDGES) return invalid("graph-budget-exceeded");
    const nodes: FindingEvidenceNode[] = [];
    const ids = new Set([claim.id]);
    for (const value of input.nodes) {
      const node = parseNode(value);
      if (node === undefined || ids.has(node.id)) return invalid("invalid-or-duplicate-node");
      ids.add(node.id);
      nodes.push(node);
    }
    const edges: FindingEvidenceGraph["edges"][number][] = [];
    const edgeIds = new Set<string>();
    for (const value of input.edges) {
      const edge = parseEdge(value);
      if (edge === undefined || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return invalid("invalid-edge-endpoint");
      const edgeId = `${edge.from}:${edge.relation}:${edge.to}`;
      if (edgeIds.has(edgeId)) return invalid("duplicate-edge");
      edgeIds.add(edgeId);
      if ((edge.relation === "supports" || edge.relation === "contradicts") && edge.to !== claim.id) return invalid("invalid-claim-edge");
      if (edge.from === claim.id) return invalid("invalid-claim-edge");
      edges.push(edge);
    }
    return { valid: true, graph: { schemaVersion: 1, claim, nodes, edges }, issues: [] };
  } catch {
    return invalid("evidence-validation-failed");
  }
}

function parseClaim(input: unknown): FindingEvidenceGraph["claim"] | undefined {
  if (!record(input) || !keys(input, ["id", "fingerprint"]) || !metadataId(input.id) || !fingerprint(input.fingerprint) || input.id !== `claim:${input.fingerprint}`) return undefined;
  return { id: input.id, fingerprint: input.fingerprint };
}

function parseNode(input: unknown): FindingEvidenceNode | undefined {
  if (!record(input) || !keys(input, ["id", "kind", "reference", "location", "claimFingerprint", "assertion"]) || !metadataId(input.id) || !evidenceKind(input.kind) || !metadataId(input.reference)) return undefined;
  if (input.claimFingerprint !== undefined && !fingerprint(input.claimFingerprint)) return undefined;
  if (input.assertion !== undefined && input.assertion !== "supports" && input.assertion !== "contradicts") return undefined;
  const location = input.location === undefined ? undefined : parseLocation(input.location);
  if (input.location !== undefined && location === undefined) return undefined;
  return { id: input.id, kind: input.kind, reference: input.reference, location, claimFingerprint: input.claimFingerprint, assertion: input.assertion };
}

function parseLocation(input: unknown): Readonly<ReviewLocation> | undefined {
  if (!record(input) || !keys(input, ["file", "line", "column"]) || !relativePath(input.file)) return undefined;
  if (input.line !== undefined && !positiveInteger(input.line)) return undefined;
  if (input.column !== undefined && !positiveInteger(input.column)) return undefined;
  return { file: input.file.replace(/\\/g, "/").replace(/^\.\//, ""), line: input.line, column: input.column };
}

function parseEdge(input: unknown): FindingEvidenceGraph["edges"][number] | undefined {
  if (!record(input) || !keys(input, ["from", "to", "relation"]) || !metadataId(input.from) || !metadataId(input.to) || !relation(input.relation)) return undefined;
  return { from: input.from, to: input.to, relation: input.relation };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
function metadataId(value: unknown): value is string { return typeof value === "string" && METADATA_ID.test(value); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && /^finding-v1-[a-f0-9]{16}$/.test(value); }
function evidenceKind(value: unknown): value is EvidenceKind { return typeof value === "string" && KINDS.includes(value); }
function relation(value: unknown): value is EvidenceRelation { return typeof value === "string" && RELATIONS.includes(value); }
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function relativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000 || [...value].some((character) => character.charCodeAt(0) < 32)) return false;
  const path = value.replace(/\\/g, "/").replace(/^\.\//, "");
  return !path.startsWith("/") && !/^[a-zA-Z]:/.test(path) && path.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
function invalid(issue: string): FindingEvidenceValidation { return { valid: false, issues: [issue] }; }
