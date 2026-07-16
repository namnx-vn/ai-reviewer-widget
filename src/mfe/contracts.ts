import type { ReviewFinding } from "../review/types";
import {
  buildDependencyGraph,
} from "../analyzer/architecture/analyzer";
import type { ImportEdge } from "../analyzer/architecture/types";
import type { MicroFrontendSourceFile } from "./types";

export function analyzeRemoteContracts(
  files: readonly MicroFrontendSourceFile[],
): ReviewFinding[] {
  const graph = buildDependencyGraph(files);

  return graph.edges.flatMap((edge) => [
    ...findRemoteHostImport(edge),
    ...findPrivateRemoteImport(edge),
    ...findSharedStateImport(edge),
  ]);
}

function findRemoteHostImport(edge: ImportEdge): ReviewFinding[] {
  if (!isRemotePath(edge.from) || !edge.specifier.startsWith("@host/")) {
    return [];
  }

  return [createFinding(
    "mfe.remote-imports-host",
    "Remote imports host implementation",
    "A remote imports host-owned code directly, creating a reverse dependency across the Micro Frontend boundary.",
    "Depend on a shared contract package or pass the required capability through the host-to-remote integration boundary.",
    edge,
  )];
}

function findPrivateRemoteImport(edge: ImportEdge): ReviewFinding[] {
  if (!isPrivateRemoteImport(edge.specifier)) {
    return [];
  }

  return [createFinding(
    "mfe.remote-deep-import",
    "Host imports a remote internal module",
    "This import reaches into a remote's internal implementation instead of its public contract, coupling applications to an unstable boundary.",
    "Expose the required capability from the remote's public entrypoint and import that contract instead.",
    edge,
  )];
}

function findSharedStateImport(edge: ImportEdge): ReviewFinding[] {
  if (!isMicroFrontendApplicationPath(edge.from)) {
    return [];
  }

  const target = edge.resolvedPath ?? edge.specifier;

  if (!isSharedStatePath(target)) {
    return [];
  }

  return [createFinding(
    "mfe.shared-state-cross-boundary",
    "Shared mutable state crosses application boundary",
    "A Micro Frontend imports shared mutable state directly, which can couple independently deployed applications through hidden runtime state.",
    "Move cross-application state behind an explicit event, API, or host-owned integration contract instead of importing the store directly.",
    edge,
  )];
}

function isRemotePath(path: string): boolean {
  return /(^|\/)(remote|remotes)(\/|$)/.test(path.replace(/\\/g, "/"));
}

function isMicroFrontendApplicationPath(path: string): boolean {
  return /(^|\/)(host|remote|remotes)(\/|$)/.test(path.replace(/\\/g, "/"));
}

function isPrivateRemoteImport(specifier: string): boolean {
  const segments = specifier.split("/");

  return (
    segments[0] === "@remote" &&
    segments.length > 2 &&
    (segments.includes("internal") || segments.includes("src"))
  );
}

function isSharedStatePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");

  return /(^|\/|@)shared\/(?:state|store|stores)(?:\/|$)/.test(normalized);
}

function createFinding(
  ruleId: string,
  title: string,
  message: string,
  suggestion: string,
  edge: ImportEdge,
): ReviewFinding {
  return {
    id: [ruleId, edge.from, edge.line, edge.column].join(":"),
    ruleId,
    title,
    message,
    severity: "high",
    source: "architecture",
    confidence: 1,
    location: { file: edge.from, line: edge.line, column: edge.column },
    suggestion,
  };
}
