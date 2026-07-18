import { describe, expect, it } from "vitest";

import { parseSource } from "../../src/analyzer/ast/parser";
import {
  browserSecurityRules,
  SecurityAnalysisEngine,
  SecurityRuleRegistry,
} from "../../src/analyzer/security";

function analyze(source: string, file = "src/browser.ts") {
  const registry = new SecurityRuleRegistry();
  for (const rule of browserSecurityRules) {
    registry.register(rule);
  }

  return new SecurityAnalysisEngine().analyze({
    source,
    file,
    ast: parseSource(source),
  }, registry);
}

function ruleIds(source: string): readonly string[] {
  return analyze(source).map((finding) => finding.ruleId);
}

describe("phase 3.6.3 xss and browser security", () => {
  it("registers the nine stable browser security rule IDs", () => {
    expect(browserSecurityRules.map((rule) => rule.meta.id)).toEqual([
      "security.xss.inner-html",
      "security.xss.outer-html",
      "security.xss.document-write",
      "security.xss.insert-adjacent-html",
      "security.xss.javascript-url",
      "security.xss.untrusted-url",
      "security.xss.open-redirect",
      "security.browser.post-message-origin",
      "security.browser.unsafe-window-open",
    ]);
  });

  it.each([
    [
      "innerHTML",
      `element.innerHTML = location.hash;`,
      "security.xss.inner-html",
    ],
    [
      "outerHTML",
      `element.outerHTML = document.URL;`,
      "security.xss.outer-html",
    ],
    [
      "document.write",
      `document.write(location.search);`,
      "security.xss.document-write",
    ],
    [
      "insertAdjacentHTML",
      `element.insertAdjacentHTML("beforeend", localStorage.getItem("markup"));`,
      "security.xss.insert-adjacent-html",
    ],
    [
      "javascript URL",
      `link.href = "java" + "script:alert(1)";`,
      "security.xss.javascript-url",
    ],
    [
      "untrusted URL",
      `link.href = location.hash;`,
      "security.xss.untrusted-url",
    ],
    [
      "open redirect",
      `location.href = new URLSearchParams(location.search).get("next");`,
      "security.xss.open-redirect",
    ],
    [
      "postMessage wildcard origin",
      `window.postMessage({ type: "refresh" }, "*");`,
      "security.browser.post-message-origin",
    ],
    [
      "unsafe window.open",
      `window.open(location.hash, "_blank");`,
      "security.browser.unsafe-window-open",
    ],
  ])("detects %s", (_name, source, expectedRuleId) => {
    expect(ruleIds(source)).toContain(expectedRuleId);
  });

  it("tracks browser source aliases, propagation, optional chaining, and message data", () => {
    const aliased = `
      const doc = document;
      const loc = window.location;
      const first = loc.hash;
      const second = first;
      doc.write(second);
    `;
    const optional = `element.innerHTML = window?.location?.hash;`;
    const message = `
      window.addEventListener("message", (event) => {
        const markup = event.data;
        element.innerHTML = markup;
      });
    `;

    expect(ruleIds(aliased)).toContain("security.xss.document-write");
    expect(ruleIds(optional)).toContain("security.xss.inner-html");
    expect(ruleIds(message)).toContain("security.xss.inner-html");
  });

  it("keeps HTML and URL sanitizer classes sink-aware", () => {
    const safeHtml = `
      import DOMPurify from "dompurify";
      element.innerHTML = DOMPurify.sanitize(location.hash);
    `;
    const wrongHtmlSanitizer = `
      element.innerHTML = encodeURIComponent(location.hash);
    `;
    const safeUrl = `
      import { sanitizeUrl } from "@braintree/sanitize-url";
      link.href = sanitizeUrl(location.hash);
    `;
    const redirectStillUnsafe = `
      import { sanitizeUrl } from "@braintree/sanitize-url";
      location.href = sanitizeUrl(location.hash);
    `;
    const htmlSanitizerDoesNotValidateRedirect = `
      import DOMPurify from "dompurify";
      location.href = DOMPurify.sanitize(location.hash);
    `;

    expect(ruleIds(safeHtml)).not.toContain("security.xss.inner-html");
    expect(ruleIds(wrongHtmlSanitizer)).toContain("security.xss.inner-html");
    expect(ruleIds(safeUrl)).not.toContain("security.xss.untrusted-url");
    expect(ruleIds(redirectStillUnsafe)).toContain("security.xss.open-redirect");
    expect(ruleIds(htmlSanitizerDoesNotValidateRedirect)).toContain("security.xss.open-redirect");
  });

  it("detects dynamic postMessage origins but accepts explicit trusted origins", () => {
    const dynamic = `window.postMessage("ready", location.hash);`;
    const trusted = `window.postMessage("ready", "https://bank.example");`;
    const optionsWildcard = `window.postMessage("ready", { targetOrigin: "*" });`;

    expect(ruleIds(dynamic)).toContain("security.browser.post-message-origin");
    expect(ruleIds(trusted)).not.toContain("security.browser.post-message-origin");
    expect(ruleIds(optionsWildcard)).toContain("security.browser.post-message-origin");
  });

  it("accepts noopener and current-context window.open calls", () => {
    const noopener = `window.open(location.hash, "_blank", "noopener");`;
    const current = `window.open(location.hash, "_self");`;

    expect(ruleIds(noopener)).not.toContain("security.browser.unsafe-window-open");
    expect(ruleIds(current)).not.toContain("security.browser.unsafe-window-open");
  });

  it("does not flag constants or unrelated safe browser assignments", () => {
    const source = `
      element.textContent = location.hash;
      element.innerHTML = "<strong>Trusted</strong>";
      link.href = "/accounts";
      location.href = "/dashboard";
      window.postMessage("ready", "https://bank.example");
      window.open("/help", "_blank", "noopener");
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("suppresses shadowed browser globals", () => {
    const source = `
      function render(location: { hash: string }) {
        element.innerHTML = location.hash;
      }

      function launch(window: { open(value: string): void }) {
        window.open(location.hash);
      }
    `;

    expect(analyze(source)).toEqual([]);
  });

  it("emits exact source and sink evidence with a deterministic flow", () => {
    const source = `
      const fragment = location.hash;
      const markup = `<div>${fragment}</div>`;
      element.innerHTML = markup;
    `;

    const findings = analyze(source).filter(
      (finding) => finding.ruleId === "security.xss.inner-html",
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.flow?.at(0)?.kind).toBe("source");
    expect(findings[0]?.flow?.some((step) => step.kind === "transform")).toBe(true);
    expect(findings[0]?.flow?.at(-1)?.kind).toBe("sink");
    expect(findings[0]?.evidence).toHaveLength(2);
  });

  it("produces stable finding IDs and ordering", () => {
    const source = `
      element.innerHTML = location.hash;
      link.href = location.search;
      window.postMessage("ready", "*");
    `;

    const first = analyze(source);
    const second = analyze(source);

    expect(first.map((finding) => finding.id)).toEqual(second.map((finding) => finding.id));
    expect(first.map((finding) => finding.ruleId)).toEqual(second.map((finding) => finding.ruleId));
  });
});
