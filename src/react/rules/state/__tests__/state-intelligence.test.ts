import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import type { ReviewFinding } from "../../../../review/types";
import type { ReactRule } from "../../../engine/react-rule";
import { createHookContext } from "../../../semantic";
import {
  reactStateDerivedStateRule,
  reactStateMutationRule,
  reactStateRedundantStateRule,
  reactStateSynchronizationRule,
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

describe("React state intelligence", () => {
  it("detects nested state mutation", () => {
    const findings = check(`
      function Component() {
        const [user, setUser] = useState({ profile: { name: "A" } });
        user.profile.name = "B";
        return user.profile.name;
      }
    `, reactStateMutationRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.state.mutation");
  });

  it("detects mutating array methods on state", () => {
    const findings = check(`
      function Component() {
        const [items, setItems] = useState([]);
        items.push("value");
        return items.length;
      }
    `, reactStateMutationRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report immutable state updates", () => {
    const findings = check(`
      function Component() {
        const [items, setItems] = useState([]);
        const add = () => setItems((current) => [...current, "value"]);
        return <button onClick={add}>{items.length}</button>;
      }
    `, reactStateMutationRule);

    expect(findings).toHaveLength(0);
  });

  it("detects state initialized from another state value", () => {
    const findings = check(`
      function Component() {
        const [firstName, setFirstName] = useState("Ada");
        const [displayName, setDisplayName] = useState(firstName);
        return displayName;
      }
    `, reactStateDerivedStateRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.state.derived-state");
  });

  it("does not report independent state", () => {
    const findings = check(`
      function Component() {
        const [firstName, setFirstName] = useState("Ada");
        const [age, setAge] = useState(30);
        return firstName + age;
      }
    `, reactStateDerivedStateRule);

    expect(findings).toHaveLength(0);
  });

  it("detects duplicate derived state sources", () => {
    const findings = check(`
      function Component({ user }) {
        const [primaryName, setPrimaryName] = useState(user.name);
        const [secondaryName, setSecondaryName] = useState(user.name);
        return primaryName + secondaryName;
      }
    `, reactStateRedundantStateRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.state.redundant-state");
  });

  it("does not treat repeated literal initial state as redundant", () => {
    const findings = check(`
      function Component() {
        const [openA, setOpenA] = useState(false);
        const [openB, setOpenB] = useState(false);
        return openA || openB;
      }
    `, reactStateRedundantStateRule);

    expect(findings).toHaveLength(0);
  });

  it("detects pure synchronization effects", () => {
    const findings = check(`
      function Component({ firstName, lastName }) {
        const [fullName, setFullName] = useState("");
        useEffect(() => {
          setFullName(firstName + " " + lastName);
        }, [firstName, lastName]);
        return fullName;
      }
    `, reactStateSynchronizationRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.state.synchronization");
  });

  it("does not report effects with external work", () => {
    const findings = check(`
      function Component({ value }) {
        const [state, setState] = useState("");
        useEffect(() => {
          document.title = value;
          setState(value);
        }, [value]);
        return state;
      }
    `, reactStateSynchronizationRule);

    expect(findings).toHaveLength(0);
  });
});
