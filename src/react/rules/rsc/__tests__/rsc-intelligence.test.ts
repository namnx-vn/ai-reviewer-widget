import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import type { ReviewFinding } from "../../../../review/types";
import type { ReactRule } from "../../../engine/react-rule";
import { createHookContext } from "../../../semantic";
import {
  reactRscBrowserApiInServerRule,
  reactRscClientHookInServerRule,
  reactRscConflictingBoundaryRule,
  reactRscEventHandlerInServerRule,
  reactRscIncompatibleBoundaryImportRule,
  reactRscNonSerializableServerReturnRule,
  reactRscServerFunctionAsyncRule,
  reactRscServerFunctionInClientRule,
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

describe("React Server Components intelligence", () => {
  it("detects conflicting module directives", () => {
    const findings = check(`
      "use client";
      "use server";
      export function Example() { return null; }
    `, reactRscConflictingBoundaryRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.rsc.conflicting-boundary");
  });

  it("detects server-only imported by a client module", () => {
    const findings = check(`
      "use client";
      import "server-only";
      export function Example() { return <div />; }
    `, reactRscIncompatibleBoundaryImportRule);

    expect(findings).toHaveLength(1);
  });

  it("detects client-only imported by a server module", () => {
    const findings = check(`
      "use server";
      import "client-only";
      export async function action() { return 1; }
    `, reactRscIncompatibleBoundaryImportRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts a matching server-only module marker", () => {
    const findings = check(`
      import "server-only";
      export async function load() { return 1; }
    `, reactRscIncompatibleBoundaryImportRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a React client hook in an explicit server module", () => {
    const findings = check(`
      import "server-only";
      import { useState } from "react";
      export function Page() {
        const [count] = useState(0);
        return <div>{count}</div>;
      }
    `, reactRscClientHookInServerRule);

    expect(findings).toHaveLength(1);
  });

  it("does not treat an unrelated local function as a React hook", () => {
    const findings = check(`
      import "server-only";
      function useState(value) { return value; }
      export function Page() {
        return <div>{useState(1)}</div>;
      }
    `, reactRscClientHookInServerRule);

    expect(findings).toHaveLength(0);
  });

  it("does not infer an unmarked shared module is a Server Component", () => {
    const findings = check(`
      import { useState } from "react";
      export function Widget() {
        const [count] = useState(0);
        return <button>{count}</button>;
      }
    `, reactRscClientHookInServerRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a namespace React client hook in an explicit server module", () => {
    const findings = check(`
      import "server-only";
      import * as React from "react";
      export function Page() {
        React.useEffect(() => {}, []);
        return <div />;
      }
    `, reactRscClientHookInServerRule);

    expect(findings).toHaveLength(1);
  });

  it("detects a browser global in an explicit server module", () => {
    const findings = check(`
      import "server-only";
      export function Page() {
        return <div>{document.title}</div>;
      }
    `, reactRscBrowserApiInServerRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report a shadowed browser-global name", () => {
    const findings = check(`
      import "server-only";
      const document = { title: "server document" };
      export function Page() {
        return <div>{document.title}</div>;
      }
    `, reactRscBrowserApiInServerRule);

    expect(findings).toHaveLength(0);
  });

  it("detects an intrinsic DOM event handler in a server module", () => {
    const findings = check(`
      import "server-only";
      export function Page() {
        return <button onClick={() => save()}>Save</button>;
      }
    `, reactRscEventHandlerInServerRule);

    expect(findings).toHaveLength(1);
  });

  it("does not assume a custom component event prop is a DOM handler", () => {
    const findings = check(`
      import "server-only";
      export function Page() {
        return <Button onClick={save}>Save</Button>;
      }
    `, reactRscEventHandlerInServerRule);

    expect(findings).toHaveLength(0);
  });

  it("allows DOM event handlers in an explicit client module", () => {
    const findings = check(`
      "use client";
      export function Button() {
        return <button onClick={() => save()}>Save</button>;
      }
    `, reactRscEventHandlerInServerRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a non-async function-level Server Function", () => {
    const findings = check(`
      export function save() {
        "use server";
        return 1;
      }
    `, reactRscServerFunctionAsyncRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts an async function-level Server Function", () => {
    const findings = check(`
      export async function save() {
        "use server";
        return 1;
      }
    `, reactRscServerFunctionAsyncRule);

    expect(findings).toHaveLength(0);
  });

  it("detects an inline Server Function inside a client module", () => {
    const findings = check(`
      "use client";
      export function Form() {
        async function save() {
          "use server";
          return 1;
        }
        return <button>Save</button>;
      }
    `, reactRscServerFunctionInClientRule);

    expect(findings).toHaveLength(1);
  });

  it("detects a definitely non-serializable Server Function return", () => {
    const findings = check(`
      export async function loadHandler() {
        "use server";
        return () => "client callback";
      }
    `, reactRscNonSerializableServerReturnRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts a supported structured Server Function return", () => {
    const findings = check(`
      export async function loadMap() {
        "use server";
        return new Map([["count", 1]]);
      }
    `, reactRscNonSerializableServerReturnRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a non-global Symbol returned from a Server Function", () => {
    const findings = check(`
      export async function loadSymbol() {
        "use server";
        return Symbol("local");
      }
    `, reactRscNonSerializableServerReturnRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts a globally registered Symbol return", () => {
    const findings = check(`
      export async function loadSymbol() {
        "use server";
        return Symbol.for("global");
      }
    `, reactRscNonSerializableServerReturnRule);

    expect(findings).toHaveLength(0);
  });
});
