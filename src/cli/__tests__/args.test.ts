import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../args";

describe("parseCliArgs", () => {
  it("parses workspace review", () => {
    expect(parseCliArgs(["review"])).toEqual({
      kind: "review",
      target: { kind: "workspace" },
    });
  });

  it("parses diff review", () => {
    expect(parseCliArgs(["review", "--diff"])).toEqual({
      kind: "review",
      target: { kind: "diff" },
    });
  });

  it("parses file review", () => {
    expect(parseCliArgs(["review", "--file", "src/main.tsx"])).toEqual({
      kind: "review",
      target: { kind: "file", path: "src/main.tsx" },
    });
  });

  it("rejects unsupported arguments", () => {
    expect(() => parseCliArgs(["review", "--unknown"])).toThrow(
      "Usage: ai-reviewer review [--diff | --file <path>]",
    );
  });
});
