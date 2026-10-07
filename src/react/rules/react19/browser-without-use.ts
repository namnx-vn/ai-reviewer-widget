import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule, ReactRuleContext } from "../../engine/react-rule";
import { getChildNodes, supportsReact19 } from "./semantic";

const RULE_ID = "react.react19.browser-without-use";

interface ImportedBinding {
  readonly local: TSESTree.Identifier;
  readonly name: string;
}

export const react19BrowserWithoutUseRule: ReactRule = {
  id: RULE_ID,
  description: "Detect React 19.3 browser() calls whose value is not passed to use().",
  rollout: "advisory",

  check(node, context): ReviewFinding[] {
    if (node.type !== "Program" || !supportsReact19(context.framework, 3)) {
      return [];
    }

    const browserBindings = collectNamedImports(node, "react-dom", "browser");
    const useBindings = collectNamedImports(node, "react", "use");
    if (browserBindings.length === 0) {
      return [];
    }

    const invalidCalls: TSESTree.CallExpression[] = [];
    visitWithParent(node, undefined, (child, parent) => {
      if (
        child.type !== "CallExpression" ||
        !isImportedCall(child, browserBindings, context) ||
        isPassedDirectlyToUse(child, parent, useBindings, context)
      ) {
        return;
      }

      invalidCalls.push(child);
    });

    return invalidCalls.map((call) => createFinding(call, context.file));
  },
};

function collectNamedImports(
  program: TSESTree.Program,
  moduleName: string,
  importedName: string,
): readonly ImportedBinding[] {
  return program.body.flatMap((statement) => {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== moduleName) {
      return [];
    }

    return statement.specifiers.flatMap((specifier) => (
      specifier.type === "ImportSpecifier" &&
      specifier.imported.type === "Identifier" &&
      specifier.imported.name === importedName
        ? [{ local: specifier.local, name: specifier.local.name }]
        : []
    ));
  });
}

function isImportedCall(
  call: TSESTree.CallExpression,
  bindings: readonly ImportedBinding[],
  context: ReactRuleContext,
): boolean {
  if (call.callee.type !== "Identifier") {
    return false;
  }

  const callee = call.callee;
  const reference = context.hooks.scopes.references.find(
    (candidate) => candidate.node === callee,
  );

  return bindings.some((binding) => (
    binding.name === callee.name &&
    reference?.declaration?.kind === "import" &&
    reference.declaration.name === binding.local.name
  ));
}

function isPassedDirectlyToUse(
  browserCall: TSESTree.CallExpression,
  parent: TSESTree.Node | undefined,
  useBindings: readonly ImportedBinding[],
  context: ReactRuleContext,
): boolean {
  return parent?.type === "CallExpression" &&
    parent.arguments.some((argument) => argument === browserCall) &&
    isImportedCall(parent, useBindings, context);
}

function visitWithParent(
  node: TSESTree.Node,
  parent: TSESTree.Node | undefined,
  callback: (child: TSESTree.Node, parent: TSESTree.Node | undefined) => void,
): void {
  callback(node, parent);
  for (const child of getChildNodes(node)) {
    visitWithParent(child, node, callback);
  }
}

function createFinding(
  node: TSESTree.CallExpression,
  file: string,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [RULE_ID, file, line, column].join(":"),
    ruleId: RULE_ID,
    title: "browser() result is unused",
    message: "Calling React DOM browser() by itself does not opt this component out of server rendering.",
    severity: "medium",
    source: "ast",
    confidence: 1,
    location: { file, line, column },
    suggestion: "Pass the value directly to React use(), and render the Client Component beneath a Suspense boundary.",
  };
}
