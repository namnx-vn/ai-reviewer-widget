import { TSESTree } from "@typescript-eslint/typescript-estree";
import { parseSource } from "../../analyzer/ast/parser";
import type { ReviewFinding } from "../../review/types";
import {
  createReactAnalysisContext,
  type ReactAnalysisContext,
} from "./react-context";
import type { ReactPlugin } from "./react-plugin";
import type { ReactRule } from "./react-rule";

const NON_AST_KEYS = new Set(["parent", "loc", "range", "tokens", "comments"]);

export interface ReactEngineInput {
  readonly source: string;
  readonly file: string;
  readonly plugins: readonly ReactPlugin[];
}

export class ReactEngine {
  analyze(input: ReactEngineInput): ReviewFinding[] {
    let ast: TSESTree.Program;

    try {
      ast = parseSource(input.source);
    } catch {
      return [];
    }

    const context = createReactAnalysisContext(
      input.source,
      input.file,
      ast,
      input.plugins,
    );

    const findings: ReviewFinding[] = [];

    this.visit(ast, context, findings);

    return this.deduplicateFindings(findings);
  }

  private visit(
    node: unknown,
    context: ReactAnalysisContext,
    findings: ReviewFinding[],
  ): void {
    if (!this.isObject(node)) {
      return;
    }

    for (const rule of context.rules) {
      const ruleFindings = this.runRule(rule, node, context);

      findings.push(...ruleFindings);
    }

    for (const [key, value] of Object.entries(node)) {
      if (NON_AST_KEYS.has(key)) {
        continue;
      }

      if (Array.isArray(value)) {
        for (const child of value) {
          this.visit(child, context, findings);
        }

        continue;
      }

      if (this.isObject(value)) {
        this.visit(value, context, findings);
      }
    }
  }

  private runRule(
    rule: ReactRule,
    node: TSESTree.Node | unknown,
    context: ReactAnalysisContext,
  ): ReviewFinding[] {
    try {
      const result: unknown = rule.check(node as TSESTree.Node, {
        source: context.source,
        file: context.file,
        ast: context.ast,
        hooks: context.hooks,
        dependencyHooks: context.dependencyHooks,
      });

      return Array.isArray(result)
        ? result.filter((finding): finding is ReviewFinding =>
          this.isReviewFinding(finding),
        )
        : [];
    } catch {
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
    return value === "ast" || value === "architecture" || value === "ai";
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
