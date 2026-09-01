import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../args";

describe("parseCliArgs", () => {
  it("parses workspace review", () => {
    expect(parseCliArgs(["review"])).toEqual({
      kind: "review",
      format: "text",
      target: { kind: "workspace" },
    });
  });

  it("parses diff review", () => {
    expect(parseCliArgs(["review", "--diff"])).toEqual({
      kind: "review",
      format: "text",
      target: { kind: "diff" },
    });
  });

  it("parses file review", () => {
    expect(parseCliArgs(["review", "--file", "src/main.tsx"])).toEqual({
      kind: "review",
      format: "text",
      target: { kind: "file", path: "src/main.tsx" },
    });
  });

  it("parses JSON output independently of the review target", () => {
    expect(parseCliArgs(["review", "--format", "json", "--file", "src/main.tsx"])).toEqual({
      kind: "review",
      format: "json",
      target: { kind: "file", path: "src/main.tsx" },
    });
    expect(parseCliArgs(["review", "--diff", "--format", "text"])).toEqual({
      kind: "review",
      format: "text",
      target: { kind: "diff" },
    });
  });

  it("parses the version command", () => {
    expect(parseCliArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseCliArgs(["-v"])).toEqual({ kind: "version" });
  });

  it("rejects invalid output formats", () => {
    expect(() => parseCliArgs(["review", "--format", "yaml"])).toThrow(
      "--format must be either 'text' or 'json'",
    );
  });

  it("rejects unsupported arguments", () => {
    expect(() => parseCliArgs(["review", "--unknown"])).toThrow(
      "Usage: ai-reviewer review [--diff | --file <path>]",
    );
  });
});
