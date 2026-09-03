export type RepositoryDeclarationKind = "function" | "class" | "variable";
export type RepositoryExportKind = "named" | "default" | "star";

export interface RepositoryImportBinding {
  readonly localName: string;
  readonly importedName: string;
  readonly typeOnly: boolean;
}

export interface RepositoryImport {
  readonly from: string;
  readonly specifier: string;
  readonly resolvedPath?: string;
  readonly bindings: readonly RepositoryImportBinding[];
}

export interface RepositoryExport {
  readonly from: string;
  readonly exportedName: string;
  readonly localName?: string;
  readonly sourceSpecifier?: string;
  readonly resolvedPath?: string;
  readonly kind: RepositoryExportKind;
}

export interface RepositoryDeclaration {
  readonly file: string;
  readonly name: string;
  readonly kind: RepositoryDeclarationKind;
  readonly exported: boolean;
}

export interface RepositoryPackage {
  readonly root: string;
  readonly packageJsonPath: string;
  readonly name?: string;
}

export interface RepositoryTsconfig {
  readonly path: string;
  readonly root: string;
  readonly baseUrl?: string;
  readonly paths: Readonly<Record<string, readonly string[]>>;
}

export interface RepositoryProjectSignals {
  readonly packageNames: readonly string[];
  readonly dependencies: readonly string[];
  readonly hasReact: boolean;
  readonly hasNextJs: boolean;
}

export interface RepositoryContext {
  readonly files: readonly string[];
  readonly imports: readonly RepositoryImport[];
  readonly exports: readonly RepositoryExport[];
  readonly declarations: readonly RepositoryDeclaration[];
  readonly packages: readonly RepositoryPackage[];
  readonly tsconfigs: readonly RepositoryTsconfig[];
  readonly projectSignals: RepositoryProjectSignals;
  resolveImport(from: string, specifier: string): string | undefined;
  resolveDeclaration(file: string, exportedName: string): RepositoryDeclaration | undefined;
  resolveImportedDeclaration(file: string, localName: string): RepositoryDeclaration | undefined;
}
