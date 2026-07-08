import { describe, expect, it } from "vitest";
import { parseSource } from "../../../../analyzer/ast/parser";
import { createHookContext } from "../../../semantic/hook-context";
import { reactRenderingMemoBoundaryRule } from "../memo-boundary";

function check(source: string) {
    const ast = parseSource(source);
    const hooks = createHookContext(ast);

    return reactRenderingMemoBoundaryRule.check(ast, {
        source,
        file: "example.tsx",
        ast,
        hooks,
    });
}

describe("react.rendering.memo-boundary", () => {
    it("detects inline object passed to memoized component", () => {
        const findings = check(`
            const Child = memo(({ config }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child
                        config={{ enabled: true }}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.ruleId).toBe(
            "react.rendering.memo-boundary",
        );
    });

    it("detects inline array passed to memoized component", () => {
        const findings = check(`
            const Child = memo(({ items }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child
                        items={[1, 2, 3]}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(1);
    });

    it("detects inline callback passed to memoized component", () => {
        const findings = check(`
            const Child = memo(({ onSave }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child
                        onSave={() => save()}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(1);
    });

    it("supports React.memo", () => {
        const findings = check(`
            const Child = React.memo(({ config }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child
                        config={{ enabled: true }}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(1);
    });

    it("allows stable identifier props", () => {
        const findings = check(`
            const Child = memo(({ config }) => {
                return <div />;
            });

            function Parent({ config }) {
                return (
                    <Child config={config} />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("allows memoized object props", () => {
        const findings = check(`
            const Child = memo(({ config }) => {
                return <div />;
            });

            function Parent() {
                const config = useMemo(
                    () => ({ enabled: true }),
                    [],
                );

                return (
                    <Child config={config} />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("allows memoized array props", () => {
        const findings = check(`
            const Child = memo(({ items }) => {
                return <div />;
            });

            function Parent() {
                const items = useMemo(
                    () => [1, 2, 3],
                    [],
                );

                return (
                    <Child items={items} />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("allows memoized callback props", () => {
        const findings = check(`
            const Child = memo(({ onSave }) => {
                return <div />;
            });

            function Parent() {
                const onSave = useCallback(
                    () => save(),
                    [],
                );

                return (
                    <Child onSave={onSave} />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("does not report non-memoized components", () => {
        const findings = check(`
            function Child({ config }) {
                return <div />;
            }

            function Parent() {
                return (
                    <Child
                        config={{ enabled: true }}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("detects multiple unstable props", () => {
        const findings = check(`
            const Child = memo(({ config, items, onSave }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child
                        config={{ enabled: true }}
                        items={[1, 2]}
                        onSave={() => save()}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(3);
    });

    it("does not report intrinsic elements", () => {
        const findings = check(`
            function Parent() {
                return (
                    <div
                        style={{ color: "red" }}
                        onClick={() => save()}
                    />
                );
            }
        `);

        expect(findings).toHaveLength(0);
    });

    it("does not duplicate the same finding", () => {
        const findings = check(`
            const Child = memo(({ config }) => {
                return <div />;
            });

            function Parent() {
                return (
                    <Child config={{ enabled: true }} />
                );
            }
        `);

        expect(
            new Set(findings.map((finding) => finding.id)).size,
        ).toBe(findings.length);
    });
});