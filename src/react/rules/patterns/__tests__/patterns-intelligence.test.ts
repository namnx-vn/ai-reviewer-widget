import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { describe, expect, it } from "vitest";

import { parseSource } from "../../../../analyzer/ast/parser";
import type { ReviewFinding } from "../../../../review/types";
import type { ReactRule } from "../../../engine/react-rule";
import { createHookContext } from "../../../semantic";
import {
  reactPatternsIneffectiveErrorBoundaryRule,
  reactPatternsMutationInRenderRule,
  reactPatternsNestedComponentDefinitionRule,
  reactPatternsQueryCacheInvalidationRenderRule,
  reactPatternsQueryEffectSyncRule,
  reactPatternsQueryKeyStabilityRule,
  reactPatternsSuspenseFallbackRule,
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

describe("React patterns intelligence", () => {
  it("detects a non-deterministic React Query key", () => {
    const findings = check(`
      import { useQuery } from "@tanstack/react-query";

      function Todos() {
        const query = useQuery({
          queryKey: ["todos", Math.random()],
          queryFn: loadTodos,
        });

        return <div>{query.data?.length}</div>;
      }
    `, reactPatternsQueryKeyStabilityRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe("react.patterns.query-key-stability");
  });

  it("does not activate the query-key rule for an unrelated local useQuery", () => {
    const findings = check(`
      function useQuery(options) {
        return options;
      }

      function Example() {
        useQuery({ queryKey: ["value", Math.random()] });
        return <div />;
      }
    `, reactPatternsQueryKeyStabilityRule);

    expect(findings).toHaveLength(0);
  });

  it("accepts a deterministic React Query key", () => {
    const findings = check(`
      import { useQuery } from "@tanstack/react-query";

      function Todo({ id }) {
        const query = useQuery({
          queryKey: ["todo", id],
          queryFn: loadTodo,
        });

        return <div>{query.data?.title}</div>;
      }
    `, reactPatternsQueryKeyStabilityRule);

    expect(findings).toHaveLength(0);
  });

  it("detects an effect that mirrors query data into local state", () => {
    const findings = check(`
      import { useQuery } from "@tanstack/react-query";
      import { useEffect, useState } from "react";

      function Todos() {
        const { data } = useQuery({
          queryKey: ["todos"],
          queryFn: loadTodos,
        });
        const [items, setItems] = useState([]);

        useEffect(() => {
          setItems(data);
        }, [data]);

        return <div>{items.length}</div>;
      }
    `, reactPatternsQueryEffectSyncRule);

    expect(findings).toHaveLength(1);
  });

  it("does not report a query effect that performs additional work", () => {
    const findings = check(`
      import { useQuery } from "@tanstack/react-query";
      import { useEffect, useState } from "react";

      function Todos() {
        const query = useQuery({
          queryKey: ["todos"],
          queryFn: loadTodos,
        });
        const [items, setItems] = useState([]);

        useEffect(() => {
          analytics.track("loaded");
          setItems(query.data);
        }, [query.data]);

        return <div>{items.length}</div>;
      }
    `, reactPatternsQueryEffectSyncRule);

    expect(findings).toHaveLength(0);
  });

  it("detects query-cache invalidation during render", () => {
    const findings = check(`
      import { useQueryClient } from "@tanstack/react-query";

      function Todos({ shouldRefresh }) {
        const queryClient = useQueryClient();

        if (shouldRefresh) {
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        }

        return <div />;
      }
    `, reactPatternsQueryCacheInvalidationRenderRule);

    expect(findings).toHaveLength(1);
  });

  it("allows query-cache invalidation in an event handler", () => {
    const findings = check(`
      import { useQueryClient } from "@tanstack/react-query";

      function Todos() {
        const queryClient = useQueryClient();
        const handleRefresh = () => {
          queryClient.invalidateQueries({ queryKey: ["todos"] });
        };

        return <button onClick={handleRefresh}>Refresh</button>;
      }
    `, reactPatternsQueryCacheInvalidationRenderRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a mutation executed during render", () => {
    const findings = check(`
      import { useMutation } from "@tanstack/react-query";

      function SaveButton({ payload, autoSave }) {
        const mutation = useMutation({ mutationFn: saveItem });

        if (autoSave) {
          mutation.mutate(payload);
        }

        return <button>Save</button>;
      }
    `, reactPatternsMutationInRenderRule);

    expect(findings).toHaveLength(1);
  });

  it("allows a mutation from an event handler", () => {
    const findings = check(`
      import { useMutation } from "@tanstack/react-query";

      function SaveButton({ payload }) {
        const { mutate } = useMutation({ mutationFn: saveItem });
        const handleSave = () => mutate(payload);

        return <button onClick={handleSave}>Save</button>;
      }
    `, reactPatternsMutationInRenderRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a lazy component inside a Suspense fallback", () => {
    const findings = check(`
      import { lazy, Suspense } from "react";

      const Page = lazy(() => import("./Page"));
      const Spinner = lazy(() => import("./Spinner"));

      function App() {
        return (
          <Suspense fallback={<Spinner />}>
            <Page />
          </Suspense>
        );
      }
    `, reactPatternsSuspenseFallbackRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts a synchronous Suspense fallback", () => {
    const findings = check(`
      import { lazy, Suspense } from "react";

      const Page = lazy(() => import("./Page"));

      function App() {
        return (
          <Suspense fallback={<div>Loading</div>}>
            <Page />
          </Suspense>
        );
      }
    `, reactPatternsSuspenseFallbackRule);

    expect(findings).toHaveLength(0);
  });

  it("detects an error boundary without a recovery transition", () => {
    const findings = check(`
      import { Component } from "react";

      class ErrorBoundary extends Component {
        componentDidCatch(error) {
          reportError(error);
        }

        render() {
          return this.props.children;
        }
      }
    `, reactPatternsIneffectiveErrorBoundaryRule);

    expect(findings).toHaveLength(1);
  });

  it("accepts an error boundary with derived recovery state", () => {
    const findings = check(`
      import { Component } from "react";

      class ErrorBoundary extends Component {
        static getDerivedStateFromError() {
          return { hasError: true };
        }

        render() {
          return this.state.hasError
            ? <div>Failed</div>
            : this.props.children;
        }
      }
    `, reactPatternsIneffectiveErrorBoundaryRule);

    expect(findings).toHaveLength(0);
  });

  it("accepts componentDidCatch that updates recovery state", () => {
    const findings = check(`
      import React from "react";

      class ErrorBoundary extends React.Component {
        componentDidCatch() {
          this.setState({ hasError: true });
        }

        render() {
          return this.state.hasError
            ? <div>Failed</div>
            : this.props.children;
        }
      }
    `, reactPatternsIneffectiveErrorBoundaryRule);

    expect(findings).toHaveLength(0);
  });

  it("detects a component declared inside another component", () => {
    const findings = check(`
      function List({ items }) {
        function Row({ item }) {
          return <span>{item.name}</span>;
        }

        return (
          <div>
            {items.map((item) => <Row key={item.id} item={item} />)}
          </div>
        );
      }
    `, reactPatternsNestedComponentDefinitionRule);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe(
      "react.patterns.nested-component-definition",
    );
  });

  it("accepts module-scope component declarations", () => {
    const findings = check(`
      function Row({ item }) {
        return <span>{item.name}</span>;
      }

      function List({ items }) {
        return (
          <div>
            {items.map((item) => <Row key={item.id} item={item} />)}
          </div>
        );
      }
    `, reactPatternsNestedComponentDefinitionRule);

    expect(findings).toHaveLength(0);
  });
});
