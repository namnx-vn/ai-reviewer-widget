type Node = { readonly key: string };

declare const Fragment: unique symbol;
declare const RenderFromTemplateContext: () => unknown;
declare function createElement(type: unknown, props: unknown, child?: unknown): unknown;
declare function processRoute(key: string): Promise<Node>;

export async function buildParallelRoutes(
  parallelRoutes: Readonly<Record<string, unknown>>,
  Template: unknown,
): Promise<readonly Node[]> {
  const templateNode = Template === Fragment
    ? createElement(RenderFromTemplateContext, null)
    : createElement(Template, null, createElement(RenderFromTemplateContext, null));

  void templateNode;

  const keys = Object.keys(parallelRoutes);
  return keys.length === 1
    ? [await processRoute(keys[0])]
    : Promise.all(keys.map(processRoute));
}
