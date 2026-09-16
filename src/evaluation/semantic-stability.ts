import ts from "typescript";
import type { ReviewUseCases, SourceFile } from "../application/review";
import type { ReviewFinding, ReviewResult } from "../domain/review";
import { isSourceFile } from "../analyzer";
import { parseRepositoryReviewInput } from "./repository-review";

export const SEMANTIC_STABILITY_VERSION = 1 as const;
export type SemanticTransformation = "formatting" | "comments" | "type-import-order" | "identifier-rename";
export interface AdversarialExpectation {
  readonly kind: "must-find" | "must-not-find";
  readonly ruleId: string;
  readonly file?: string;
  readonly rationale: string;
}
export interface ParameterRename {
  readonly file: string;
  readonly functionName: string;
  readonly from: string;
  readonly to: string;
}
export interface SemanticStabilityCase {
  readonly id: string;
  readonly category: string;
  readonly files: readonly SourceFile[];
  readonly expectations: readonly AdversarialExpectation[];
  readonly transformations: readonly SemanticTransformation[];
  readonly rename?: ParameterRename;
}
export interface SemanticStabilityCorpus {
  readonly version: typeof SEMANTIC_STABILITY_VERSION;
  readonly id: string;
  readonly fidelity: "synthetic-offline";
  readonly cases: readonly SemanticStabilityCase[];
}
export interface SemanticTransformationResult {
  readonly status: "supported" | "unsupported";
  readonly reason?: string;
  readonly files: readonly SourceFile[];
  readonly rename?: ParameterRename;
}
export interface SemanticComparison {
  readonly transformation: SemanticTransformation;
  readonly status: "stable" | "changed" | "unsupported" | "incomplete";
  readonly reason?: string;
  readonly missing: readonly string[];
  readonly added: readonly string[];
}
export interface SemanticStabilityCaseReport {
  readonly id: string;
  readonly category: string;
  readonly expectations: readonly (AdversarialExpectation & { readonly detected: boolean; readonly satisfied: boolean })[];
  readonly identicalInputStable: boolean;
  readonly comparisons: readonly SemanticComparison[];
  readonly diagnostics: readonly string[];
  readonly status: "passed" | "failed" | "incomplete";
}
export interface SemanticStabilityReport {
  readonly schemaVersion: 1;
  readonly corpusVersion: 1;
  readonly corpusId: string;
  readonly fidelity: "synthetic-offline";
  readonly repetitions: number;
  readonly cases: readonly SemanticStabilityCaseReport[];
  readonly summary: {
    readonly caseCount: number;
    readonly supportedComparisons: number;
    readonly stableComparisons: number;
    readonly semanticStability: number | null;
    readonly unstableCases: number;
    readonly falseNegatives: number;
    readonly falsePositives: number;
    readonly status: "passed" | "failed" | "incomplete";
    readonly evidenceStatus: "insufficient-evidence";
    readonly broadQualityGuarantee: false;
    readonly evidenceReason: string;
  };
}

