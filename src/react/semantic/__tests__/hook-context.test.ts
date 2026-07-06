import { describe, expect, it } from "vitest";
import { parseSource } from "../../../analyzer/ast/parser";
import { createHookContext } from "../hook-context";

describe("createHookContext", () => {
  it("detects component boundaries", () => {
    const ast = parseSource(`
      function Counter() {
        const [count] = useState(0);
        return <div>{count}</div>;
      }
    `);

    const context = createHookContext(ast);

    expect(context.hooks).toHaveLength(1);
    expect(
      context.hooks[0]?.execution
        .functionBoundary?.isComponent,
    ).toBe(true);
  });

  it("detects custom hook boundaries", () => {
    const ast = parseSource(`
      function useCounter() {
        const [count] = useState(0);
        return count;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution
        .functionBoundary?.isCustomHook,
    ).toBe(true);
  });

  it("marks if execution as conditional", () => {
    const ast = parseSource(`
      function Counter({ enabled }) {
        if (enabled) {
          useEffect(() => {}, []);
        }

        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isConditional,
    ).toBe(true);

    expect(
      context.hooks[0]?.execution.kind,
    ).toBe("conditional");
  });

  it("marks ternary execution as conditional", () => {
    const ast = parseSource(`
      function Counter({ enabled }) {
        enabled
          ? useEffect(() => {}, [])
          : null;

        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isConditional,
    ).toBe(true);
  });

  it("marks logical execution as conditional", () => {
    const ast = parseSource(`
      function Counter({ enabled }) {
        enabled && useEffect(() => {}, []);
        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isConditional,
    ).toBe(true);
  });

  it("marks loop execution", () => {
    const ast = parseSource(`
      function Counter() {
        for (let i = 0; i < 3; i++) {
          useEffect(() => {}, []);
        }

        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isLoop,
    ).toBe(true);

    expect(
      context.hooks[0]?.execution.kind,
    ).toBe("loop");
  });

  it("marks nested function execution", () => {
    const ast = parseSource(`
      function Counter() {
        function renderItem() {
          useEffect(() => {}, []);
        }

        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isNestedFunction,
    ).toBe(true);
  });

  it("marks normal hook execution", () => {
    const ast = parseSource(`
      function Counter() {
        useEffect(() => {}, []);
        return null;
      }
    `);

    const context = createHookContext(ast);

    expect(
      context.hooks[0]?.execution.isConditional,
    ).toBe(false);

    expect(
      context.hooks[0]?.execution.isLoop,
    ).toBe(false);

    expect(
      context.hooks[0]?.execution.kind,
    ).toBe("normal");
  });
});