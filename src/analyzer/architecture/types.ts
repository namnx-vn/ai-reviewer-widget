export interface ArchitectureRule {
  id: string;

  description: string;

  check(
    file: string,
    importedModule: string,
  ): boolean;
}

export interface SourceFile {
  path: string;
  content: string;
}

export interface ImportEdge {
  from: string;
  specifier: string;
  line: number;
  column: number;
  resolvedPath?: string;
}

export interface DependencyGraph {
  files: readonly string[];
  edges: readonly ImportEdge[];
}
