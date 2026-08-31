import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewFiles } from "../review/reviewer";
import type { ReviewFinding, ReviewResult } from "../review/types";
import { parseCliArgs } from "./args";
import { collectDiffFiles, collectTargetFiles, collectWorkspaceFiles } from "./files";

export interface CliIO {
  readonly cwd: string;
  readonly stdout: (message: string) => void;
  readonly stderr: (message: string) => void;
}

export function runCli(args: readonly string[], io: CliIO): number {
  try {
    const command = parseCliArgs(args);

    switch (command.kind) {
      case "help":
        io.stdout(helpText());
        return 0;
      case "rules":
        io.stdout(rulesText());
        return 0;
      case "init":
        return initializeConfig(io);
      case "review": {
        const files = command.target.kind === "workspace"
          ? collectWorkspaceFiles(io.cwd)
          : command.target.kind === "diff"
            ? collectDiffFiles(io.cwd)
            : collectTargetFiles(io.cwd, command.target.path);

        if (files.length === 0) {
          io.stdout("No reviewable source files found.\n");
          return 0;
        }

        const result = reviewFiles(files);
        io.stdout(formatReviewResult(result));
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
    "  ai-reviewer rules",
    "  ai-reviewer init",
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
