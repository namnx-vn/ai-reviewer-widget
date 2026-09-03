import {
  DEFAULT_AI_CONTEXT_BUDGET,
  selectAIRepositoryContext,
} from "../../ai/context-selector";
import { prepareAIReviewContext } from "../../ai/input-policy";
import type { AIProvider } from "../../ai/types";
import { parseAIResult } from "../../ai/parser";
import {
  BUILT_IN_ANALYZER_ORDER,
  buildRepositoryContext,
  createDeterministicAnalyzerAdapter,
  createReactAnalyzerContribution,
  type AnalyzerContribution,
} from "../../analyzer";
import type { ASTRule } from "../../analyzer/ast/rules";
import { DEFAULT_REVIEW_CONFIGURATION } from "../../config";
import type { ResolvedReviewConfiguration } from "../../config";
import { evaluateSecurityReviewQualityGate } from "../../analyzer/security/quality-gate";
import { ReviewEngine } from "../../engine/review-engine";
import { nextjsPlugin, reactPlugin } from "../../react";
import type { ReactPlugin } from "../../react/engine";
import type {
  AIReviewerPort,
  DeterministicReviewResult,
  PreparedAIReviewInput,
  ReviewApplicationDependencies,
  SourceFile,
} from "./ports";
import { createReviewUseCases, type ReviewUseCases } from "./use-cases";

export interface DefaultReviewCompositionOptions {
  readonly astRules?: readonly ASTRule[];
  readonly analyzerContributions?: readonly AnalyzerContribution[];
  readonly configuration?: ResolvedReviewConfiguration;
}

export function createDefaultReviewUseCases(
  options: DefaultReviewCompositionOptions = {},
): ReviewUseCases {
  return createReviewUseCases(createDefaultDependencies(options));
}

function createDefaultDependencies(
  options: DefaultReviewCompositionOptions,
): ReviewApplicationDependencies {
  return {
    configuration: options.configuration ?? DEFAULT_REVIEW_CONFIGURATION,
    deterministic: {
      analyze: (files, selection, incrementalScope) =>
        analyzeDeterministicFiles(files, options, selection, incrementalScope),
    },
    pipeline: {
      execute: (input) => new ReviewEngine().execute({
        deterministicFindings: input.deterministicFindings,
        warnings: input.warnings,
        aiProvider: input.aiReviewer === undefined ? undefined : toAIProvider(input.aiReviewer),
        aiInput: input.aiInput,
        aiKnownFiles: input.aiKnownFiles,
      }),
    },
    prepareAIInput: prepareBoundedAIInput,
    evaluateQualityGate: (input) => evaluateSecurityReviewQualityGate(input),
    now: () => performance.now(),
  };
}

function prepareBoundedAIInput(input: {
  readonly title: string;
  readonly description?: string;
  readonly deterministicFindings: string;
  readonly files: readonly SourceFile[];
}): PreparedAIReviewInput {
  const repositoryContext = buildRepositoryContext(input.files);
  const changedFiles = input.files.filter((file) => file.patch !== undefined && file.patch.trim().length > 0);
  const changedPaths = changedFiles.map((file) => file.path);
  const context = selectAIRepositoryContext({
    files: input.files,
    changedPaths,
    repositoryContext,
    budget: DEFAULT_AI_CONTEXT_BUDGET,
  });
  const selectedContext = context.files.map((file) => ({
    path: file.path,
    patch: `REPOSITORY CONTEXT (depth ${file.dependencyDepth}):\n${file.content}`,
  }));
  const prepared = prepareAIReviewContext({
    title: input.title,
    description: input.description,
    deterministicFindings: input.deterministicFindings,
    files: [...changedFiles, ...selectedContext],
  });
  return {
    ...prepared,
    truncated: prepared.truncated || context.truncated,
    omittedFiles: prepared.omittedFiles + context.omittedFiles,
  };
}

function toAIProvider(reviewer: AIReviewerPort): AIProvider {
  return {
    name: reviewer.name,
    async review(input) {
      const result = await reviewer.review(input);
      return parseAIResult(result);
    },
  };
}

function analyzeDeterministicFiles(
  files: readonly SourceFile[],
  options: DefaultReviewCompositionOptions,
  selection?: Parameters<ReturnType<typeof createDeterministicAnalyzerAdapter>["analyze"]>[1],
  incrementalScope?: Parameters<ReturnType<typeof createDeterministicAnalyzerAdapter>["analyze"]>[2],
): DeterministicReviewResult {
  return createDeterministicAnalyzerAdapter({
    astRules: options.astRules,
    contributions: [
      createReactAnalyzerContribution(
        "core.react",
        BUILT_IN_ANALYZER_ORDER.react,
        getReactPlugins,
      ),
      ...(options.analyzerContributions ?? []),
    ],
  }).analyze(files, selection, incrementalScope);
}

function getReactPlugins(path: string): readonly ReactPlugin[] {
  return isAppRouterFile(path) ? [reactPlugin, nextjsPlugin] : [reactPlugin];
}

function isAppRouterFile(path: string): boolean {
  return /(^|\/)app(?:\/[^/]+)*\/(?:page|layout|template|loading|error|not-found|route)\.(?:tsx|jsx)$/.test(
    path.replace(/\\/g, "/"),
  );
}
