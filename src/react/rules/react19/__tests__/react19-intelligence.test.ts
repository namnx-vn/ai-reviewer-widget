import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../engine/react-engine";
import { reactPlugin } from "../../../plugins/react-plugin";
import type { FrameworkContext } from "../../../semantic/framework-context";

function framework(version: string): FrameworkContext {
  const [major = 0, minor = 0, patch = 0] = version
    .split(".")
    .map((part) => Number(part));

  return {
    react: {
      detected: true,
      version,
      minimumVersion: { major, minor, patch },
      compiler: "unknown",
    },
  };
}

function analyze(source: string, version = "19.2.0") {
  return new ReactEngine().analyze({
    source,
    file: "example.tsx",
    plugins: [reactPlugin],
    framework: framework(version),
  });
}

describe("React 19 intelligence", () => {
  it("reports React 19.3 browser() used without use()", () => {
    const findings = analyze(`
      import { browser as browserOnly } from "react-dom";

      function LocalTime() {
        browserOnly();
        return <time>{new Date().toString()}</time>;
      }
    `, "19.3.0");

    expect(findings.map((finding) => finding.ruleId)).toContain(
      "react.react19.browser-without-use",
    );
  });

  it("allows use(browser()) in React 19.3", () => {
    const findings = analyze(`
      import { use as read } from "react";
      import { browser as browserOnly } from "react-dom";

      function LocalTime() {
        read(browserOnly());
        return <time>{new Date().toString()}</time>;
      }
    `, "19.3.0");

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "react.react19.browser-without-use",
    );
  });

  it("does not apply browser() guidance before React 19.3", () => {
    const findings = analyze(`
      import { browser } from "react-dom";
      function LocalTime() { browser(); return null; }
    `, "19.2.0");

    expect(findings.map((finding) => finding.ruleId)).not.toContain(
      "react.react19.browser-without-use",
    );
  });

  it("reports an Effect Event included in an effect dependency array", () => {
    const findings = analyze(`
      import { useEffect, useEffectEvent } from "react";

      function Chat({ roomId }) {
        const onConnected = useEffectEvent(() => notify(roomId));
        useEffect(() => {
          connection(roomId).on("connected", onConnected);
        }, [roomId, onConnected]);
        return <span>{roomId}</span>;
      }
    `);

    expect(findings.filter((finding) =>
      finding.ruleId === "react.react19.effect-event-misuse"
    )).toHaveLength(1);
  });

  it("reports an Effect Event passed directly as a JSX event handler", () => {
    const findings = analyze(`
      import { useEffectEvent } from "react";

      function SaveButton({ save }) {
        const onSaved = useEffectEvent(save);
        return <button onClick={onSaved}>Save</button>;
      }
    `);

    expect(findings.filter((finding) =>
      finding.ruleId === "react.react19.effect-event-misuse"
    )).toHaveLength(1);
  });

  it("allows an Effect Event called from an effect and omitted from dependencies", () => {
    const findings = analyze(`
      import { useEffect as useSideEffect, useEffectEvent as useStableEvent } from "react";

      function Chat({ roomId }) {
        const onConnected = useStableEvent(() => notify(roomId));
        useSideEffect(() => {
          connection(roomId).on("connected", () => onConnected());
        }, [roomId]);
        return <span>{roomId}</span>;
      }
    `);

    expect(findings.some((finding) =>
      finding.ruleId === "react.react19.effect-event-misuse"
    )).toBe(false);
  });

  it.each(["18.3.1", "19.0.0", "19.1.1"])(
    "does not apply Effect Event guidance before React 19.2 (%s)",
    (version) => {
      const findings = analyze(`
        import { useEffect, useEffectEvent } from "react";

        function Chat() {
          const onConnected = useEffectEvent(notify);
          useEffect(onConnected, [onConnected]);
          return null;
        }
      `, version);

      expect(findings.some((finding) =>
        finding.ruleId === "react.react19.effect-event-misuse"
      )).toBe(false);
    },
  );

  it("degrades to unknown when no safe React minimum version is available", () => {
    const findings = new ReactEngine().analyze({
      source: `
        import { useEffect, useEffectEvent } from "react";
        function Chat() {
          const onConnected = useEffectEvent(notify);
          useEffect(onConnected, [onConnected]);
          return null;
        }
      `,
      file: "example.tsx",
      plugins: [reactPlugin],
      framework: {
        react: {
          detected: true,
          version: "workspace:*",
          compiler: "unknown",
        },
      },
    });

    expect(findings.some((finding) =>
      finding.ruleId === "react.react19.effect-event-misuse"
    )).toBe(false);
  });

  it("reports React use() inside try/catch", () => {
    const findings = analyze(`
      import { use } from "react";

      function Message({ messagePromise }) {
        try {
          const message = use(messagePromise);
          return <p>{message}</p>;
        } catch {
          return <p>Unavailable</p>;
        }
      }
    `);

    expect(findings.filter((finding) =>
      finding.ruleId === "react.react19.use-in-try-catch"
    )).toHaveLength(1);
  });

  it("allows React use() in a conditional outside try/catch", () => {
    const findings = analyze(`
      import { use as read } from "react";

      function Message({ enabled, messagePromise }) {
        if (enabled) {
          const message = read(messagePromise);
          return <p>{message}</p>;
        }
        return null;
      }
    `);

    expect(findings.some((finding) =>
      finding.ruleId === "react.react19.use-in-try-catch"
    )).toBe(false);
  });

  it("does not mistake a nested function declared in a try block for a guarded use call", () => {
    const findings = analyze(`
      import { use } from "react";

      function Message({ messagePromise }) {
        try {
          function readMessage() {
            return use(messagePromise);
          }
          return <Boundary read={readMessage} />;
        } catch {
          return null;
        }
      }
    `);

    expect(findings.some((finding) =>
      finding.ruleId === "react.react19.use-in-try-catch"
    )).toBe(false);
  });

  it("does not apply use() guidance to an unrelated local function or React 18", () => {
    const localFindings = analyze(`
      function use(value) { return value; }
      function Message({ value }) {
        try { return <p>{use(value)}</p>; } catch { return null; }
      }
    `);
    const react18Findings = analyze(`
      import { use } from "react";
      function Message({ promise }) {
        try { return <p>{use(promise)}</p>; } catch { return null; }
      }
    `, "18.3.1");

    expect(localFindings.some((finding) =>
      finding.ruleId === "react.react19.use-in-try-catch"
    )).toBe(false);
    expect(react18Findings.some((finding) =>
      finding.ruleId === "react.react19.use-in-try-catch"
    )).toBe(false);
  });
});
