import type { ReviewFinding } from "../../../domain/review";
import type { ASTRule } from "../rules";

export const noConsoleRule: ASTRule = {
  id: "quality.no-console",

  description: "Detect console logging.",

  check(node: unknown, file: string): ReviewFinding[] {
    if (!isConsoleLogCall(node)) {
      return [];
    }

    const location = node.loc.start;

    return [{
      id: `quality.no-console:${file}:${location.line}`,
      ruleId: "quality.no-console",
      title: "Console logging detected",
      message:
        "Production code should use the application's structured logging mechanism.",
      severity: "low",
      confidence: 1,
      source: "ast",
      location: {
        file,
        line: location.line,
        column: location.column,
      },
      suggestion:
        "Replace console.log() with the project's logging abstraction.",
    }];
  },
};

function isConsoleLogCall(node: unknown): node is {
  callee: {
    object: { name: string };
    property: { name: string };
  };
  loc: { start: { line: number; column: number } };
} {
  if (!node || typeof node !== "object") {
    return false;
  }

  const candidate = node as Record<string, unknown>;
  const callee = candidate.callee;
  if (!callee || typeof callee !== "object") {
    return false;
  }

  const calleeRecord = callee as Record<string, unknown>;
  const object = calleeRecord.object;
  const property = calleeRecord.property;
  const location = candidate.loc;

  return (
    candidate.type === "CallExpression" &&
    calleeRecord.type === "MemberExpression" &&
    isNamedNode(object, "console") &&
    isNamedNode(property, "log") &&
    hasStartLocation(location)
  );
}

function isNamedNode(value: unknown, name: string): value is { name: string } {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).name === name);
}

function hasStartLocation(value: unknown): value is { start: { line: number; column: number } } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const start = (value as Record<string, unknown>).start;
  return Boolean(
    start &&
      typeof start === "object" &&
      typeof (start as Record<string, unknown>).line === "number" &&
      typeof (start as Record<string, unknown>).column === "number",
  );
}