function ast(file: SourceFile): ts.SourceFile {
  return ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function reorderTypeImports(file: SourceFile): string | undefined {
  const tree = ast(file);
  const imports = tree.statements.filter(ts.isImportDeclaration);
  if (imports.length < 2 || imports.some((node) => node.importClause?.isTypeOnly !== true)) return undefined;
  if (imports.some((node, index) => index > 0 && !/^\s*$/.test(file.content.slice(imports[index - 1].end, node.getStart(tree))))) return undefined;
  const start = imports[0].getStart(tree), end = imports[imports.length - 1].end;
  return file.content.slice(0, start) + [...imports].reverse().map((node) => file.content.slice(node.getStart(tree), node.end)).join("\n") + file.content.slice(end);
}

/** Only a non-exported function's simple parameter, without nested scopes/dynamic eval or observable keys. */
function renameParameter(file: SourceFile, rename: ParameterRename): string | undefined {
  if (![rename.from, rename.to].every((name) => /^[A-Za-z_$][\w$]*$/.test(name)) || rename.from === rename.to) return undefined;
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard);
  if (![rename.from, rename.to].every((name) => { scanner.setText(name); return scanner.scan() === ts.SyntaxKind.Identifier && scanner.scan() === ts.SyntaxKind.EndOfFileToken; })) return undefined;
  const tree = ast(file);
  const functions = tree.statements.filter(ts.isFunctionDeclaration).filter((node) => node.name?.text === rename.functionName);
  if (functions.length !== 1) return undefined;
  const fn = functions[0];
  if (fn.body === undefined || fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword)) return undefined;
  const parameter = fn.parameters.find((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === rename.from);
  if (parameter === undefined || parameter.initializer !== undefined || parameter.dotDotDotToken !== undefined) return undefined;
  const edits: { start: number; end: number }[] = [];
  let unsafe = false;
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "eval") unsafe = true;
    if (node !== fn && node.pos >= fn.pos && node.end <= fn.end && (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isCatchClause(node))) unsafe = true;
    if (ts.isIdentifier(node)) {
      if (node.text === rename.to) unsafe = true;
      if (node.text === rename.from) {
        const parent = node.parent;
        if (node.pos < fn.pos || node.end > fn.end) unsafe = true;
        else if ((ts.isPropertyAccessExpression(parent) && parent.name === node)
          || (ts.isPropertyAssignment(parent) && parent.name === node)
          || ts.isShorthandPropertyAssignment(parent) || ts.isBindingElement(parent)
          || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent) || ts.isEnumMember(parent)
          || ts.isJsxAttribute(parent) || ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)
          || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
          || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)
          || (ts.isVariableDeclaration(parent) && parent.name === node)
          || (ts.isParameter(parent) && parent !== parameter) || (ts.isFunctionDeclaration(parent) && parent.name === node)
          || ts.isTypeReferenceNode(parent) || ts.isLabeledStatement(parent)) unsafe = true;
        else edits.push({ start: node.getStart(tree), end: node.end });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (unsafe || edits.length < 2) return undefined;
  return edits.sort((a, b) => b.start - a.start).reduce((content, edit) => content.slice(0, edit.start) + rename.to + content.slice(edit.end), file.content);
}

export function applySemanticTransformation(item: SemanticStabilityCase, transformation: string): SemanticTransformationResult {
  let applied = 0;
  let reason: string | undefined;
  const files = item.files.map((file) => {
    if (!isSourceFile(file.path)) return file;
    if (file.content.startsWith("#!")) { reason = "Hashbang sources are outside this transformation's supported subset."; return file; }
    let content: string | undefined;
    if (transformation === "formatting") content = `\n\n${file.content}`;
    else if (transformation === "comments") content = `/* Additional documentation. */\n${file.content}`;
    else if (transformation === "type-import-order") content = reorderTypeImports(file);
    else if (transformation === "identifier-rename" && item.rename?.file === file.path) content = renameParameter(file, item.rename);
    if (content === undefined) return file;
    applied += 1;
    return { ...file, content, patch: undefined, changedLines: undefined };
  });
  // A transformation is atomic: never call a partially transformed capture fully supported.
  if (reason !== undefined || applied === 0) return {
    status: "unsupported", files: item.files,
    reason: reason ?? "No safe transformation applies: runtime imports, helper rewrites and unrestricted binding renames are unsupported.",
  };
  return { status: "supported", files, rename: transformation === "identifier-rename" ? item.rename : undefined };
}

