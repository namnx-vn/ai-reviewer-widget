import type { AIProvider } from "../ai/types";
import type { ASTRule } from "../analyzer/ast/rules";
import type { ReactPlugin } from "../react/engine/react-plugin";
import type {
  DeterministicAnalyzerPlugin,
  PluginRegistrySnapshot,
  ReviewerPlugin,
  ReviewOutputAdapter,
} from "./types";

export class PluginRegistry {
  private readonly pluginsById = new Map<string, ReviewerPlugin>();

  register(plugin: ReviewerPlugin): this {
    assertPluginIdentity(plugin);

    if (this.pluginsById.has(plugin.id)) {
      throw new Error(`Plugin \"${plugin.id}\" is already registered.`);
    }

    validateContributions(plugin);
    this.pluginsById.set(plugin.id, plugin);
    return this;
  }

  registerAll(plugins: readonly ReviewerPlugin[]): this {
    for (const plugin of plugins) {
      this.register(plugin);
    }

    return this;
  }

  has(pluginId: string): boolean {
    return this.pluginsById.has(pluginId);
  }

  get(pluginId: string): ReviewerPlugin | undefined {
    return this.pluginsById.get(pluginId);
  }

  getAIProvider(name: string): AIProvider | undefined {
    return this.snapshot().aiProviders.find((provider) => provider.name === name);
  }

  getOutputAdapter(id: string): ReviewOutputAdapter | undefined {
    return this.snapshot().outputAdapters.find((adapter) => adapter.id === id);
  }

  snapshot(): PluginRegistrySnapshot {
    const plugins = [...this.pluginsById.values()];

    return {
      plugins,
      astRules: collectUnique(plugins.flatMap((plugin) => plugin.astRules ?? []), ruleId),
      reactPlugins: collectUnique(
        plugins.flatMap((plugin) => plugin.reactPlugins ?? []),
        reactPluginId,
      ),
      analyzers: collectUnique(
        plugins.flatMap((plugin) => plugin.analyzers ?? []),
        analyzerId,
      ),
      aiProviders: collectUnique(
        plugins.flatMap((plugin) => plugin.aiProviders ?? []),
        providerName,
      ),
      outputAdapters: collectUnique(
        plugins.flatMap((plugin) => plugin.outputAdapters ?? []),
        outputAdapterId,
      ),
    };
  }
}

export function createPluginRegistry(
  plugins: readonly ReviewerPlugin[] = [],
): PluginRegistry {
  return new PluginRegistry().registerAll(plugins);
}

function assertPluginIdentity(plugin: ReviewerPlugin): void {
  assertNonEmpty("plugin id", plugin.id);
  assertNonEmpty("plugin name", plugin.name);
  assertNonEmpty("plugin version", plugin.version);
}

function validateContributions(plugin: ReviewerPlugin): void {
  collectUnique(plugin.astRules ?? [], ruleId);
  collectUnique(plugin.reactPlugins ?? [], reactPluginId);
  collectUnique(plugin.analyzers ?? [], analyzerId);
  collectUnique(plugin.aiProviders ?? [], providerName);
  collectUnique(plugin.outputAdapters ?? [], outputAdapterId);
}

function collectUnique<T>(
  values: readonly T[],
  getId: (value: T) => string,
): readonly T[] {
  const seen = new Set<string>();

  for (const value of values) {
    const id = getId(value);
    assertNonEmpty("contribution id", id);

    if (seen.has(id)) {
      throw new Error(`Plugin contribution \"${id}\" is registered more than once.`);
    }

    seen.add(id);
  }

  return [...values];
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }
}

function ruleId(rule: ASTRule): string {
  return rule.id;
}

function reactPluginId(plugin: ReactPlugin): string {
  return plugin.id;
}

function analyzerId(analyzer: DeterministicAnalyzerPlugin): string {
  return analyzer.id;
}

function providerName(provider: AIProvider): string {
  return provider.name;
}

function outputAdapterId(adapter: ReviewOutputAdapter): string {
  return adapter.id;
}
