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
      context.hooks[0]?.functionBoundary?.isComponent,
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
      context.hooks[0]?.functionBoundary?.isCustomHook,
    ).toBe(true);
  });

  it("marks conditional hook execution", () => {
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

  it("marks loop hook execution", () => {
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
  });
});