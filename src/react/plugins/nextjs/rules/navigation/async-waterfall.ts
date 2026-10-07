import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReactRule } from "../../../../engine/react-rule";
import { hasEstablishedAppRouterContext } from "../../semantic/project";
import { getAppRouterSpecialFileRole } from "../../semantic/route-segment";
import { createNextFinding } from "../finding";

export const nextjsIndependentAwaitWaterfallRule: ReactRule = {
  id: "next.navigation.async-waterfall",
  description: "Detect consecutive independent static fetches in App Router pages and layouts.",
  rollout: "advisory",

  check(node, context) {
    if (
      node !== context.ast ||
      !hasEstablishedAppRouterContext(context.framework) ||
      !isNavigationRole(getAppRouterSpecialFileRole(context.file))
    ) {
      return [];
    }

    const component = getDefaultAsyncComponent(context.ast);
    if (component === undefined) {
      return [];
    }

    for (let index = 1; index < component.body.body.length; index += 1) {
      const previous = getStaticFetch(component.body.body[index - 1]);
      const current = getStaticFetch(component.body.body[index]);

      if (previous !== undefined && current !== undefined) {
        return [createNextFinding(context.file, current.awaitExpression, {
          ruleId: "next.navigation.async-waterfall",
          title: "Independent requests execute sequentially",
          message: `The fetch for ${current.url} waits for the independent fetch for ${previous.url}, delaying this route segment.`,
          severity: "medium",
          source: "performance",
          suggestion: "Start both requests together and await them with Promise.all so the route segment can resolve concurrently.",
        })];
      }
    }

    return [];
  },
};

type AsyncFunctionWithBlock = (
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression
) & { readonly body: TSESTree.BlockStatement };

interface StaticFetch {
  readonly awaitExpression: TSESTree.AwaitExpression;
  readonly url: string;
}

function getDefaultAsyncComponent(program: TSESTree.Program): AsyncFunctionWithBlock | undefined {
  const defaultExport = program.body.find(
    (statement): statement is TSESTree.ExportDefaultDeclaration =>
      statement.type === "ExportDefaultDeclaration",
  );
  const declaration = defaultExport?.declaration;

  if (
    declaration !== undefined &&
    (declaration.type === "FunctionDeclaration" ||
      declaration.type === "FunctionExpression" ||
      declaration.type === "ArrowFunctionExpression") &&
    declaration.async &&
    declaration.body.type === "BlockStatement"
  ) {
    return declaration as AsyncFunctionWithBlock;
  }

  return undefined;
}

function getStaticFetch(statement: TSESTree.Statement | undefined): StaticFetch | undefined {
  if (
    statement?.type !== "VariableDeclaration" ||
    statement.declarations.length !== 1
  ) {
    return undefined;
  }

  const initializer = statement.declarations[0]?.init;
  if (
    initializer?.type !== "AwaitExpression" ||
    initializer.argument.type !== "CallExpression" ||
    initializer.argument.callee.type !== "Identifier" ||
    initializer.argument.callee.name !== "fetch" ||
    initializer.argument.arguments.length !== 1
  ) {
    return undefined;
  }

  const request = initializer.argument.arguments[0];
  if (request?.type !== "Literal" || typeof request.value !== "string") {
    return undefined;
  }

  return { awaitExpression: initializer, url: request.value };
}

function isNavigationRole(role: string | undefined): boolean {
  return role === "page" || role === "layout";
}
