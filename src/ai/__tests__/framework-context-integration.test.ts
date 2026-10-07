import { describe, expect, it, vi } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";

describe("verified framework context integration", () => {
  it("adds deterministic framework facts to the bounded AI request", async () => {
    const review = vi.fn(async () => ({ findings: [] }));
    const useCases = createDefaultReviewUseCases();

    await useCases.reviewPullRequest({
      title: "React change",
      files: [
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { react: "19.3.0" } }),
        },
        {
          path: "src/App.tsx",
          content: "export function App() { return <main />; }",
          patch: "+export function App() { return <main />; }",
        },
      ],
    }, { name: "test", review });

    expect(review).toHaveBeenCalledOnce();
    const request = review.mock.calls[0]?.[0];
    expect(request?.deterministicFindings).toContain("VERIFIED FRAMEWORK CONTEXT");
    expect(request?.deterministicFindings).toContain('"version":"19.3.0"');
    expect(request?.deterministicFindings).toContain('"compiler":"unknown"');
    expect(request?.deterministicFindings).toContain('"detected":false');
  });
});
