import { describe, expect, it } from "vitest";

import {
  analyzeDependencyHookCall,
  getDependencyHookConfiguration,
  REACT_DEPENDENCY_HOOKS,
} from "../dependency-hooks";
import { parseSource } from "../../../analyzer/ast/parser";

describe("dependency hook configuration", () => {
  it("uses React built-ins by default", () => {
    expect(getDependencyHookConfiguration("useEffect")).toEqual({
      name: "useEffect",
      callbackIndex: 0,
      dependencyArrayIndex: 1,
    });
    expect(REACT_DEPENDENCY_HOOKS).toHaveLength(3);
  });

  it("allows explicit custom hooks without broad hook-name matching", () => {
    expect(
      getDependencyHookConfiguration("useTrackedEffect", [
        { name: "useTrackedEffect" },
      ]),
    ).toEqual({
      name: "useTrackedEffect",
      callbackIndex: 0,
      dependencyArrayIndex: 1,
    });
    expect(getDependencyHookConfiguration("useUnknownEffect")).toBeUndefined();
  });

  it("extracts configured callback and dependency-array arguments", () => {
    const ast = parseSource("useTrackedEffect([], () => value);");
    const call = ast.body[0];
    if (call?.type !== "ExpressionStatement" || call.expression.type !== "CallExpression") {
      throw new Error("Expected a call expression");
    }

    const result = analyzeDependencyHookCall(call.expression, {
      name: "useTrackedEffect",
      callbackIndex: 1,
      dependencyArrayIndex: 0,
    });

    expect(result?.callback.type).toBe("ArrowFunctionExpression");
    expect(result?.dependencyArray.type).toBe("ArrayExpression");
  });
});