function semanticFinding(finding: ReviewFinding, rename?: ParameterRename): string {
  const normalize = (value: string | undefined) => value === undefined ? undefined : rename === undefined || finding.location?.file !== rename.file ? value
    : value.replace(new RegExp(`(?<![\\w$])${rename.to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`, "g"), rename.from);
  return JSON.stringify([finding.ruleId, finding.source, finding.severity, finding.confidence, finding.location?.file,
    normalize(finding.title), normalize(finding.message), normalize(finding.suggestion), finding.evidence?.status]);
}
function difference(before: readonly string[], after: readonly string[]): readonly string[] {
  const remaining = [...after];
  return before.filter((item) => { const index = remaining.indexOf(item); if (index < 0) return true; remaining.splice(index, 1); return false; });
}
function repeatedIdentity(result: ReviewResult): string {
  return JSON.stringify({ score: result.score, decision: result.decision, stats: result.stats,
    findings: result.findings.map((finding) => JSON.stringify(finding)).sort(),
    warnings: result.warnings.map((warning) => JSON.stringify(warning)).sort(), securityQualityGate: result.securityQualityGate });
}
function evaluateCase(useCases: ReviewUseCases, item: SemanticStabilityCase, repetitions: number): SemanticStabilityCaseReport {
  const first = useCases.reviewFiles(item.files);
  const identicalInputStable = Array.from({ length: repetitions - 1 }, () => useCases.reviewFiles(item.files))
    .every((result) => repeatedIdentity(first) === repeatedIdentity(result));
  const diagnostics = first.warnings.map(({ code }) => code);
  const identities = first.findings.map((finding) => semanticFinding(finding));
  const expectations = item.expectations.map((expectation) => {
    const detected = first.findings.some((finding) => finding.ruleId === expectation.ruleId && (expectation.file === undefined || finding.location?.file === expectation.file));
    return { ...expectation, detected, satisfied: expectation.kind === "must-find" ? detected : !detected };
  });
  const comparisons = item.transformations.map((transformation): SemanticComparison => {
    const transformed = applySemanticTransformation(item, transformation);
    if (transformed.status === "unsupported") return { transformation, status: "unsupported", reason: transformed.reason, missing: [], added: [] };
    const result = useCases.reviewFiles(transformed.files);
    if (result.warnings.length > 0 || first.warnings.length > 0) return { transformation, status: "incomplete", missing: [], added: [], reason: "Review pipeline diagnostics prevent a complete semantic comparison." };
    const actual = result.findings.map((finding) => semanticFinding(finding, transformed.rename));
    const missing = difference(identities, actual), added = difference(actual, identities);
    return { transformation, status: missing.length === 0 && added.length === 0 && first.score === result.score && first.decision === result.decision ? "stable" : "changed", missing, added };
  });
  return { id: item.id, category: item.category, expectations, identicalInputStable, comparisons, diagnostics,
    status: diagnostics.length > 0 || comparisons.some(({ status }) => status === "incomplete") ? "incomplete"
      : !identicalInputStable || expectations.some(({ satisfied }) => !satisfied) || comparisons.some(({ status }) => status === "changed") ? "failed" : "passed" };
}

