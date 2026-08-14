import { TSESTree } from "@typescript-eslint/typescript-estree";
import { parseSource } from "../../analyzer/ast/parser";
import type { ReviewFinding, ReviewWarning } from "../../review/types";
import {
  createReactAnalysisContext,
  type ReactAnalysisContext,
} from "./react-context";
import type { ReactPlugin } from "./react-plugin";
import type { ReactPerformanceConfiguration, ReactRule } from "./react-rule";

const NON_AST_KEYS = new Set(["parent", "loc", "range", "tokens", "comments"]);

export interface ReactEngineInput {
  readonly source: string;
  readonly file: string;
  readonly plugins: readonly ReactPlugin[];
  readonly performance?: ReactPerformanceConfiguration;
}

export interface ReactAnalysisResult {
  readonly findings: ReviewFinding[];
  readonly warnings: ReviewWarning[];
}

export class ReactEngine {
  analyze(input: ReactEngineInput): ReviewFinding[] {
    return this.analyzeWithWarnings(input).findings;
  }

  analyzeWithWarnings(input: ReactEngineInput): ReactAnalysisResult {
    let ast: TSESTree.Program;

    try {
      ast = parseSource(input.source);
    } catch {
      return { findings: [], warnings: [] };
    }

    const context = createReactAnalysisContext(
      input.source,
      input.file,
      ast,
      input.plugins,
      input.performance,
    );

    const findings: ReviewFinding[] = [];
    const warnings: ReviewWarning[] = [];
    const failedRuleIds = new Set<string>();

    this.visit(ast, context, findings, warnings, failedRuleIds);

    return {
      findings: this.deduplicateFindings(findings),
      warnings,
    };
  }

  private visit(
    node: unknown,
    context: ReactAnalysisContext,
    findings: ReviewFinding[],
    warnings: ReviewWarning[],
    failedRuleIds: Set<string>,
  ): void {
    if (!this.isObject(node)) {
      return;
    }

    for (const rule of context.rules) {
      const ruleFindings = this.runRule(rule, node, context, warnings, failedRuleIds);

      findings.push(...ruleFindings);
    }

    for (const [key, value] of Object.entries(node)) {
      if (NON_AST_KEYS.has(key)) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const child of value) {
          this.visit(child, context, findings, warnings, failedRuleIds);
        }

        continue;
      }

      if (this.isObject(value)) {
        this.visit(value, context, findings, warnings, failedRuleIds);
      }
    }
  }

  private runRule(
    rule: ReactRule,
    node: TSESTree.Node | unknown,
    context: ReactAnalysisContext,
    warnings: ReviewWarning[],
    failedRuleIds: Set<string>,
  ): ReviewFinding[] {
    try {
      const result: unknown = rule.check(node as TSESTree.Node, {
        source: context.source,
        file: context.file,
        ast: context.ast,
        hooks: context.hooks,
        dependencyHooks: context.dependencyHooks,
        performance: context.performance,
      });

      return Array.isArray(result)
        ? result.filter((finding): finding is ReviewFinding =>
          this.isReviewFinding(finding),
        )
        : [];
    } catch {
      if (!failedRuleIds.has(rule.id)) {
        failedRuleIds.add(rule.id);
        warnings.push({
          code: "REACT_RULE_FAILED",
          message: `React rule ${rule.id} failed while analyzing ${context.file}.`,
        });
      }
      return [];
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private isReviewFinding(value: unknown): value is ReviewFinding {
    if (!this.isObject(value)) {
      return false;
    }

    return (
      typeof value.id === "string" &&
      typeof value.ruleId === "string" &&
      typeof value.title === "string" &&
      typeof value.message === "string" &&
      this.isSeverity(value.severity) &&
      this.isFindingSource(value.source) &&
      typeof value.confidence === "number" &&
      Number.isFinite(value.confidence)
    );
  }

  private isSeverity(value: unknown): boolean {
    return (
      value === "critical" ||
      value === "high" ||
      value === "medium" ||
      value === "low" ||
      value === "info"
    );
  }

  private isFindingSource(value: unknown): boolean {
    return value === "ast"
      || value === "architecture"
      || value === "security"
      || value === "performance"
      || value === "ai";
  }

  private deduplicateFindings(
    findings: readonly ReviewFinding[],
  ): ReviewFinding[] {
    const findingIds = new Set<string>();

    return findings.filter((finding) => {
      if (findingIds.has(finding.id)) {
        return false;
      }

      findingIds.add(finding.id);
      return true;
    });
  }
}
