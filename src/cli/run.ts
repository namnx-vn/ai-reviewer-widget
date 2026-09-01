import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDefaultReviewUseCases } from "../application/review";
import type { ReviewFinding, ReviewResult } from "../domain/review";
import { parseCliArgs } from "./args";
import { collectDiffFiles, collectTargetFiles, collectWorkspaceFiles } from "./files";
import { loadReviewConfiguration } from "./config-file";
import { formatJsonReviewResult } from "./output-format";

export interface CliIO {
  readonly cwd: string;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export interface CliRuntimeMetadata {
  readonly version: string;
}

export function runCli(
  args: readonly string[],
  io: CliIO,
  metadata: CliRuntimeMetadata = { version: "0.0.0" },
): number {
  try {
    const command = parseCliArgs(args);

    switch (command.kind) {
      case "help":
        io.stdout(helpText());
        return 0;
      case "version":
        io.stdout(`${metadata.version}\n`);
        return 0;
      case "rules":
        io.stdout(rulesText());
        return 0;
      case "init":
        return initializeConfig(io);
      case "review": {
        const configuration = loadReviewConfiguration(io.cwd);
        const files = command.target.kind === "workspace"
          ? collectWorkspaceFiles(io.cwd)
          : command.target.kind === "diff"
            ? collectDiffFiles(io.cwd)
            : collectTargetFiles(io.cwd, command.target.path);

        if (files.length === 0 && command.format === "text") {
          io.stdout("No reviewable source files found.\n");
          return 0;
        }

        const result = createDefaultReviewUseCases().reviewFiles(files, configuration);
        io.stdout(command.format === "json"
          ? formatJsonReviewResult(result)
          : formatReviewResult(result));
        return result.decision === "FAIL" ? 1 : 0;
      }
    }
  } catch (error) {
    io.stderr(`${errorMessage(error)}\n`);
    return 2;
  }
}

function initializeConfig(io: CliIO): number {
  const configPath = resolve(io.cwd, ".ai-reviewer.json");
  if (existsSync(configPath)) {
    io.stderr(".ai-reviewer.json already exists.\n");
    return 2;
  }

  writeFileSync(
    configPath,
    `${JSON.stringify({ version: 1 }, null, 2)}\n`,
    "utf-8",
  );
  io.stdout("Created .ai-reviewer.json\n");
  return 0;
}

export function formatReviewResult(result: ReviewResult): string {
  const lines = [
    `Decision: ${result.decision}`,
    `Score: ${result.score}/100`,
    `Findings: ${result.findings.length}`,
  ];

  for (const finding of result.findings) {
    lines.push(formatFinding(finding));
  }

  for (const warning of result.warnings) {
    lines.push(`[warning:${warning.code}] ${warning.message}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatFinding(finding: ReviewFinding): string {
  const location = finding.location
    ? ` ${finding.location.file}${finding.location.line === undefined ? "" : `:${finding.location.line}`}`
    : "";
  return `[${finding.severity}] ${finding.ruleId}${location} - ${finding.message}`;
}

function helpText(): string {
  return [
    "AI Reviewer CLI",
    "",
    "Usage:",
    "  ai-reviewer review",
    "  ai-reviewer review --diff",
    "  ai-reviewer review --file <path>",
    "  ai-reviewer review [--diff | --file <path>] --format <text|json>",
    "  ai-reviewer rules",
    "  ai-reviewer init",
    "  ai-reviewer --version",
    "",
  ].join("\n");
}

function rulesText(): string {
  return [
    "Built-in deterministic rule families:",
    "  quality       AST quality checks",
    "  architecture  dependency and boundary checks",
    "  react         hooks, rendering, state, context and patterns",
    "  security      security and supply-chain checks",
    "  performance   static performance checks",
    "  mfe           micro-frontend boundary checks",
    "",
  ].join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown CLI error";
}
