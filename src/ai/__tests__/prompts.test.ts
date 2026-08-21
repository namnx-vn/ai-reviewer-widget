import { describe, expect, it } from "vitest";

import { buildReviewPrompt } from "../prompts";

it("scopes a specialist prompt to assigned concerns", () => {
  const prompt = buildReviewPrompt({
    pullRequestTitle: "Security change",
    diff: "diff",
    deterministicFindings: "[]",
    focus: {
      agent: "security",
      role: "Security Engineer",
      concerns: ["authorization boundaries", "sensitive data exposure"],
    },
  });

  expect(prompt).toContain("Agent: security");
  expect(prompt).toContain("Role: Security Engineer");
  expect(prompt).toContain("- authorization boundaries");
  expect(prompt).toContain("issues outside your assigned specialist scope");
});

describe("buildReviewPrompt", () => {
  it("keeps the general review prompt when no specialist is assigned", () => {
    const prompt = buildReviewPrompt({
      pullRequestTitle: "General change",
      diff: "diff",
      deterministicFindings: "[]",
    });

    expect(prompt).not.toContain("SPECIALIST ASSIGNMENT");
    expect(prompt).toContain("1. Correctness");
  });
});
