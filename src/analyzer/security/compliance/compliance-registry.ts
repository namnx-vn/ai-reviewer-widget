import type { SecurityFinding, SecurityStandardMapping } from "../model/types";
import { DEFAULT_COMPLIANCE_MAPPINGS } from "./default-mappings";
import {
  securityStandardMappingKey,
  validateSecurityStandardMapping,
} from "./standard-registry";
import type {
  ComplianceControlCoverage,
  ComplianceCoverageState,
  ComplianceCoverageSummary,
  ComplianceFindingMapping,
  ComplianceMappingDefinition,
  ComplianceReport,
} from "./types";

const RULE_ID_PATTERN = /^security\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const NON_CERTIFYING_DISCLAIMER = "Mapped controls describe automated security traceability only. They do not establish certification, regulatory compliance, PCI compliance, ASVS compliance, or bank compliance.";

export class ComplianceRegistry {
  private readonly definitionsByRule = new Map<string, ComplianceMappingDefinition[]>();
  private readonly definitionKeys = new Set<string>();

  constructor(definitions: readonly ComplianceMappingDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: ComplianceMappingDefinition): void {
    validateDefinition(definition);
    const key = `${definition.ruleId}:${securityStandardMappingKey(definition.mapping)}`;
    if (this.definitionKeys.has(key)) {
      throw new Error(`Duplicate compliance mapping "${key}".`);
    }

    this.definitionKeys.add(key);
    const existing = this.definitionsByRule.get(definition.ruleId);
    if (existing === undefined) {
      this.definitionsByRule.set(definition.ruleId, [definition]);
    } else {
      existing.push(definition);
    }
  }

  getMappings(ruleId: string): readonly ComplianceMappingDefinition[] {
    return [...(this.definitionsByRule.get(ruleId) ?? [])].sort(compareDefinitions);
  }
}

export function createDefaultComplianceRegistry(): ComplianceRegistry {
  return new ComplianceRegistry(DEFAULT_COMPLIANCE_MAPPINGS);
}

export function attachComplianceMappings(
  finding: SecurityFinding,
  registry: ComplianceRegistry = createDefaultComplianceRegistry(),
): SecurityFinding {
  const standards = mergeStandards(
    finding.standards ?? [],
    registry.getMappings(finding.ruleId).map((definition) => definition.mapping),
  );
  return { ...finding, standards };
}

export function createComplianceReport(
  findings: readonly SecurityFinding[],
  registry: ComplianceRegistry = createDefaultComplianceRegistry(),
): ComplianceReport {
  const enrichedFindings = findings.map((finding) => attachComplianceMappings(finding, registry));
  const mappingResults = collectFindingMappings(enrichedFindings, registry);
  const controls = aggregateControls(mappingResults);
  return {
    disclaimer: NON_CERTIFYING_DISCLAIMER,
    findings: enrichedFindings,
    mappings: mappingResults,
    controls,
    summary: summarizeControls(controls),
  };
}

function validateDefinition(definition: ComplianceMappingDefinition): void {
  if (!RULE_ID_PATTERN.test(definition.ruleId)) {
    throw new Error(`Invalid security rule id "${definition.ruleId}" in compliance mapping.`);
  }
  validateSecurityStandardMapping(definition.mapping);
  if (definition.rationale.trim().length === 0) {
    throw new Error(`Compliance mapping for "${definition.ruleId}" requires a rationale.`);
  }
}

function mergeStandards(
  existing: readonly SecurityStandardMapping[],
  additional: readonly SecurityStandardMapping[],
): readonly SecurityStandardMapping[] {
  const result = new Map<string, SecurityStandardMapping>();
  for (const mapping of [...existing, ...additional]) {
    validateSecurityStandardMapping(mapping);
    result.set(securityStandardMappingKey(mapping), mapping);
  }
  return [...result.values()].sort(compareMappings);
}

function collectFindingMappings(
  findings: readonly SecurityFinding[],
  registry: ComplianceRegistry,
): readonly ComplianceFindingMapping[] {
  const results: ComplianceFindingMapping[] = [];
  for (const finding of findings) {
    for (const definition of registry.getMappings(finding.ruleId)) {
      results.push({
        findingId: finding.id,
        ruleId: finding.ruleId,
        mapping: definition.mapping,
        coverage: definition.coverage,
      });
    }
  }
  return results.sort((left, right) =>
    left.findingId.localeCompare(right.findingId) || compareMappings(left.mapping, right.mapping));
}

function aggregateControls(mappings: readonly ComplianceFindingMapping[]): readonly ComplianceControlCoverage[] {
  const controls = new Map<string, ComplianceControlCoverage>();
  for (const item of mappings) {
    const key = securityStandardMappingKey(item.mapping);
    const existing = controls.get(key);
    if (existing === undefined) {
      controls.set(key, {
        standard: item.mapping.standard,
        id: item.mapping.id,
        control: item.mapping.control,
        coverage: item.coverage,
        ruleIds: [item.ruleId],
      });
      continue;
    }

    const ruleIds = existing.ruleIds.includes(item.ruleId)
      ? existing.ruleIds
      : [...existing.ruleIds, item.ruleId].sort();
    controls.set(key, {
      ...existing,
      coverage: conservativeCoverage(existing.coverage, item.coverage),
      ruleIds,
    });
  }
  return [...controls.values()].sort((left, right) =>
    left.standard.localeCompare(right.standard) || left.id.localeCompare(right.id));
}

function summarizeControls(controls: readonly ComplianceControlCoverage[]): ComplianceCoverageSummary {
  let covered = 0;
  let partiallyCovered = 0;
  let manualVerificationRequired = 0;
  let notApplicable = 0;
  let notImplemented = 0;
  for (const control of controls) {
    if (control.coverage === "covered") covered += 1;
    else if (control.coverage === "partially-covered") partiallyCovered += 1;
    else if (control.coverage === "manual-verification-required") manualVerificationRequired += 1;
    else if (control.coverage === "not-applicable") notApplicable += 1;
    else notImplemented += 1;
  }
  return { covered, partiallyCovered, manualVerificationRequired, notApplicable, notImplemented };
}

function conservativeCoverage(
  left: ComplianceCoverageState,
  right: ComplianceCoverageState,
): ComplianceCoverageState {
  return coverageRank(left) >= coverageRank(right) ? left : right;
}

function coverageRank(state: ComplianceCoverageState): number {
  if (state === "not-implemented") return 5;
  if (state === "manual-verification-required") return 4;
  if (state === "partially-covered") return 3;
  if (state === "covered") return 2;
  return 1;
}

function compareDefinitions(left: ComplianceMappingDefinition, right: ComplianceMappingDefinition): number {
  return compareMappings(left.mapping, right.mapping);
}

function compareMappings(left: SecurityStandardMapping, right: SecurityStandardMapping): number {
  return left.standard.localeCompare(right.standard)
    || left.id.localeCompare(right.id)
    || (left.control ?? "").localeCompare(right.control ?? "");
}
