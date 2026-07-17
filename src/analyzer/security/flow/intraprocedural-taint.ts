import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  SecurityFlowStep,
  SecurityLocation,
} from "../model/types";
import type {
  TaintFlowAdapter,
  TaintFlowMatch,
  TaintKind,
  TaintState,
  TaintStep,
} from "./types";

const TAINT_KIND_ORDER: readonly TaintKind[] = [
  "command",
  "sql",
  "nosql",
  "template",
  "expression",
  "crlf",
  "header",
  "ldap",
  "xpath",
  "graphql",
];

type Environment = Map<string, TaintState>;

export function analyzeIntraproceduralTaint(
  ast: TSESTree.Program,
  file: string,
  adapter: TaintFlowAdapter,
): readonly TaintFlowMatch[] {
  const matches: TaintFlowMatch[] = [];
  const environment: Environment = new Map();

  walkNode(ast, environment, file, adapter, matches, true);

  return matches;
}

function walkNode(
  node: TSESTree.Node,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
  matches: TaintFlowMatch[],
  isRootBlock = false,
): void {
  switch (node.type) {
    case "Program":
      for (const statement of node.body) {
        walkNode(statement, environment, file, adapter, matches);
      }
      return;

    case "BlockStatement": {
      const blockEnvironment = isRootBlock ? environment : new Map(environment);
      const inheritedNames = new Set(environment.keys());

      for (const statement of node.body) {
        walkNode(statement, blockEnvironment, file, adapter, matches);
      }

      if (!isRootBlock) {
        for (const name of inheritedNames) {
          const state = blockEnvironment.get(name);
          if (state === undefined) {
            environment.delete(name);
          } else {
            environment.set(name, state);
          }
        }
      }
      return;
    }

    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const functionEnvironment = new Map(environment);
      for (const parameter of node.params) {
        clearPattern(parameter, functionEnvironment);
      }
      walkNode(node.body, functionEnvironment, file, adapter, matches, true);
      return;
    }

    case "VariableDeclaration":
      for (const declarator of node.declarations) {
        if (declarator.init === null) {
          clearPattern(declarator.id, environment);
          continue;
        }

        inspectExpression(declarator.init, environment, file, adapter, matches);
        const state = evaluateNode(declarator.init, environment, file, adapter);
        bindPattern(declarator.id, state, environment, file);
      }
      return;

    case "ExpressionStatement":
      inspectExpression(node.expression, environment, file, adapter, matches);
      return;

    case "ReturnStatement":
    case "ThrowStatement":
      if (node.argument !== null) {
        inspectExpression(node.argument, environment, file, adapter, matches);
      }
      return;

    case "IfStatement": {
      inspectExpression(node.test, environment, file, adapter, matches);
      const consequentEnvironment = new Map(environment);
      const alternateEnvironment = new Map(environment);

      walkNode(node.consequent, consequentEnvironment, file, adapter, matches);
      if (node.alternate !== null) {
        walkNode(node.alternate, alternateEnvironment, file, adapter, matches);
      }

      mergeEnvironments(environment, consequentEnvironment, alternateEnvironment);
      return;
    }

    case "WhileStatement":
    case "DoWhileStatement":
      inspectExpression(node.test, environment, file, adapter, matches);
      walkNode(node.body, environment, file, adapter, matches);
      return;

    case "ForStatement":
      if (node.init !== null) {
        if (node.init.type === "VariableDeclaration") {
          walkNode(node.init, environment, file, adapter, matches);
        } else {
          inspectExpression(node.init, environment, file, adapter, matches);
        }
      }
      if (node.test !== null) {
        inspectExpression(node.test, environment, file, adapter, matches);
      }
      walkNode(node.body, environment, file, adapter, matches);
      if (node.update !== null) {
        inspectExpression(node.update, environment, file, adapter, matches);
      }
      return;

    case "ForInStatement":
    case "ForOfStatement":
      inspectExpression(node.right, environment, file, adapter, matches);
      if (node.left.type === "VariableDeclaration") {
        walkNode(node.left, environment, file, adapter, matches);
      } else {
        const state = evaluateNode(node.right, environment, file, adapter);
        bindPattern(node.left, state, environment, file);
      }
      walkNode(node.body, environment, file, adapter, matches);
      return;

    case "TryStatement":
      walkNode(node.block, environment, file, adapter, matches);
      if (node.handler !== null) {
        const catchEnvironment = new Map(environment);
        if (node.handler.param !== null) {
          clearPattern(node.handler.param, catchEnvironment);
        }
        walkNode(node.handler.body, catchEnvironment, file, adapter, matches, true);
        mergeEnvironments(environment, environment, catchEnvironment);
      }
      if (node.finalizer !== null) {
        walkNode(node.finalizer, environment, file, adapter, matches);
      }
      return;
  }

  for (const child of getChildNodes(node)) {
    walkNode(child, environment, file, adapter, matches);
  }
}

