import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule, ReactRuleContext } from "../../engine/react-rule";
import {
  collectReactImports,
  isReactApiCall,
  supportsReact19,
  visit,
} from "./semantic";

const RULE_ID = "react.react19.effect-event-misuse";

type MisuseKind = "dependency" | "jsx-prop";

interface EffectEventBinding {
  readonly name: string;
  readonly declaration: TSESTree.Identifier;
}

interface Misuse {
  readonly node: TSESTree.Node;
  readonly binding: EffectEventBinding;
  readonly kind: MisuseKind;
}

export const react19EffectEventMisuseRule: ReactRule = {
  id: RULE_ID,
  description:
    "Detect Effect Events used as reactive dependencies or passed through JSX props.",
  rollout: "advisory",

  check(node, context): ReviewFinding[] {
    if (node.type !== "Program" || !supportsReact19(context.framework, 2)) {
      return [];
    }

    const imports = collectReactImports(node);
    const bindings = collectEffectEventBindings(node, imports);

    if (bindings.length === 0) {
      return [];
    }

    const findings: ReviewFinding[] = [];

    visit(node, (child) => {
      if (child.type === "CallExpression" && isEffectCall(child, imports)) {
        findings.push(...findDependencyMisuses(child, bindings, context));
      }

      if (child.type === "JSXAttribute") {
        const misuse = findJsxMisuse(child, bindings, context);
        if (misuse !== undefined) {
          findings.push(createFinding(misuse, context.file));
        }
      }
    });

    return findings;
  },
};

function collectEffectEventBindings(
  ast: TSESTree.Program,
  imports: ReturnType<typeof collectReactImports>,
): readonly EffectEventBinding[] {
  const bindings: EffectEventBinding[] = [];

  visit(ast, (node) => {
    if (
      node.type !== "VariableDeclarator" ||
      node.id.type !== "Identifier" ||
      node.init?.type !== "CallExpression" ||
      !isReactApiCall(node.init, "useEffectEvent", imports)
    ) {
      return;
    }

    bindings.push({ name: node.id.name, declaration: node.id });
  });

  return bindings;
}

function isEffectCall(
  node: TSESTree.CallExpression,
  imports: ReturnType<typeof collectReactImports>,
): boolean {
  return (
    isReactApiCall(node, "useEffect", imports) ||
    isReactApiCall(node, "useLayoutEffect", imports) ||
    isReactApiCall(node, "useInsertionEffect", imports)
  );
}

function findDependencyMisuses(
  call: TSESTree.CallExpression,
  bindings: readonly EffectEventBinding[],
  context: ReactRuleContext,
): ReviewFinding[] {
  const dependencies = call.arguments[1];
  if (dependencies?.type !== "ArrayExpression") {
    return [];
  }

  const findings: ReviewFinding[] = [];

  for (const dependency of dependencies.elements) {
    if (dependency?.type !== "Identifier") {
      continue;
    }

    const binding = resolveBinding(dependency, bindings, context);
    if (binding !== undefined) {
      findings.push(createFinding({ node: dependency, binding, kind: "dependency" }, context.file));
    }
  }

  return findings;
}

function findJsxMisuse(
  attribute: TSESTree.JSXAttribute,
  bindings: readonly EffectEventBinding[],
  context: ReactRuleContext,
): Misuse | undefined {
  if (attribute.value?.type !== "JSXExpressionContainer") {
    return undefined;
  }

  let misuse: Misuse | undefined;

  visit(attribute.value.expression, (node) => {
    if (misuse !== undefined || node.type !== "Identifier") {
      return;
    }

    const binding = resolveBinding(node, bindings, context);
    if (binding !== undefined) {
      misuse = { node, binding, kind: "jsx-prop" };
    }
  });

  return misuse;
}

function resolveBinding(
  identifier: TSESTree.Identifier,
  bindings: readonly EffectEventBinding[],
  context: ReactRuleContext,
): EffectEventBinding | undefined {
  const reference = context.hooks.scopes.references.find(
    (candidate) => candidate.node === identifier,
  );

  return bindings.find(
    (binding) =>
      binding.name === identifier.name &&
      reference?.declaration?.node === binding.declaration,
  );
}

function createFinding(misuse: Misuse, file: string): ReviewFinding {
  const line = misuse.node.loc?.start.line ?? 1;
  const column = misuse.node.loc?.start.column ?? 0;
  const isDependency = misuse.kind === "dependency";

  return {
    id: [RULE_ID, file, line, column, misuse.kind].join(":"),
    ruleId: RULE_ID,
    title: "Effect Event used outside its non-reactive role",
    message: isDependency
      ? `${misuse.binding.name} is created by useEffectEvent and is included in an Effect dependency array. Effect Events are non-reactive and should not be dependencies.`
      : `${misuse.binding.name} is created by useEffectEvent and is passed through a JSX prop. Effect Events must only be invoked from Effects.`,
    severity: "medium",
    source: "ast",
    location: { file, line, column },
    suggestion: isDependency
      ? `Remove ${misuse.binding.name} from the dependency array; keep reactive values as explicit dependencies.`
      : "Use a regular event handler for JSX interactions and keep the Effect Event inside its owning Effect.",
    confidence: 1,
  };
}
