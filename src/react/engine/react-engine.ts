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
    const ast = parseSource(input.source);

    const context = createReactAnalysisContext(
      input.source,
      input.file,
      ast,
      input.plugins,
    );

    const findings: ReviewFinding[] = [];

    this.visit(ast, context, findings);

    return findings;
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
    node: unknown,
    context: ReactAnalysisContext,
  ): ReviewFinding[] {
    try {
      return rule.check(node, {
        source: context.source,
        file: context.file,
        ast: context.ast,
        hooks: context.hooks,
      });
    } catch {
      return [];
    }
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
