export type ReviewTarget =
  | { readonly kind: "workspace" }
  | { readonly kind: "diff" }
  | { readonly kind: "file"; readonly path: string };

export type CliCommand =
  | { readonly kind: "review"; readonly target: ReviewTarget }
  | { readonly kind: "rules" }
  | { readonly kind: "init" }
  | { readonly kind: "help" };

export function parseCliArgs(args: readonly string[]): CliCommand {
  const [command, ...rest] = args;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { kind: "help" };
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

  if (rest.length === 0) {
    return { kind: "review", target: { kind: "workspace" } };
  }

  if (rest.length === 1 && rest[0] === "--diff") {
    return { kind: "review", target: { kind: "diff" } };
  }

  if (rest.length === 2 && rest[0] === "--file" && rest[1]?.trim()) {
    return { kind: "review", target: { kind: "file", path: rest[1] } };
  }

  throw new Error("Usage: ai-reviewer review [--diff | --file <path>]");
}

function assertNoExtraArgs(args: readonly string[], command: string): void {
  if (args.length > 0) {
    throw new Error(`Command '${command}' does not accept arguments.`);
  }
}
