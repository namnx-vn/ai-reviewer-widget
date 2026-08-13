import type { AIProvider } from "../ai/types";
import type { ASTRule } from "../analyzer/ast/rules";
import type { ReactPlugin } from "../react/engine/react-plugin";
import type {
  ReviewFinding,
  ReviewResult,
  ReviewWarning,
} from "../review/types";

export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export interface PluginSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface DeterministicAnalyzerPlugin extends PluginMetadata {
  analyze(
    files: readonly PluginSourceFile[],
  ): {
    readonly findings: readonly ReviewFinding[];
    readonly warnings?: readonly ReviewWarning[];
  };
}

export interface ReviewOutputAdapter<TOutput = string> extends PluginMetadata {
  render(result: ReviewResult): TOutput;
}

export interface ReviewerPlugin extends PluginMetadata {
  readonly astRules?: readonly ASTRule[];
  readonly reactPlugins?: readonly ReactPlugin[];
  readonly analyzers?: readonly DeterministicAnalyzerPlugin[];
  readonly aiProviders?: readonly AIProvider[];
  readonly outputAdapters?: readonly ReviewOutputAdapter[];
}

export interface PluginRegistrySnapshot {
  readonly plugins: readonly ReviewerPlugin[];
  readonly astRules: readonly ASTRule[];
  readonly reactPlugins: readonly ReactPlugin[];
  readonly analyzers: readonly DeterministicAnalyzerPlugin[];
  readonly aiProviders: readonly AIProvider[];
  readonly outputAdapters: readonly ReviewOutputAdapter[];
}
