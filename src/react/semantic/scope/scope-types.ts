import type { TSESTree } from "@typescript-eslint/typescript-estree";

export type ScopeKind =
  | "program"
  | "function"
  | "block"
  | "catch";

export type BindingKind =
  | "const"
  | "let"
  | "var"
  | "function"
  | "class"
  | "parameter"
  | "import"
  | "catch";

export interface SourceLocation {
  readonly line: number;
  readonly column: number;
}

export interface Declaration {
  readonly name: string;
  readonly kind: BindingKind;
  readonly node: TSESTree.Node;
  readonly location: SourceLocation;
  readonly scopeId: number;
}

export interface Reference {
  readonly name: string;
  readonly node: TSESTree.Identifier;
  readonly location: SourceLocation;
  readonly isWrite: boolean;
  readonly scopeId: number;
  readonly declaration?: Declaration;
}

export interface Scope {
  readonly id: number;
  readonly kind: ScopeKind;
  readonly node: TSESTree.Node;
  readonly parentId?: number;
  readonly declarations: readonly Declaration[];
  readonly references: readonly Reference[];
  readonly children: readonly Scope[];
}

export interface ScopeAnalysisResult {
  readonly rootScope: Scope;
  readonly scopes: readonly Scope[];
  readonly declarations: readonly Declaration[];
  readonly references: readonly Reference[];
}

export interface IdentifierResolution {
  readonly name: string;
  readonly declaration?: Declaration;
  readonly scope?: Scope;
}