export function runSemanticStabilityEvaluation(
  useCases: ReviewUseCases, corpus: SemanticStabilityCorpus, options: { readonly repetitions?: number } = {},
): SemanticStabilityReport {
  const repetitions = options.repetitions ?? 3;
  if (!Number.isInteger(repetitions) || repetitions < 2 || repetitions > 20) throw new Error("Repetitions must be between 2 and 20.");
  if (corpus.version !== 1 || corpus.fidelity !== "synthetic-offline") throw new Error("Unsupported semantic corpus version/fidelity.");
  if (corpus.cases.length === 0 || new Set(corpus.cases.map(({ id }) => id)).size !== corpus.cases.length) throw new Error("Corpus requires unique, nonempty cases.");
  const cases = corpus.cases.map((item) => evaluateCase(useCases, item, repetitions));
  const comparisons = cases.flatMap(({ comparisons }) => comparisons);
  const supported = comparisons.filter(({ status }) => status !== "unsupported");
  const stable = supported.filter(({ status }) => status === "stable");
  const expectations = cases.flatMap(({ expectations }) => expectations);
  return { schemaVersion: 1, corpusVersion: 1, corpusId: corpus.id, fidelity: corpus.fidelity, repetitions, cases,
    summary: { caseCount: cases.length, supportedComparisons: supported.length, stableComparisons: stable.length,
      semanticStability: supported.length === 0 ? null : stable.length / supported.length,
      unstableCases: cases.filter(({ identicalInputStable }) => !identicalInputStable).length,
      falseNegatives: expectations.filter(({ kind, satisfied }) => kind === "must-find" && !satisfied).length,
      falsePositives: expectations.filter(({ kind, satisfied }) => kind === "must-not-find" && !satisfied).length,
      status: cases.some(({ status }) => status === "incomplete") ? "incomplete" : cases.some(({ status }) => status === "failed") ? "failed" : "passed",
      evidenceStatus: "insufficient-evidence", broadQualityGuarantee: false,
      evidenceReason: "Small hand-authored synthetic corpus measures only the supported transformation subset; it cannot establish 99% semantic stability on representative real repositories." } };
}

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected corpus object.");
  const item = Object.fromEntries(Object.entries(value));
  if (Object.keys(item).some((key) => !allowed.includes(key))) throw new Error("Unknown corpus field.");
  return item;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Expected a nonempty corpus string.");
  return value;
}
function list<T>(value: unknown, parse: (value: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) throw new Error("Expected corpus array.");
  return value.map((item: unknown) => parse(item));
}
function transformation(value: unknown): SemanticTransformation {
  if (value !== "formatting" && value !== "comments" && value !== "type-import-order" && value !== "identifier-rename") throw new Error("Unknown corpus transformation.");
  return value;
}
function parseCase(value: unknown): SemanticStabilityCase {
  const item = object(value, ["id", "category", "files", "expectations", "transformations", "rename"]);
  const files = list(item.files, (value) => { const file = object(value, ["path", "content"]); return { path: text(file.path), content: typeof file.content === "string" ? file.content : text(file.content) }; });
  parseRepositoryReviewInput({ repositoryId: "offline", snapshotId: "snapshot", files, expectedPaths: files.map(({ path }) => path), expectedFindings: [] });
  const rename = item.rename === undefined ? undefined : object(item.rename, ["file", "functionName", "from", "to"]);
  const transformations = list(item.transformations, transformation);
  if (new Set(transformations).size !== transformations.length) throw new Error("Case transformations must be unique.");
  if (rename !== undefined && !files.some(({ path }) => path === rename.file)) throw new Error("Rename target must be in the capture.");
  return { id: text(item.id), category: text(item.category), files, transformations,
    rename: rename === undefined ? undefined : { file: text(rename.file), functionName: text(rename.functionName), from: text(rename.from), to: text(rename.to) },
    expectations: list(item.expectations, (value) => { const expectation = object(value, ["kind", "ruleId", "file", "rationale"]);
      if (expectation.kind !== "must-find" && expectation.kind !== "must-not-find") throw new Error("Invalid corpus expectation.");
      if (expectation.file !== undefined && !files.some(({ path }) => path === expectation.file)) throw new Error("Expectation target must be in the capture.");
      return { kind: expectation.kind, ruleId: text(expectation.ruleId), file: expectation.file === undefined ? undefined : text(expectation.file), rationale: text(expectation.rationale) }; }) };
}
export function parseAdversarialCorpus(value: unknown): SemanticStabilityCorpus {
  const item = object(value, ["version", "id", "fidelity", "cases"]);
  if (item.version !== 1 || item.fidelity !== "synthetic-offline") throw new Error("Unsupported adversarial corpus version/fidelity.");
  const cases = list(item.cases, parseCase);
  if (cases.length === 0 || new Set(cases.map(({ id }) => id)).size !== cases.length) throw new Error("Corpus requires unique, nonempty cases.");
  return { version: 1, fidelity: "synthetic-offline", id: text(item.id), cases };
}
