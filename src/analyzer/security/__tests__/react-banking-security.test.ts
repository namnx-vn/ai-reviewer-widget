import { describe, expect, it } from "vitest";

import { ReactEngine } from "../../../react/engine/react-engine";
import { reactPlugin } from "../../../react/plugins/react-plugin";
import { reactBankingSecurityRules } from "../../../react/rules/security";

function ruleIds(source: string): readonly string[] {
  return new ReactEngine().analyze({ source, file: "src/Banking.tsx", plugins: [reactPlugin] })
    .map((finding) => finding.ruleId);
}

describe("phase 3.6.18 React banking security", () => {
  it("publishes the stable React banking rule set", () => {
    expect(reactBankingSecurityRules.map((rule) => rule.id)).toEqual([
      "security.react.dangerously-set-inner-html",
      "security.react.untrusted-href",
      "security.react.untrusted-src",
      "security.react.external-form-action",
      "security.react.sensitive-local-storage",
      "security.react.sensitive-session-storage",
      "security.react.sensitive-query-param",
      "security.react.third-party-script",
      "security.react.unsafe-iframe",
      "security.react.unsafe-post-message",
      "security.react.missing-opener-protection",
      "security.react.sensitive-autocomplete",
    ]);
  });

  it.each([
    ["dangerous HTML", "const App = ({ html }) => <div dangerouslySetInnerHTML={{ __html: html }} />;", "security.react.dangerously-set-inner-html"],
    ["untrusted href", "const url = location.href; const App = () => <a href={url}>go</a>;", "security.react.untrusted-href"],
    ["untrusted src", "const url = location.href; const App = () => <img src={url} />;", "security.react.untrusted-src"],
    ["external form", "const App = () => <form action=\"https://payments.example.test/collect\"><input /></form>;", "security.react.external-form-action"],
    ["local storage", "localStorage.setItem(\"accessToken\", accessToken);", "security.react.sensitive-local-storage"],
    ["session storage", "sessionStorage.setItem(\"accountId\", accountId);", "security.react.sensitive-session-storage"],
    ["query param", "searchParams.set(\"accountId\", accountId);", "security.react.sensitive-query-param"],
    ["third-party script", "const App = () => <script src=\"https://cdn.example.test/sdk.js\" />;", "security.react.third-party-script"],
    ["unsafe iframe", "const App = () => <iframe src=\"https://external.example.test/frame\" />;", "security.react.unsafe-iframe"],
    ["postMessage wildcard", "window.postMessage({ ok: true }, \"*\");", "security.react.unsafe-post-message"],
    ["opener protection", "const App = () => <a href=\"https://bank.example.test\" target=\"_blank\">open</a>;", "security.react.missing-opener-protection"],
    ["sensitive autocomplete", "const App = () => <input name=\"cvv\" autoComplete=\"on\" />;", "security.react.sensitive-autocomplete"],
  ])("detects %s", (_name, source, ruleId) => {
    expect(ruleIds(source)).toContain(ruleId);
  });

  it("accepts explicit HTML sanitization", () => {
    expect(ruleIds("const App = ({ html }) => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />;"))
      .not.toContain("security.react.dangerously-set-inner-html");
  });

  it("accepts same-origin routes, sandboxed iframes, opener protection, and OTP autocomplete", () => {
    const ids = ruleIds(`
      const App = () => <>
        <a href="/accounts" target="_blank" rel="noopener noreferrer">accounts</a>
        <form action="/transfer"><input name="otp" autoComplete="one-time-code" /></form>
        <iframe src="https://external.example.test/frame" sandbox="allow-scripts" />
      </>;
    `);
    expect(ids).not.toContain("security.react.external-form-action");
    expect(ids).not.toContain("security.react.unsafe-iframe");
    expect(ids).not.toContain("security.react.missing-opener-protection");
    expect(ids).not.toContain("security.react.sensitive-autocomplete");
  });
});
