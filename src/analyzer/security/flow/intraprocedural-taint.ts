import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type {
  SecurityFlowStep,
} from "../model/types";
import type {
  TaintFlowAdapter,
  TaintFlowMatch,
  InterproceduralTaintOptions,
  TaintProperty,
  TaintState,
  TaintStep,
} from "./types";
import {
  dedupeSteps,
  getChildNodes,
  getLocation,
  orderKinds,
} from "./taint-evidence";

type Environment = Map<string, TaintState>;
type LocalFunction = TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;

interface LocalFunctionAnalysis {
  readonly functions: ReadonlyMap<string, LocalFunction>;
  readonly activeCalls: Set<string>;
  readonly maxDepth: number;
}

const LOCAL_FUNCTIONS = new WeakMap<TaintFlowAdapter, LocalFunctionAnalysis>();

/**
 * Runs the bounded same-file call-graph pass. It deliberately resolves only
 * statically named local functions and aliases; unresolved calls preserve their
 * argument taint rather than being considered sanitizers.
 */
export function analyzeInterproceduralTaint(
  ast: TSESTree.Program,
  file: string,
  adapter: TaintFlowAdapter,
  options: InterproceduralTaintOptions = {},
): readonly TaintFlowMatch[] {
  return analyzeTaint(ast, file, adapter, options.maxCallDepth ?? 8);
}

export function analyzeIntraproceduralTaint(
  ast: TSESTree.Program,
  file: string,
  adapter: TaintFlowAdapter,
): readonly TaintFlowMatch[] {
  return analyzeTaint(ast, file, adapter, 1);
}

function analyzeTaint(
  ast: TSESTree.Program,
  file: string,
  adapter: TaintFlowAdapter,
  maxDepth: number,
): readonly TaintFlowMatch[] {
  const matches: TaintFlowMatch[] = [];
  const environment: Environment = new Map();

  LOCAL_FUNCTIONS.set(adapter, {
    functions: collectLocalFunctions(ast),
    activeCalls: new Set(),
    maxDepth,
  });

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
  recordSinks(node, environment, file, adapter, matches);

  if (node.type === "CallExpression") {
    inspectLocalFunctionCall(node, environment, file, adapter, matches);
  }

  if (node.type === "AssignmentExpression") {
    inspectExpression(node.right, environment, file, adapter, matches);
    const state = evaluateNode(node.right, environment, file, adapter);
    bindPattern(node.left, state, environment, file);
    return;
  }

  if (node.type === "UpdateExpression") {
    return;
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

function inspectLocalFunctionCall(
  node: TSESTree.CallExpression,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
  matches: TaintFlowMatch[],
): void {
  if (node.callee.type !== "Identifier") return;
  const analysis = LOCAL_FUNCTIONS.get(adapter);
  const declaration = analysis?.functions.get(node.callee.name);
  if (declaration === undefined) return;
  if (analysis === undefined || analysis.activeCalls.has(node.callee.name) || analysis.activeCalls.size >= analysis.maxDepth) return;

  const callEnvironment = new Map(environment);
  declaration.params.forEach((parameter, index) => {
    const argument = node.arguments[index];
    const state = argument === undefined || argument.type === "SpreadElement"
      ? undefined
      : evaluateNode(argument, environment, file, adapter);
    bindPattern(parameter, state, callEnvironment, file);
  });
  analysis.activeCalls.add(node.callee.name);
  try {
    walkNode(declaration.body, callEnvironment, file, adapter, matches, true);
  } finally {
    analysis.activeCalls.delete(node.callee.name);
  }
}

function collectLocalFunctions(ast: TSESTree.Program): ReadonlyMap<string, LocalFunction> {
  const functions = new Map<string, LocalFunction>();
  for (const statement of ast.body) {
    if (statement.type === "FunctionDeclaration" && statement.id !== null) {
      functions.set(statement.id.name, statement);
    }
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        if (declaration.id.type !== "Identifier" || declaration.init === null) continue;
        if (isLocalFunction(declaration.init)) {
          functions.set(declaration.id.name, declaration.init);
        } else if (declaration.init.type === "Identifier") {
          const target = functions.get(declaration.init.name);
          if (target !== undefined) functions.set(declaration.id.name, target);
        }
      }
    }
  }
  return functions;
}

function isLocalFunction(node: TSESTree.Node): node is LocalFunction {
  return node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression";
}

function evaluateLocalFunctionReturn(
  call: TSESTree.CallExpression,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
): TaintState | undefined {
  if (call.callee.type !== "Identifier") return undefined;
  const analysis = LOCAL_FUNCTIONS.get(adapter);
  const declaration = analysis?.functions.get(call.callee.name);
  if (analysis === undefined || declaration === undefined) return undefined;

  // A cycle or the configured depth bound yields the conservative normal call
  // behaviour below, which keeps argument taint intact without inventing paths.
  if (analysis.activeCalls.has(call.callee.name) || analysis.activeCalls.size >= analysis.maxDepth) {
    return undefined;
  }

  const functionEnvironment = new Map(environment);
  declaration.params.forEach((parameter, index) => {
    const argument = call.arguments[index];
    const state = argument === undefined || argument.type === "SpreadElement"
      ? undefined
      : evaluateNode(argument, environment, file, adapter);
    bindPattern(parameter, state, functionEnvironment, file);
  });

  analysis.activeCalls.add(call.callee.name);
  try {
    const returned = evaluateFunctionBodyReturn(declaration.body, functionEnvironment, file, adapter);
    if (returned === undefined) return undefined;
    return {
      kinds: returned.kinds,
      steps: dedupeSteps([...returned.steps, {
        kind: "propagation",
        label: `Returned from ${call.callee.name}`,
        location: getLocation(call, file),
      }]),
      properties: returned.properties,
    };
  } finally {
    analysis.activeCalls.delete(call.callee.name);
  }
}

