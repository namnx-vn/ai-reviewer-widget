import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { createPerformanceFindingId } from "../engine/finding-id";
import type { PerformanceFinding, PerformanceRule } from "../model/types";

const HEAVY_LIBRARIES = new Set(["lodash", "moment", "rxjs", "date-fns", "@mui/material", "antd"]);
const BARREL_SEGMENTS = new Set(["index", "components", "utils"]);

export const importPerformanceRules: readonly PerformanceRule[] = [
  createImportRule("performance.large-import", "Large runtime import", "bundle", "medium", (node) => node.specifiers.length >= 8, "A single runtime import exposes many bindings and can increase shipped code."),
  createImportRule("performance.heavy-library-whole-import", "Whole heavy-library import", "bundle", "high", (node) => HEAVY_LIBRARIES.has(node.source.value) && node.specifiers.some((specifier) => specifier.type === "ImportNamespaceSpecifier" || specifier.type === "ImportDefaultSpecifier"), "A whole-library runtime import prevents narrow import evidence."),
  createImportRule("performance.barrel-overimport", "Barrel import", "bundle", "low", (node) => node.specifiers.length >= 4 && node.source.value.split("/").some((segment) => BARREL_SEGMENTS.has(segment)), "A wide barrel import can pull unrelated runtime modules into an entrypoint."),
];

function createImportRule(id: string, title: string, category: "bundle", severity: "high" | "medium" | "low", predicate: (node: TSESTree.ImportDeclaration) => boolean, message: string): PerformanceRule {
  return { meta: { id, title, description: message, category, defaultSeverity: severity, defaultConfidence: "high" }, check(context) {
    return context.ast.body.flatMap((statement): readonly PerformanceFinding[] => {
      if (statement.type !== "ImportDeclaration" || statement.importKind === "type" || !predicate(statement)) return [];
      const range = toRange(statement); const location = { path: context.file, line: statement.loc?.start.line, column: statement.loc?.start.column, range };
      return [{ id: createPerformanceFindingId({ ruleId: id, path: context.file, range }), ruleId: id, title, message, severity, confidence: "high", category, location, evidence: [{ message: `Runtime import from "${statement.source.value}".`, location }], suggestion: "Import only the runtime bindings required by this module." }];
    });
  }};
}
function toRange(node: TSESTree.Node): { readonly start: number; readonly end: number } | undefined { return node.range ? { start: node.range[0], end: node.range[1] } : undefined; }
