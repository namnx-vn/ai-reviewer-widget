import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../../ast/parser";
import { createSecurityFindingId } from "../engine/finding-id";
import type { SecurityFinding, SecurityRuleMeta } from "../model/types";
import type { SupplyChainManifest, SupplyChainRepository } from "./types";

type SupplyChainKind = "git-dependency" | "http-dependency" | "install-script" | "dynamic-require" | "lockfile-missing" | "unpinned-critical-source";

interface Match {
  readonly kind: SupplyChainKind;
  readonly path: string;
  readonly range?: readonly [number, number];
  readonly detail: string;
}

const METADATA: Readonly<Record<SupplyChainKind, SecurityRuleMeta>> = {
  "git-dependency": meta("security.supply-chain.git-dependency", "Git dependency source", "medium", "CWE-829"),
  "http-dependency": meta("security.supply-chain.http-dependency", "HTTP dependency source", "high", "CWE-494"),
  "install-script": meta("security.supply-chain.install-script", "Dependency lifecycle script", "medium", "CWE-829"),
  "dynamic-require": meta("security.supply-chain.dynamic-require", "Dynamic module loading", "medium", "CWE-829"),
  "lockfile-missing": meta("security.supply-chain.lockfile-missing", "Missing dependency lockfile", "medium", "CWE-829"),
  "unpinned-critical-source": meta("security.supply-chain.unpinned-critical-source", "Unpinned critical dependency", "high", "CWE-829"),
};

const LIFECYCLE_SCRIPTS = new Set(["preinstall", "install", "postinstall", "preprepare", "prepare", "postprepare"]);
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

/** Runs deterministic, offline supply-chain checks against caller-provided metadata. */
export function analyzeSupplyChain(repository: SupplyChainRepository): readonly SecurityFinding[] {
  const matches: Match[] = [
    ...analyzeManifests(repository.manifests, repository.criticalSources ?? []),
    ...analyzeLockfiles(repository.manifests, repository.lockfiles.map((lockfile) => lockfile.path)),
    ...analyzeSourceFiles(repository),
  ];

  return matches
    .sort(compareMatches)
    .map(createFinding);
}

function analyzeManifests(manifests: readonly SupplyChainManifest[], criticalSources: readonly string[]): readonly Match[] {
  const critical = new Set(criticalSources);
  return manifests.flatMap((manifest) => {
    const matches: Match[] = [];
    for (const [name, version] of dependenciesOf(manifest)) {
      if (isGitDependency(version)) matches.push({ kind: "git-dependency", path: manifest.path, detail: name });
      if (isHttpDependency(version)) matches.push({ kind: "http-dependency", path: manifest.path, detail: name });
      if (critical.has(name) && !isExactVersion(version)) matches.push({ kind: "unpinned-critical-source", path: manifest.path, detail: name });
    }
    for (const script of Object.keys(manifest.scripts ?? {})) {
      if (LIFECYCLE_SCRIPTS.has(script)) matches.push({ kind: "install-script", path: manifest.path, detail: script });
    }
    return matches;
  });
}

function analyzeLockfiles(manifests: readonly SupplyChainManifest[], lockfilePaths: readonly string[]): readonly Match[] {
  return manifests
    .filter((manifest) => !hasLockfileForManifest(manifest.path, lockfilePaths))
    .map((manifest) => ({ kind: "lockfile-missing" as const, path: manifest.path, detail: "package manifest" }));
}

function analyzeSourceFiles(repository: SupplyChainRepository): readonly Match[] {
  return repository.sourceFiles.flatMap((file) => {
    if (!SOURCE_FILE_PATTERN.test(file.path)) return [];
    const matches: Match[] = [];
    const ast = file.ast ?? parseSource(file.source);
    visit(ast, (node) => {
      if (isDynamicModuleLoad(node)) {
        matches.push({ kind: "dynamic-require", path: file.path, range: node.range === undefined ? undefined : [node.range[0], node.range[1]], detail: "module expression" });
      }
    });
    return matches;
  });
}

