import type { SecurityStandard, SecurityStandardMapping } from "../model/types";

const STANDARD_ID_PATTERNS: Readonly<Record<SecurityStandard, RegExp>> = {
  cwe: /^CWE-[1-9]\d*$/,
  "owasp-top-10": /^A(?:0[1-9]|10):2021$/,
  "owasp-asvs": /^V[1-9]\d*(?:\.[1-9]\d*){0,2}$/,
  "pci-dss": /^[1-9]\d*(?:\.\d+){1,2}$/,
  "nist-ssdf": /^(?:PO|PS|PW|RV)\.[1-9]\d*\.[1-9]\d*$/,
  "banking-policy": /^BANK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
};

export function isValidSecurityStandardMapping(mapping: SecurityStandardMapping): boolean {
  const pattern = STANDARD_ID_PATTERNS[mapping.standard];
  return pattern.test(mapping.id) && (mapping.control === undefined || mapping.control.trim().length > 0);
}

export function validateSecurityStandardMapping(mapping: SecurityStandardMapping): void {
  if (!isValidSecurityStandardMapping(mapping)) {
    throw new Error(`Invalid ${mapping.standard} control id "${mapping.id}".`);
  }
}

export function securityStandardMappingKey(mapping: SecurityStandardMapping): string {
  return `${mapping.standard}:${mapping.id}:${mapping.control ?? ""}`;
}
