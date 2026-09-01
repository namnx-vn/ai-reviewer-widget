export type ReviewTarget =
  | { readonly kind: "workspace" }
  | { readonly kind: "diff" }
  | { readonly kind: "file"; readonly path: string };

export type CliOutputFormat = "text" | "json";

export type CliCommand =
  | {
      readonly kind: "review";
      readonly target: ReviewTarget;
      readonly format: CliOutputFormat;
    }
  | { readonly kind: "rules" }
  | { readonly kind: "init" }
  | { readonly kind: "help" }
  | { readonly kind: "version" };

export function parseCliArgs(args: readonly string[]): CliCommand {
  const [command, ...rest] = args;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { kind: "help" };
  }

  if (command === "--version" || command === "-v") {
    assertNoExtraArgs(rest, command);
    return { kind: "version" };
  }

  if (command === "rules") {
    assertNoExtraArgs(rest, "rules");
    return { kind: "rules" };
  }

  if (command === "init") {
    assertNoExtraArgs(rest, "init");
    return { kind: "init" };
  }

  if (command !== "review") {
    throw new Error(`Unknown command: ${command}`);
  }

  return parseReviewArgs(rest, {
    kind: "review",
    target: { kind: "workspace" },
    format: "text",
  });
}

function parseReviewArgs(
  args: readonly string[],
  command: Extract<CliCommand, { readonly kind: "review" }>,
): Extract<CliCommand, { readonly kind: "review" }> {
  const [option, value, ...remaining] = args;
  if (option === undefined) return command;

  if (option === "--format") {
    if (value !== "text" && value !== "json") {
      throw new Error("--format must be either 'text' or 'json'.");
    }
    return parseReviewArgs(remaining, { ...command, format: value });
  }

  if (option === "--diff" && command.target.kind === "workspace") {
    return parseReviewArgs([value, ...remaining].filter(isDefined), {
      ...command,
      target: { kind: "diff" },
    });
  }

  if (option === "--file" && value?.trim() && command.target.kind === "workspace") {
    return parseReviewArgs(remaining, {
      ...command,
      target: { kind: "file", path: value },
    });
  }

  throw new Error("Usage: ai-reviewer review [--diff | --file <path>] [--format text|json]");
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}

function assertNoExtraArgs(args: readonly string[], command: string): void {
  if (args.length > 0) {
    throw new Error(`Command '${command}' does not accept arguments.`);
  }
}
