import type {
  SecurityFinding,
  SecurityStandard,
  SecurityStandardMapping,
} from "../model/types";

export type ComplianceCoverageState =
  | "covered"
  | "partially-covered"
  | "manual-verification-required"
  | "not-applicable"
  | "not-implemented";

export interface ComplianceMappingDefinition {
  readonly ruleId: string;
  readonly mapping: SecurityStandardMapping;
  readonly coverage: ComplianceCoverageState;
  readonly rationale: string;
}

export interface ComplianceFindingMapping {
  readonly findingId: string;
  readonly ruleId: string;
  readonly mapping: SecurityStandardMapping;
  readonly coverage: ComplianceCoverageState;
}

export interface ComplianceControlCoverage {
  readonly standard: SecurityStandard;
  readonly id: string;
  readonly control?: string;
  readonly coverage: ComplianceCoverageState;
  readonly ruleIds: readonly string[];
}

export interface ComplianceCoverageSummary {
  readonly covered: number;
  readonly partiallyCovered: number;
  readonly manualVerificationRequired: number;
  readonly notApplicable: number;
  readonly notImplemented: number;
}

export interface ComplianceReport {
  readonly disclaimer: string;
  readonly findings: readonly SecurityFinding[];
  readonly mappings: readonly ComplianceFindingMapping[];
  readonly controls: readonly ComplianceControlCoverage[];
  readonly summary: ComplianceCoverageSummary;
}
