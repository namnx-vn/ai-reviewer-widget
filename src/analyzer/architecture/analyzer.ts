import type { ReviewFinding } from "../../review/types";
import type { ArchitectureRule } from "./types";

export function analyzeArchitecture(
  file: string,
  source: string,
  rules: ArchitectureRule[],
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = line.match(/(?:from|import)\s+["']([^"']+)["']/);

    if (!match) {
      return;
    }

    const importedModule = match[1];

    for (const rule of rules) {
      if (!rule.check(file, importedModule)) {
        continue;
      }

      const finding: ReviewFinding = {
        id: `${rule.id}:${file}:${index + 1}`,
        ruleId: rule.id,
        title: "Micro-Frontend boundary violation",
        message: rule.description,
        severity: "high",
        source: "architecture",
        location: {
          file,
          line: index + 1,
        },
        suggestion:
          "Move the dependency behind a shared package or explicit domain contract.",
        confidence: 0.9,
      };

      findings.push(finding);
    }
  });

  return findings;
}
