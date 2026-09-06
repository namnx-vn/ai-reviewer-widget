import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import type { ReactRule } from "../../../engine/react-rule";
import {
  reactHooksExternalSubscriptionGapRule,
  reactHooksStalePromiseRefRule,
} from "../lifecycle-races";
import { reactHooksBrowserSubscriptionGapRule } from "../pre-hydration-navigation";

function analyze(source: string, rules: readonly ReactRule[]) {
  return new ReactEngine().analyze({
    source,
    file: "example.tsx",
    plugins: [{ id: "test", name: "test", version: "1", rules }],
  });
}

describe("React lifecycle recall-gap rules", () => {
  it("detects a promise ref that stays stale when retry changes the active promise", () => {
    const findings = analyze(`
      import { useEffect, useRef } from "react";
      interface QueryResult {
        readonly status: "pending" | "success" | "error";
        readonly fetchStatus: "idle" | "fetching";
        readonly promise: Promise<unknown>;
      }
      export function useQueryPromise(result: QueryResult): Promise<unknown> {
        const promiseRef = useRef(result.promise);
        useEffect(() => {
          if (result.status === "success") promiseRef.current = result.promise;
        }, [result.status]);
        return promiseRef.current;
      }
    `, [reactHooksStalePromiseRefRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.hooks.stale-promise-ref",
    );
  });

  it("accepts a promise ref that tracks promise replacement explicitly", () => {
    const findings = analyze(`
      import { useEffect, useRef } from "react";
      function usePromise(result: { status: string; promise: Promise<unknown> }) {
        const promiseRef = useRef(result.promise);
        useEffect(() => {
          if (result.status === "success") promiseRef.current = result.promise;
        }, [result.status, result.promise]);
        return promiseRef.current;
      }
    `, [reactHooksStalePromiseRefRule]);

    expect(findings).toHaveLength(0);
  });

  it("detects an external-store snapshot gap between render and passive subscription", () => {
    const findings = analyze(`
      import { useEffect, useState } from "react";
      interface Cache<T> { get(): T; subscribe(listener: (value: T) => void): () => void }
      export function useCachedValue<T>(cache: Cache<T>): T {
        const [value, setValue] = useState(() => cache.get());
        useEffect(() => cache.subscribe(setValue), [cache]);
        return value;
      }
    `, [reactHooksExternalSubscriptionGapRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.hooks.external-subscription-gap",
    );
  });

  it("accepts an external-store subscription that reconciles before subscribing", () => {
    const findings = analyze(`
      import { useEffect, useState } from "react";
      interface Cache<T> { get(): T; subscribe(listener: (value: T) => void): () => void }
      export function useCachedValue<T>(cache: Cache<T>): T {
        const [value, setValue] = useState(() => cache.get());
        useEffect(() => {
          setValue(cache.get());
          return cache.subscribe(setValue);
        }, [cache]);
        return value;
      }
    `, [reactHooksExternalSubscriptionGapRule]);

    expect(findings).toHaveLength(0);
  });

  it("detects browser navigation state that can change before hydration subscribes", () => {
    const findings = analyze(`
      import { useEffect, useState } from "react";
      export function useHistoryEntry(): string {
        const [entry, setEntry] = useState(() => window.location.href);
        useEffect(() => {
          const onPopState = () => setEntry(window.location.href);
          window.addEventListener("popstate", onPopState);
          return () => window.removeEventListener("popstate", onPopState);
        }, []);
        return entry;
      }
    `, [reactHooksBrowserSubscriptionGapRule]);

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.hooks.browser-subscription-gap",
    );
  });

  it("accepts browser subscription that reconciles the initial snapshot", () => {
    const findings = analyze(`
      import { useEffect, useState } from "react";
      export function useHistoryEntry(): string {
        const [entry, setEntry] = useState(() => window.location.href);
        useEffect(() => {
          setEntry(window.location.href);
          const onPopState = () => setEntry(window.location.href);
          window.addEventListener("popstate", onPopState);
          return () => window.removeEventListener("popstate", onPopState);
        }, []);
        return entry;
      }
    `, [reactHooksBrowserSubscriptionGapRule]);

    expect(findings).toHaveLength(0);
  });
});
