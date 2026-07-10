import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import type { ReviewFinding } from "../../../../review/types";
import type { ReactRule } from "../../../engine/react-rule";
import { createHookContext } from "../../../semantic";
import {
  reactContextConsumerInvalidationRule,
  reactContextProviderNestingRule,
  reactContextUnstableValueRule,
} from "..";

function check(source: string, rule: ReactRule): ReviewFinding[] {
  const ast = parseSource(source);
  const hooks = createHookContext(ast);
  const findings: ReviewFinding[] = [];

  visit(ast, (node) => {
    findings.push(
      ...rule.check(node, {
        source,
        file: "example.tsx",
        ast,
        hooks,
      }),
    );
  });

  return findings;
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      visit(value, callback);
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (isNode(item)) {
        visit(item, callback);
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}

describe("React context intelligence", () => {
  it("detects an inline object provider value", () => {
    const findings = check(`
      const ThemeContext = createContext(null);

      function App({ theme }) {
        return (
          <ThemeContext.Provider value={{ theme }}>
            <Page />
          </ThemeContext.Provider>
        );
      }
    `, reactContextUnstableValueRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.context.unstable-value");
  });

  it("detects a render-scope object referenced by the provider", () => {
    const findings = check(`
      const ThemeContext = React.createContext(null);

      function App({ theme }) {
        const contextValue = { theme };
        return <ThemeContext.Provider value={contextValue}><Page /></ThemeContext.Provider>;
      }
    `, reactContextUnstableValueRule);

    expect(findings).toHaveLength(1);
  });

  it("detects a render-scope function provider value", () => {
    const findings = check(`
      const ActionContext = createContext(null);

      function App({ onSave }) {
        function save() {
          onSave();
        }

        return <ActionContext.Provider value={save}><Page /></ActionContext.Provider>;
      }
    `, reactContextUnstableValueRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report a memoized object provider value", () => {
    const findings = check(`
      const ThemeContext = createContext(null);

      function App({ theme }) {
        const contextValue = useMemo(() => ({ theme }), [theme]);
        return <ThemeContext.Provider value={contextValue}><Page /></ThemeContext.Provider>;
      }
    `, reactContextUnstableValueRule);

    expect(findings).toHaveLength(0);
  });

  it("does not report a module-scope provider value", () => {
    const findings = check(`
      const FeatureContext = createContext(null);
      const featureValue = { enabled: true };

      function App() {
        return <FeatureContext.Provider value={featureValue}><Page /></FeatureContext.Provider>;
      }
    `, reactContextUnstableValueRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a broad memoized provider value with independent dynamic inputs", () => {
    const findings = check(`
      const AppContext = createContext(null);

      function App({ locale }) {
        const [theme, setTheme] = useState("light");
        const [user, setUser] = useState(null);
        const value = useMemo(
          () => ({ locale, theme, user, setTheme, setUser }),
          [locale, theme, user],
        );

        return <AppContext.Provider value={value}><Page /></AppContext.Provider>;
      }
    `, reactContextConsumerInvalidationRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.context.consumer-invalidation");
  });

  it("tracks one-level derived render bindings in broad context values", () => {
    const findings = check(`
      const AppContext = createContext(null);

      function App({ locale, user }) {
        const [theme, setTheme] = useState("light");
        const region = locale.region;
        const account = user.account;
        const value = useMemo(
          () => ({ region, account, theme, setTheme }),
          [region, account, theme],
        );

        return <AppContext.Provider value={value}><Page /></AppContext.Provider>;
      }
    `, reactContextConsumerInvalidationRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report a focused memoized provider value", () => {
    const findings = check(`
      const ThemeContext = createContext(null);

      function App({ theme }) {
        const value = useMemo(() => ({ theme, mode: "app" }), [theme]);
        return <ThemeContext.Provider value={value}><Page /></ThemeContext.Provider>;
      }
    `, reactContextConsumerInvalidationRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a nested duplicate provider with the same value expression", () => {
    const findings = check(`
      const ThemeContext = createContext(null);

      function App({ theme }) {
        return (
          <ThemeContext.Provider value={theme}>
            <ThemeContext.Provider value={theme}>
              <Page />
            </ThemeContext.Provider>
          </ThemeContext.Provider>
        );
      }
    `, reactContextProviderNestingRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe("Duplicated context provider");
  });

  it("does not report an intentional nested override with a different value", () => {
    const findings = check(`
      const ThemeContext = createContext(null);

      function App({ outerTheme, innerTheme }) {
        return (
          <ThemeContext.Provider value={outerTheme}>
            <ThemeContext.Provider value={innerTheme}>
              <Page />
            </ThemeContext.Provider>
          </ThemeContext.Provider>
        );
      }
    `, reactContextProviderNestingRule);

    expect(findings).toHaveLength(0);
  });

  it("detects five nested context providers as deep composition", () => {
    const findings = check(`
      const AContext = createContext(null);
      const BContext = createContext(null);
      const CContext = createContext(null);
      const DContext = createContext(null);
      const EContext = createContext(null);

      function App({ a, b, c, d, e }) {
        return (
          <AContext.Provider value={a}>
            <BContext.Provider value={b}>
              <CContext.Provider value={c}>
                <DContext.Provider value={d}>
                  <EContext.Provider value={e}>
                    <Page />
                  </EContext.Provider>
                </DContext.Provider>
              </CContext.Provider>
            </BContext.Provider>
          </AContext.Provider>
        );
      }
    `, reactContextProviderNestingRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.title).toBe("Deep context provider composition");
  });

  it("does not report four nested context providers", () => {
    const findings = check(`
      const AContext = createContext(null);
      const BContext = createContext(null);
      const CContext = createContext(null);
      const DContext = createContext(null);

      function App({ a, b, c, d }) {
        return (
          <AContext.Provider value={a}>
            <BContext.Provider value={b}>
              <CContext.Provider value={c}>
                <DContext.Provider value={d}>
                  <Page />
                </DContext.Provider>
              </CContext.Provider>
            </BContext.Provider>
          </AContext.Provider>
        );
      }
    `, reactContextProviderNestingRule);

    expect(findings).toHaveLength(0);
  });
});