function createFinding(match: Match): SecurityFinding {
  const metaForMatch = METADATA[match.kind];
  const location = {
    path: match.path,
    range: match.range === undefined ? undefined : { start: match.range[0], end: match.range[1] },
  };
  return {
    id: createSecurityFindingId({ ruleId: metaForMatch.id, path: match.path, range: location.range }),
    ruleId: metaForMatch.id,
    title: metaForMatch.title,
    message: messageFor(match.kind, match.detail),
    severity: metaForMatch.defaultSeverity,
    confidence: "high",
    category: "supply-chain",
    location,
    evidence: [{ message: `Detected ${messageFor(match.kind, match.detail).toLowerCase()} without retaining external values.`, location }],
    standards: metaForMatch.standards,
    suggestion: suggestionFor(match.kind),
  };
}

function meta(id: string, title: string, severity: SecurityRuleMeta["defaultSeverity"], cwe: string): SecurityRuleMeta {
  return { id, title, description: `Detects ${title.toLowerCase()} using offline repository metadata.`, category: "supply-chain", defaultSeverity: severity, defaultConfidence: "high", standards: [{ standard: "cwe", id: cwe }] };
}

function dependenciesOf(manifest: SupplyChainManifest): readonly [string, string][] {
  const groups = [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies, manifest.peerDependencies];
  const values = new Map<string, string>();
  for (const group of groups) for (const [name, version] of Object.entries(group ?? {})) values.set(name, version);
  return [...values.entries()];
}
function isGitDependency(version: string): boolean { return /^(?:git\+|github:|git:|git@)/i.test(version); }
function isHttpDependency(version: string): boolean { return /^http:\/\//i.test(version); }
function isExactVersion(version: string): boolean { return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version); }
function hasLockfileForManifest(manifestPath: string, lockfilePaths: readonly string[]): boolean {
  return lockfilePaths.some((path) => {
    const directory = path.slice(0, Math.max(0, path.lastIndexOf("/") + 1));
    return manifestPath.startsWith(directory);
  });
}
function isDynamicModuleLoad(node: TSESTree.Node): boolean {
  if (node.type === "ImportExpression") return node.source.type !== "Literal" || typeof node.source.value !== "string";
  return node.type === "CallExpression" && node.callee.type === "Identifier" && node.callee.name === "require" && (node.arguments.length !== 1 || !isStringLiteral(node.arguments[0]));
}
function isStringLiteral(node: TSESTree.CallExpressionArgument | TSESTree.Expression | TSESTree.SpreadElement): boolean { return node.type === "Literal" && typeof node.value === "string"; }
function visit(node: TSESTree.Node, visitor: (node: TSESTree.Node) => void): void { visitor(node); for (const value of Object.values(node)) { if (isNode(value)) visit(value, visitor); else if (Array.isArray(value)) for (const item of value) if (isNode(item)) visit(item, visitor); } }
function isNode(value: unknown): value is TSESTree.Node { return typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"; }
function compareMatches(left: Match, right: Match): number { return left.path.localeCompare(right.path) || (left.range?.[0] ?? -1) - (right.range?.[0] ?? -1) || METADATA[left.kind].id.localeCompare(METADATA[right.kind].id) || left.detail.localeCompare(right.detail); }
function messageFor(kind: SupplyChainKind, detail: string): string { const subject = detail ? ` for \`${detail}\`` : ""; return ({ "git-dependency": `Git-based dependency source detected${subject}.`, "http-dependency": `Unencrypted HTTP dependency source detected${subject}.`, "install-script": `Package lifecycle script \`${detail}\` can execute during installation.`, "dynamic-require": "Module is loaded from a non-literal expression.", "lockfile-missing": "No lockfile was provided for this package manifest.", "unpinned-critical-source": `Critical dependency is not pinned to an exact version${subject}.` })[kind]; }
function suggestionFor(kind: SupplyChainKind): string { return ({ "git-dependency": "Use a registry package with a reviewed, immutable version where possible.", "http-dependency": "Use HTTPS or a trusted package registry source.", "install-script": "Review lifecycle scripts and minimize installation-time code execution.", "dynamic-require": "Resolve module names from an allowlist of literal module specifiers.", "lockfile-missing": "Commit the workspace lockfile used for reproducible installs.", "unpinned-critical-source": "Pin this critical dependency to an exact reviewed version." })[kind]; }
