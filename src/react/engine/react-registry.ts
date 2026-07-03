import type { ReactPlugin } from "./react-plugin";
import type { ReactRule } from "./react-rule";

export class ReactRuleRegistry {
  private readonly plugins = new Map<
    string,
    ReactPlugin
  >();

  register(plugin: ReactPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(
        `React plugin "${plugin.id}" is already registered.`,
      );
    }

    this.plugins.set(plugin.id, plugin);
  }

  unregister(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): ReactPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  getPlugins(): readonly ReactPlugin[] {
    return [...this.plugins.values()];
  }

  getRules(): readonly ReactRule[] {
    return this.getPlugins().flatMap(
      (plugin) => plugin.rules,
    );
  }

  has(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  clear(): void {
    this.plugins.clear();
  }
}