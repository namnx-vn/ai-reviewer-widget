import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  SecurityFlowStep,
  SecurityLocation,
  SecuritySanitizerKind,
  SecuritySinkKind,
  SecuritySourceKind,
} from "../model/types";

export type TaintKind =
  | "user-input"
  | "command"
  | "sql"
  | "nosql"
  | "template"
  | "expression"
  | "crlf"
  | "header"
  | "ldap"
  | "xpath"
  | "graphql"
  | "html"
  | "url"
  | "navigation"
  | "window-open"
  | "origin"
  | "path"
  | "secret"
  | "credential"
  | "payment-data";

export interface TaintStep {
  readonly kind: "source" | "propagation" | "sanitizer";
  readonly label: string;
  readonly location?: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

/** A named property retained while a tainted object is propagated. */
export interface TaintProperty {
  readonly name: string;
  /** Undefined means the property was statically observed to be clean. */
  readonly state?: TaintState;
}

export interface TaintState {
  readonly kinds: readonly TaintKind[];
  readonly steps: readonly TaintStep[];
  readonly properties?: readonly TaintProperty[];
}

export interface TaintTransform {
  readonly node: TSESTree.Node;
  readonly label: string;
}

/** Deterministic evidence path from one or more sources to a sink. */
export interface TaintPath {
  readonly source: TaintSource;
  readonly steps: readonly TaintStep[];
  readonly sink: TaintSink;
}

export interface TaintSource {
  readonly node: TSESTree.Node;
  readonly label: string;
  readonly sourceKind: SecuritySourceKind;
  readonly kinds: readonly TaintKind[];
}

export interface TaintSanitizer {
  readonly node: TSESTree.CallExpression;
  readonly label: string;
  readonly sanitizerKind: SecuritySanitizerKind;
  readonly clears: readonly TaintKind[];
  readonly argumentIndex: number;
}

export interface TaintSink {
  readonly family: TaintKind;
  readonly node: TSESTree.Node;
  readonly value: TSESTree.Node;
  readonly label: string;
  readonly sinkKind: SecuritySinkKind;
}

export interface TaintFlowAdapter {
  matchSource(node: TSESTree.Node): TaintSource | undefined;
  matchSanitizer(node: TSESTree.CallExpression): TaintSanitizer | undefined;
  matchSinks(node: TSESTree.Node): readonly TaintSink[];
}

export interface TaintFlowMatch {
  readonly family: TaintKind;
  readonly sink: TaintSink;
  readonly state: TaintState;
  readonly flow: readonly SecurityFlowStep[];
}