function evaluateFunctionBodyReturn(
  body: TSESTree.BlockStatement | TSESTree.Expression,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
): TaintState | undefined {
  if (body.type !== "BlockStatement") return evaluateNode(body, environment, file, adapter);
  const returns: (TaintState | undefined)[] = [];
  for (const statement of body.body) {
    if (statement.type === "VariableDeclaration") {
      for (const declaration of statement.declarations) {
        const state = declaration.init === null ? undefined : evaluateNode(declaration.init, environment, file, adapter);
        bindPattern(declaration.id, state, environment, file);
      }
      continue;
    }
    if (statement.type === "ExpressionStatement" && statement.expression.type === "AssignmentExpression") {
      const state = evaluateNode(statement.expression.right, environment, file, adapter);
      bindPattern(statement.expression.left, state, environment, file);
      continue;
    }
    if (statement.type === "ReturnStatement") {
      returns.push(statement.argument === null ? undefined : evaluateNode(statement.argument, environment, file, adapter));
      continue;
    }
    if (statement.type === "IfStatement") {
      returns.push(
        evaluateBranchReturn(statement.consequent, new Map(environment), file, adapter),
        statement.alternate === null ? undefined : evaluateBranchReturn(statement.alternate, new Map(environment), file, adapter),
      );
    }
  }
  return mergeStates(returns);
}

function evaluateBranchReturn(
  node: TSESTree.Statement,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
): TaintState | undefined {
  if (node.type === "ReturnStatement") {
    return node.argument === null ? undefined : evaluateNode(node.argument, environment, file, adapter);
  }
  return node.type === "BlockStatement"
    ? evaluateFunctionBodyReturn(node, environment, file, adapter)
    : undefined;
}

function recordSinks(
  node: TSESTree.Node,
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
      return evaluateNode(node.argument, environment, file, adapter);

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
      return evaluateObjectExpression(node, environment, file, adapter);
    case "MemberExpression": {
      const objectState = evaluateNode(node.object, environment, file, adapter);
      const propertyName = memberPropertyName(node);
      if (objectState !== undefined && propertyName !== undefined) {
        const property = objectState.properties?.find(({ name }) => name === propertyName);
        if (property !== undefined) {
          return property.state;
        }
      }
      return mergeStates([
        objectState,
        node.computed ? evaluateNode(node.property, environment, file, adapter) : undefined,
      ]);
    }

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
          properties: input.properties,
        };
      }

      const localReturn = evaluateLocalFunctionReturn(node, environment, file, adapter);
      if (localReturn !== undefined) return localReturn;

      return mergeStates([
        evaluateNode(node.callee, environment, file, adapter),
        ...node.arguments.map((argument) => (
          argument.type === "SpreadElement"
            ? evaluateNode(argument.argument, environment, file, adapter)
            : evaluateNode(argument, environment, file, adapter)
        )),
      ]);
    }

    case "NewExpression":
      return mergeStates([
        evaluateNode(node.callee, environment, file, adapter),
        ...node.arguments.map((argument) => (
          argument.type === "SpreadElement"
            ? evaluateNode(argument.argument, environment, file, adapter)
            : evaluateNode(argument, environment, file, adapter)
        )),
      ]);
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
          properties: state.properties,
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
          const trackedProperty = state?.properties?.find(
            ({ name }) => name === objectPatternPropertyName(property),
          );
          const propertyState = trackedProperty?.state ?? (trackedProperty === undefined ? state : undefined);
          bindPattern(property.value, propertyState, environment, file);
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

  return { kinds, steps, properties: mergeProperties(present) };
}

function evaluateObjectExpression(
  node: TSESTree.ObjectExpression,
  environment: Environment,
  file: string,
  adapter: TaintFlowAdapter,
): TaintState | undefined {
  const properties = node.properties.flatMap((property) => {
    if (property.type === "SpreadElement") {
      return evaluateNode(property.argument, environment, file, adapter)?.properties ?? [];
    }
    const name = objectExpressionPropertyName(property);
    const state = evaluateNode(property.value, environment, file, adapter);
    return name === undefined ? [] : [{ name, state }];
  });
  const merged = mergeStates(properties.map(({ state }) => state));
  return merged === undefined ? undefined : { ...merged, properties };
}

function mergeProperties(states: readonly TaintState[]): readonly TaintProperty[] | undefined {
  const grouped = new Map<string, TaintState[]>();
  for (const state of states) {
    for (const property of state.properties ?? []) {
      const values = grouped.get(property.name) ?? [];
      if (property.state !== undefined) values.push(property.state);
      grouped.set(property.name, values);
    }
  }
  const properties = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([name, values]) => {
    const state = mergeStates(values);
    return [{ name, state }];
  });
  return properties.length === 0 ? undefined : properties;
}

function memberPropertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") return node.property.name;
  return node.computed && node.property.type === "Literal" && typeof node.property.value === "string"
    ? node.property.value : undefined;
}

function objectExpressionPropertyName(property: TSESTree.Property): string | undefined {
  if (!property.computed && property.key.type === "Identifier") return property.key.name;
  return property.key.type === "Literal" && typeof property.key.value === "string" ? property.key.value : undefined;
}

function objectPatternPropertyName(property: TSESTree.Property): string | undefined {
  return objectExpressionPropertyName(property);
}
