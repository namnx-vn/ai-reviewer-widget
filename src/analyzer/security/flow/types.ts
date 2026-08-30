import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  SecurityFlowStep,
  SecurityLocation,
  SecuritySanitizerKind,
  SecuritySinkKind,
  SecuritySourceKind,
} from "../model/types";

export type TaintKind =
  | "command"
  | "sql"
  | "nosql"
  | "template"
  | "expression"
  | "crlf"
  | "header"
  | "ldap"
  | "xpath"
  | "graphql";

export interface TaintStep {
  readonly kind: "source" | "propagation" | "sanitizer";
  readonly label: string;
  readonly location?: SecurityLocation;
  readonly sourceKind?: SecuritySourceKind;
  readonly sanitizerKind?: SecuritySanitizerKind;
}

export interface TaintState {
  readonly kinds: readonly TaintKind[];
  readonly steps: readonly TaintStep[];
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
  readonly node: TSESTree.CallExpression;
  readonly value: TSESTree.Node;
  readonly label: string;
  readonly sinkKind: SecuritySinkKind;
}

export interface TaintFlowAdapter {
  matchSource(node: TSESTree.Node): TaintSource | undefined;
  matchSanitizer(node: TSESTree.CallExpression): TaintSanitizer | undefined;
  matchSinks(node: TSESTree.CallExpression): readonly TaintSink[];
}

export interface TaintFlowMatch {
  readonly family: TaintKind;
  readonly sink: TaintSink;
  readonly state: TaintState;
  readonly flow: readonly SecurityFlowStep[];
}
