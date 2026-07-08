import { beforeEach, describe, expect, it, vi } from "vitest";

const octokitMocks = vi.hoisted(() => ({
  checksCreate: vi.fn(),
  getContent: vi.fn(),
  paginate: vi.fn(),
  pullsGet: vi.fn(),
  reviewCreate: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly checks = { create: octokitMocks.checksCreate };
    readonly pulls = {
      createReview: octokitMocks.reviewCreate,
      get: octokitMocks.pullsGet,
      listFiles: vi.fn(),
    };
    readonly repos = { getContent: octokitMocks.getContent };
    readonly paginate = octokitMocks.paginate;
  },
}));

import { GitHubClient } from "../../src/github/client";

describe("GitHubClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads PR metadata and maps supported file statuses", async () => {
    octokitMocks.pullsGet.mockResolvedValue({ data: {
      title: "Improve review",
      body: null,
      base: { sha: "base" },
      head: { sha: "head" },
    } });
    octokitMocks.paginate.mockResolvedValue([{ filename: "src/App.ts", status: "modified", additions: 2, deletions: 1, changes: 3, patch: "@@" }]);

    const result = await new GitHubClient("token").getPullRequest("owner", "repo", 8);

    expect(result).toEqual(expect.objectContaining({
      owner: "owner",
      repo: "repo",
      number: 8,
      title: "Improve review",
      headSha: "head",
      body: undefined,
      files: [expect.objectContaining({ filename: "src/App.ts", status: "modified" })],
    }));
  });

  it("rejects unknown GitHub file statuses", async () => {
    octokitMocks.paginate.mockResolvedValue([{ filename: "src/App.ts", status: "copied", additions: 0, deletions: 0, changes: 0 }]);

    await expect(new GitHubClient("token").getFiles("owner", "repo", 8))
      .rejects.toThrow("Unsupported pull request file status: copied");
  });

  it("decodes a base64 file and rejects directory responses", async () => {
    octokitMocks.getContent.mockResolvedValueOnce({ data: {
      type: "file",
      content: Buffer.from("export const answer = 42;", "utf8").toString("base64"),
    } });
    const client = new GitHubClient("token");

    await expect(client.getFileContent("owner", "repo", "src/a.ts", "head"))
      .resolves.toBe("export const answer = 42;");

    octokitMocks.getContent.mockResolvedValueOnce({ data: [] });
    await expect(client.getFileContent("owner", "repo", "src", "head"))
      .rejects.toThrow("Unable to read file: src");
  });
});
