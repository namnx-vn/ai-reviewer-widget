export interface SemanticSourceFile { readonly path: string; readonly content: string }
export interface SemanticOptions {
  readonly maxFiles?: number;
  readonly maxSourceCharacters?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxSymbols?: number;
}
export interface SemanticDiagnostic {
  readonly file: string;
  readonly code: "input-limit" | "node-limit" | "depth-limit" | "parse-error" | "unresolved-import" | "recursive-call" | "unsupported-binding";
}
export interface SemanticFunctionSummary {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly calls: readonly string[];
  readonly unknownCallCount: number;
  readonly definitions: readonly string[];
  readonly uses: readonly string[];
}
/** Observations describe supported syntax; cleanup is not a lifecycle proof. */
export interface SemanticCacheSummary {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly retention: "weak-key" | "strong-key" | "unknown";
  readonly cleanup: "observed-unconditional" | "not-observed" | "unknown";
  readonly sizeGuardObserved: boolean;
  readonly writes: number;
}
export interface SemanticProgram {
  readonly schemaVersion: 1;
  readonly complete: boolean;
  readonly functions: readonly SemanticFunctionSummary[];
  readonly caches: readonly SemanticCacheSummary[];
  readonly diagnostics: readonly SemanticDiagnostic[];
  readonly capabilities: {
    readonly wholeProgramTaint: false;
    readonly lifecycleProof: false;
    readonly hardResourceIsolation: false;
  };
}
export interface SemanticPropertyChange {
  readonly id: string;
  readonly property: "retention" | "cleanup";
  readonly base?: string;
  readonly head?: string;
  readonly classification: "introduced" | "removed" | "unchanged" | "worsened" | "improved" | "removed-observation" | "added-observation" | "unknown";
}
export interface SemanticDifferential {
  readonly complete: boolean;
  readonly changes: readonly SemanticPropertyChange[];
}