function inspectExpression(
  node: TSESTree.Node,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
  matches: TaintFlowMatch[],
): void {
  if (node.type === "AssignmentExpression") {
    inspectExpression(node.right, environment, file, adapter, matches);
    const state = evaluateNode(node.right, environment, file, adapter);
    bindPattern(node.left, state, environment, file);
    return;
  }

  if (node.type === "UpdateExpression") {
    return;
  }

  if (node.type === "CallExpression") {
    recordSinks(node, environment, file, adapter, matches);
  }

  if (
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  ) {
    walkNode(node, environment, file, adapter, matches);
    return;
  }

  for (const child of getChildNodes(node)) {
    inspectExpression(child, environment, file, adapter, matches);
  }
}

function recordSinks(
  node: TSESTree.CallExpression,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
  matches: TaintFlowMatch[],
): void {
  for (const sink of adapter.matchSinks(node)) {
    const state = evaluateNode(sink.value, environment, file, adapter);
    if (state === undefined || !state.kinds.includes(sink.family)) {
      continue;
    }

    const sinkLocation = getLocation(sink.node, file);
    const flow: SecurityFlowStep[] = state.steps.map((step) => ({
      kind: step.kind === "propagation" ? "transform" : step.kind,
      label: step.label,
      location: step.location,
      sourceKind: step.sourceKind,
      sanitizerKind: step.sanitizerKind,
    }));

    flow.push({
      kind: "sink",
      label: sink.label,
      location: sinkLocation,
      sinkKind: sink.sinkKind,
    });

    matches.push({
      family: sink.family,
      sink,
      state,
      flow,
    });
  }
}

function evaluateNode(
  node: TSESTree.Node,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
): TaintState | undefined {
  const source = adapter.matchSource(node);
  if (source !== undefined) {
    return {
      kinds: orderKinds(source.kinds),
      steps: [{
        kind: "source",
        label: source.label,
        location: getLocation(source.node, file),
        sourceKind: source.sourceKind,
      }],
    };
  }

  switch (node.type) {
    case "Identifier":
      return environment.get(node.name);

    case "Literal":
    case "TemplateElement":
      return undefined;

    case "TemplateLiteral":
      return mergeStates(node.expressions.map((expression) => (
        evaluateNode(expression, environment, file, adapter)
      )));

    case "BinaryExpression":
    case "LogicalExpression":
      return mergeStates([
        evaluateNode(node.left, environment, file, adapter),
        evaluateNode(node.right, environment, file, adapter),
      ]);

    case "ConditionalExpression":
      return mergeStates([
        evaluateNode(node.consequent, environment, file, adapter),
        evaluateNode(node.alternate, environment, file, adapter),
      ]);

    case "AssignmentExpression":
      return evaluateNode(node.right, environment, file, adapter);

    case "AwaitExpression":
    case "ChainExpression":
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSTypeAssertion":
      return evaluateNode(node.expression, environment, file, adapter);

    case "UnaryExpression":
    case "UpdateExpression":
      return evaluateNode(node.argument, environment, file, adapter);

    case "ArrayExpression":
      return mergeStates(node.elements.map((element) => (
        element === null ? undefined : evaluateNode(element, environment, file, adapter)
      )));

    case "ObjectExpression":
      return mergeStates(node.properties.map((property) => {
        if (property.type === "SpreadElement") {
          return evaluateNode(property.argument, environment, file, adapter);
        }
        return evaluateNode(property.value, environment, file, adapter);
      }));

    case "MemberExpression":
      return mergeStates([
        evaluateNode(node.object, environment, file, adapter),
        node.computed ? evaluateNode(node.property, environment, file, adapter) : undefined,
      ]);

    case "CallExpression": {
      const sanitizer = adapter.matchSanitizer(node);
      if (sanitizer !== undefined) {
        const argument = node.arguments[sanitizer.argumentIndex];
        if (argument === undefined || argument.type === "SpreadElement") {
          return undefined;
        }

        const input = evaluateNode(argument, environment, file, adapter);
        if (input === undefined) {
          return undefined;
        }

        const remainingKinds = input.kinds.filter(
          (kind) => !sanitizer.clears.includes(kind),
        );
        const sanitizerStep: TaintStep = {
          kind: "sanitizer",
          label: sanitizer.label,
          location: getLocation(node, file),
          sanitizerKind: sanitizer.sanitizerKind,
        };

        return {
          kinds: orderKinds(remainingKinds),
          steps: dedupeSteps([...input.steps, sanitizerStep]),
        };
      }

      return mergeStates(node.arguments.map((argument) => (
        argument.type === "SpreadElement"
          ? evaluateNode(argument.argument, environment, file, adapter)
          : evaluateNode(argument, environment, file, adapter)
      )));
    }
  }

  return mergeStates(getChildNodes(node).map((child) => (
    evaluateNode(child, environment, file, adapter)
  )));
}

