import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { parseSource } from "../ast/parser";
import type { AnalyzerSourceFile } from "../composition/contracts";
import type {
  RepositoryContext,
  RepositoryDeclaration,
  RepositoryExport,
  RepositoryImport,
  RepositoryImportBinding,
  RepositoryPackage,
  RepositoryProjectSignals,
  RepositoryTsconfig,
} from "./contracts";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;

interface PackageJsonShape {
  readonly name?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

interface TsconfigShape {
  readonly compilerOptions?: {
    readonly baseUrl?: string;
    readonly paths?: Readonly<Record<string, readonly string[]>>;
  };
}

export function buildRepositoryContext(files: readonly AnalyzerSourceFile[]): RepositoryContext {
  const normalizedFiles = files
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const knownFiles = new Set(normalizedFiles.map((file) => file.path));
  const packages = collectPackages(normalizedFiles);
  const tsconfigs = collectTsconfigs(normalizedFiles);
  const resolveImport = (from: string, specifier: string): string | undefined =>
    resolveImportPath(normalizePath(from), specifier, knownFiles, packages, tsconfigs);

  const imports: RepositoryImport[] = [];
  const exports: RepositoryExport[] = [];
  const declarations: RepositoryDeclaration[] = [];

  for (const file of normalizedFiles) {
    if (!isSourceFile(file.path)) continue;
    let program: TSESTree.Program;
    try {
      program = parseSource(file.content);
    } catch {
      continue;
    }

    const fileExports = collectExports(file.path, program, resolveImport);
    exports.push(...fileExports);
    declarations.push(...collectDeclarations(file.path, program, fileExports));
    imports.push(...collectImports(file.path, program, resolveImport));
  }

  const sortedImports = imports.sort(compareImport);
  const sortedExports = exports.sort(compareExport);
  const sortedDeclarations = declarations.sort(compareDeclaration);
  const projectSignals = collectProjectSignals(normalizedFiles, packages);

  function resolveDeclaration(
    file: string,
    exportedName: string,
    visited = new Set<string>(),
  ): RepositoryDeclaration | undefined {
    const normalizedFile = normalizePath(file);
    const visitKey = `${normalizedFile}:${exportedName}`;
    if (visited.has(visitKey)) return undefined;
    visited.add(visitKey);

    const directExport = sortedExports.find((item) =>
      item.from === normalizedFile && item.exportedName === exportedName && item.kind !== "star",
    );
    if (directExport !== undefined) {
      if (directExport.resolvedPath !== undefined) {
        const forwardedName = directExport.localName ?? exportedName;
        return resolveDeclaration(directExport.resolvedPath, forwardedName, visited);
      }
      const localName = directExport.localName ?? exportedName;
      return sortedDeclarations.find((item) => item.file === normalizedFile && item.name === localName);
    }

    if (exportedName === "default") {
      return sortedDeclarations.find((item) =>
        item.file === normalizedFile && item.exported && item.name === "default",
      );
    }

    for (const starExport of sortedExports.filter((item) =>
      item.from === normalizedFile && item.kind === "star" && item.resolvedPath !== undefined,
    )) {
      const declaration = resolveDeclaration(starExport.resolvedPath, exportedName, visited);
      if (declaration !== undefined) return declaration;
    }

    return undefined;
  }

  return {
    files: normalizedFiles.map((file) => file.path),
    imports: sortedImports,
    exports: sortedExports,
    declarations: sortedDeclarations,
    packages,
    tsconfigs,
    projectSignals,
    resolveImport,
    resolveDeclaration: (file, exportedName) => resolveDeclaration(file, exportedName),
    resolveImportedDeclaration(file, localName) {
      const normalizedFile = normalizePath(file);
      const relationship = sortedImports.find((item) =>
        item.from === normalizedFile && item.bindings.some((binding) => binding.localName === localName),
      );
      if (relationship?.resolvedPath === undefined) return undefined;
      const binding = relationship.bindings.find((item) => item.localName === localName);
      if (binding === undefined) return undefined;
      return resolveDeclaration(relationship.resolvedPath, binding.importedName);
    },
  };
}

function collectImports(
  file: string,
  program: TSESTree.Program,
  resolveImport: (from: string, specifier: string) => string | undefined,
): RepositoryImport[] {
  return program.body.flatMap((statement) => {
    if (statement.type !== "ImportDeclaration") return [];
    const bindings: RepositoryImportBinding[] = statement.specifiers.map((specifier) => {
      if (specifier.type === "ImportDefaultSpecifier") {
        return { localName: specifier.local.name, importedName: "default", typeOnly: statement.importKind === "type" };
      }
      if (specifier.type === "ImportNamespaceSpecifier") {
        return { localName: specifier.local.name, importedName: "*", typeOnly: statement.importKind === "type" };
      }
      return {
        localName: specifier.local.name,
        importedName: specifier.imported.type === "Identifier" ? specifier.imported.name : String(specifier.imported.value),
        typeOnly: statement.importKind === "type" || specifier.importKind === "type",
      };
    });
    return [{
      from: file,
      specifier: statement.source.value,
      resolvedPath: resolveImport(file, statement.source.value),
      bindings,
    }];
  });
}

function collectExports(
  file: string,
  program: TSESTree.Program,
  resolveImport: (from: string, specifier: string) => string | undefined,
): RepositoryExport[] {
  const result: RepositoryExport[] = [];
  for (const statement of program.body) {
    if (statement.type === "ExportAllDeclaration") {
      result.push({
        from: file,
        exportedName: "*",
        sourceSpecifier: statement.source.value,
        resolvedPath: resolveImport(file, statement.source.value),
        kind: "star",
      });
      continue;
    }
    if (statement.type === "ExportDefaultDeclaration") {
      result.push({ from: file, exportedName: "default", localName: defaultDeclarationName(statement.declaration), kind: "default" });
      continue;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    const sourceSpecifier = statement.source?.value;
    const resolvedPath = sourceSpecifier === undefined ? undefined : resolveImport(file, sourceSpecifier);
    for (const name of declarationNames(statement.declaration)) {
      result.push({ from: file, exportedName: name, localName: name, kind: "named" });
    }
    for (const specifier of statement.specifiers) {
      const exportedName = specifier.exported.type === "Identifier" ? specifier.exported.name : String(specifier.exported.value);
      const localName = specifier.local.type === "Identifier" ? specifier.local.name : String(specifier.local.value);
      result.push({ from: file, exportedName, localName, sourceSpecifier, resolvedPath, kind: "named" });
    }
  }
  return result;
}

function collectDeclarations(
  file: string,
  program: TSESTree.Program,
  exports: readonly RepositoryExport[],
): RepositoryDeclaration[] {
  const exportedLocalNames = new Set(exports.filter((item) => item.resolvedPath === undefined).map((item) => item.localName));
  const result: RepositoryDeclaration[] = [];
  for (const statement of program.body) {
    const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type === "FunctionDeclaration" && declaration.id !== null) {
      result.push({ file, name: declaration.id.name, kind: "function", exported: exportedLocalNames.has(declaration.id.name) });
    } else if (declaration?.type === "ClassDeclaration" && declaration.id !== null) {
      result.push({ file, name: declaration.id.name, kind: "class", exported: exportedLocalNames.has(declaration.id.name) });
    } else if (declaration?.type === "VariableDeclaration") {
      for (const item of declaration.declarations) {
        if (item.id.type !== "Identifier") continue;
        result.push({ file, name: item.id.name, kind: "variable", exported: exportedLocalNames.has(item.id.name) });
      }
    }
    if (statement.type === "ExportDefaultDeclaration") {
      const name = defaultDeclarationName(statement.declaration);
      if (name !== undefined) {
        const kind = statement.declaration.type === "ClassDeclaration" ? "class" : statement.declaration.type === "FunctionDeclaration" ? "function" : "variable";
        result.push({ file, name: name === "default" ? "default" : name, kind, exported: true });
        if (name !== "default") result.push({ file, name: "default", kind, exported: true });
      }
    }
  }
  return uniqueDeclarations(result);
}

function declarationNames(declaration: TSESTree.ExportNamedDeclaration["declaration"]): readonly string[] {
  if (declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") {
    return declaration.id === null ? [] : [declaration.id.name];
  }
  if (declaration?.type !== "VariableDeclaration") return [];
  return declaration.declarations.flatMap((item) => item.id.type === "Identifier" ? [item.id.name] : []);
}

function defaultDeclarationName(declaration: TSESTree.ExportDefaultDeclaration["declaration"]): string | undefined {
  if (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") {
    return declaration.id?.name ?? "default";
  }
  return "default";
}

function collectPackages(files: readonly AnalyzerSourceFile[]): RepositoryPackage[] {
  return files
    .filter((file) => file.path.endsWith("package.json"))
    .map((file) => {
      const parsed = parsePackageJson(file.content);
      return {
        root: directoryName(file.path),
        packageJsonPath: file.path,
        name: parsed?.name,
      };
    })
    .sort((left, right) => left.root.localeCompare(right.root));
}

function collectTsconfigs(files: readonly AnalyzerSourceFile[]): RepositoryTsconfig[] {
  return files
    .filter((file) => /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(file.path))
    .map((file) => {
      const parsed = parseTsconfig(file.content);
      return {
        path: file.path,
        root: directoryName(file.path),
        baseUrl: parsed?.compilerOptions?.baseUrl,
        paths: parsed?.compilerOptions?.paths ?? {},
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function collectProjectSignals(files: readonly AnalyzerSourceFile[], packages: readonly RepositoryPackage[]): RepositoryProjectSignals {
  const dependencies = new Set<string>();
  for (const file of files.filter((item) => item.path.endsWith("package.json"))) {
    const parsed = parsePackageJson(file.content);
    if (parsed === undefined) continue;
    for (const group of [parsed.dependencies, parsed.devDependencies, parsed.peerDependencies]) {
      if (group === undefined) continue;
      Object.keys(group).forEach((name) => dependencies.add(name));
    }
  }
  const sortedDependencies = [...dependencies].sort();
  return {
    packageNames: packages.flatMap((item) => item.name === undefined ? [] : [item.name]).sort(),
    dependencies: sortedDependencies,
    hasReact: sortedDependencies.includes("react"),
    hasNextJs: sortedDependencies.includes("next"),
  };
}

function resolveImportPath(
  from: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
  packages: readonly RepositoryPackage[],
  tsconfigs: readonly RepositoryTsconfig[],
): string | undefined {
  if (specifier.startsWith(".")) return resolveCandidate(joinPath(directoryName(from), specifier), knownFiles);

  const tsconfig = [...tsconfigs]
    .filter((item) => isWithin(from, item.root))
    .sort((left, right) => right.root.length - left.root.length)[0];
  if (tsconfig !== undefined) {
    for (const [pattern, targets] of Object.entries(tsconfig.paths).sort(([left], [right]) => left.localeCompare(right))) {
      const wildcard = matchAlias(pattern, specifier);
      if (wildcard === undefined) continue;
      for (const target of targets) {
        const substituted = target.replace("*", wildcard);
        const base = joinPath(tsconfig.root, tsconfig.baseUrl ?? ".", substituted);
        const resolved = resolveCandidate(base, knownFiles);
        if (resolved !== undefined) return resolved;
      }
    }
  }

  for (const packageBoundary of packages) {
    if (packageBoundary.name === undefined) continue;
    if (specifier !== packageBoundary.name && !specifier.startsWith(`${packageBoundary.name}/`)) continue;
    const subpath = specifier === packageBoundary.name ? "" : specifier.slice(packageBoundary.name.length + 1);
    for (const base of [joinPath(packageBoundary.root, subpath), joinPath(packageBoundary.root, "src", subpath)]) {
      const resolved = resolveCandidate(base, knownFiles);
      if (resolved !== undefined) return resolved;
    }
  }

  return undefined;
}

function resolveCandidate(base: string, knownFiles: ReadonlySet<string>): string | undefined {
  const normalized = normalizePath(base);
  const candidates = [
    normalized,
    ...SOURCE_EXTENSIONS.map((extension) => `${normalized}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${normalized}/index${extension}`),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate));
}

function parsePackageJson(content: string): PackageJsonShape | undefined {
  const value = parseJsonObject(content);
  if (value === undefined) return undefined;
  return {
    name: typeof value.name === "string" ? value.name : undefined,
    dependencies: stringRecord(value.dependencies),
    devDependencies: stringRecord(value.devDependencies),
    peerDependencies: stringRecord(value.peerDependencies),
  };
}

function parseTsconfig(content: string): TsconfigShape | undefined {
  const value = parseJsonObject(content);
  if (value === undefined || !isRecord(value.compilerOptions)) return {};
  const compilerOptions = value.compilerOptions;
  return {
    compilerOptions: {
      baseUrl: typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : undefined,
      paths: stringArrayRecord(compilerOptions.paths),
    },
  };
}

function parseJsonObject(content: string): Readonly<Record<string, unknown>> | undefined {
  try {
    const value: unknown = JSON.parse(content);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function stringRecord(value: unknown): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return Object.fromEntries(entries);
}

function stringArrayRecord(value: unknown): Readonly<Record<string, readonly string[]>> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Record<string, readonly string[]> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!Array.isArray(item) || !item.every((entry) => typeof entry === "string")) continue;
    result[key] = item;
  }
  return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueDeclarations(values: readonly RepositoryDeclaration[]): RepositoryDeclaration[] {
  return [...new Map(values.map((item) => [`${item.file}:${item.name}:${item.kind}`, item])).values()];
}

function matchAlias(pattern: string, specifier: string): string | undefined {
  const wildcardIndex = pattern.indexOf("*");
  if (wildcardIndex === -1) return pattern === specifier ? "" : undefined;
  const prefix = pattern.slice(0, wildcardIndex);
  const suffix = pattern.slice(wildcardIndex + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return undefined;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function directoryName(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index === -1 ? "" : normalized.slice(0, index);
}

function joinPath(...parts: readonly string[]): string {
  const result: string[] = [];
  for (const segment of parts.flatMap((part) => part.replace(/\\/g, "/").split("/"))) {
    if (!segment || segment === ".") continue;
    if (segment === "..") result.pop(); else result.push(segment);
  }
  return result.join("/");
}

function normalizePath(path: string): string {
  return joinPath(path.replace(/^\.\//, ""));
}

function isWithin(path: string, root: string): boolean {
  return root === "" || path === root || path.startsWith(`${root}/`);
}

function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));
}

function compareImport(left: RepositoryImport, right: RepositoryImport): number {
  return `${left.from}:${left.specifier}`.localeCompare(`${right.from}:${right.specifier}`);
}

function compareExport(left: RepositoryExport, right: RepositoryExport): number {
  return `${left.from}:${left.exportedName}:${left.sourceSpecifier ?? ""}`.localeCompare(`${right.from}:${right.exportedName}:${right.sourceSpecifier ?? ""}`);
}

function compareDeclaration(left: RepositoryDeclaration, right: RepositoryDeclaration): number {
  return `${left.file}:${left.name}:${left.kind}`.localeCompare(`${right.file}:${right.name}:${right.kind}`);
}