function bindPattern(
  pattern: TSESTree.Node,
  state: TaintState | undefined,
  environment: Environment,
  file: string,
): void {
  switch (pattern.type) {
    case "Identifier":
      if (state === undefined) {
        environment.delete(pattern.name);
      } else {
        environment.set(pattern.name, {
          kinds: state.kinds,
          steps: dedupeSteps([
            ...state.steps,
            {
              kind: "propagation",
              label: `Assigned to ${pattern.name}`,
              location: getLocation(pattern, file),
            },
          ]),
        });
      }
      return;

    case "AssignmentPattern":
      bindPattern(pattern.left, state, environment, file);
      return;

    case "RestElement":
      bindPattern(pattern.argument, state, environment, file);
      return;

    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) {
          bindPattern(element, state, environment, file);
        }
      }
      return;

    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          bindPattern(property.argument, state, environment, file);
        } else {
          bindPattern(property.value, state, environment, file);
        }
      }
      return;
  }
}

function clearPattern(pattern: TSESTree.Node, environment: Environment): void {
  switch (pattern.type) {
    case "Identifier":
      environment.delete(pattern.name);
      return;
    case "AssignmentPattern":
      clearPattern(pattern.left, environment);
      return;
    case "RestElement":
      clearPattern(pattern.argument, environment);
      return;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element !== null) {
          clearPattern(element, environment);
        }
      }
      return;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          clearPattern(property.argument, environment);
        } else {
          clearPattern(property.value, environment);
        }
      }
      return;
  }
}

function mergeEnvironments(
  target: Environment,
  first: Environment,
  second: Environment,
): void {
  const names = [...new Set([...first.keys(), ...second.keys()])].sort();
  target.clear();

  for (const name of names) {
    const state = mergeStates([first.get(name), second.get(name)]);
    if (state !== undefined) {
      target.set(name, state);
    }
  }
}

function mergeStates(
  states: readonly (TaintState | undefined)[],
): TaintState | undefined {
  const present = states.filter((state): state is TaintState => state !== undefined);
  if (present.length === 0) {
    return undefined;
  }

  const kinds = orderKinds(present.flatMap((state) => state.kinds));
  const steps = dedupeSteps(present.flatMap((state) => state.steps));

  return { kinds, steps };
}

function orderKinds(kinds: readonly TaintKind[]): readonly TaintKind[] {
  const kindSet = new Set(kinds);
  return TAINT_KIND_ORDER.filter((kind) => kindSet.has(kind));
}

function dedupeSteps(steps: readonly TaintStep[]): readonly TaintStep[] {
  const seen = new Set<string>();
  const result: TaintStep[] = [];

  for (const step of steps) {
    const range = step.location?.range;
    const key = [
      step.kind,
      step.label,
      step.location?.path ?? "",
      String(range?.start ?? -1),
      String(range?.end ?? -1),
      step.sourceKind ?? "",
      step.sanitizerKind ?? "",
    ].join(":");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(step);
  }

  return result;
}

function getLocation(node: TSESTree.Node, file: string): SecurityLocation {
  return {
    path: file,
    line: node.loc?.start.line,
    column: node.loc?.start.column,
    range: node.range === undefined
      ? undefined
      : { start: node.range[0], end: node.range[1] },
  };
}

function getChildNodes(node: TSESTree.Node): readonly TSESTree.Node[] {
  const children: TSESTree.Node[] = [];

  for (const value of Object.values(node)) {
    if (isNode(value)) {
      children.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          children.push(item);
        }
      }
    }
  }

  return children.sort((left, right) => (
    (left.range?.[0] ?? Number.MAX_SAFE_INTEGER) -
    (right.range?.[0] ?? Number.MAX_SAFE_INTEGER)
  ));
}

function isNode(value: unknown): value is TSESTree.Node {
  return typeof value === "object" && value !== null && "type" in value &&
    typeof value.type === "string";
}
