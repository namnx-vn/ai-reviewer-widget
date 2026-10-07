import type { TSESTree } from "@typescript-eslint/typescript-estree";

import {
  analyzeInterproceduralTaint,
  type TaintFlowAdapter,
  type TaintSanitizer,
  type TaintSink,
  type TaintSource,
} from "../../../../../analyzer/security";
import { classifySensitiveDataName } from "../../../../../analyzer/security/rules/data";
import type { ReviewFinding, Severity } from "../../../../../domain/review";
import type { ReactRule, ReactRuleContext } from "../../../../engine/react-rule";
import {
  actionContainingNode,
  callPath,
  collectServerActions,
  directActionReturns,
  firstCallArgument,
  isEstablishedMutationCall,
  memberPropertyName,
  mutationMethod,
  propertyName,
  type ServerAction,
} from "../../semantic/action";

const OWNER_FIELDS = new Set([
  "ownerId",
  "userId",
]);
const OWNER_MUTATIONS = new Set([
  "create",
  "insert",
  "insertMany",
  "replace",
  "replaceOne",
  "save",
  "update",
  "updateMany",
  "updateOne",
  "upsert",
]);

export const nextjsUnvalidatedActionMutationRule: ReactRule = {
  id: "nextjs.actions.unvalidated-mutation-input",
  description: "Detect unvalidated Server Action input flowing to an established persistence mutation.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !isSupportedContext(context)) return [];
    const actions = collectServerActions(context.ast);
    if (actions.length === 0) return [];

    const matches = analyzeInterproceduralTaint(
      context.ast,
      context.file,
      createMutationInputAdapter(actions),
    );

    return uniqueNodes(matches.map((match) => match.sink.node)).map((sink) => createFinding(
      context,
      sink,
      {
        ruleId: "nextjs.actions.unvalidated-mutation-input",
        title: "Unvalidated Server Action input reaches a mutation",
        message: "Client-controlled Server Action input reaches an established persistence mutation without visible schema validation.",
        severity: "high",
        suggestion: "Parse the action input with an explicit server-side schema and pass only the validated result to the mutation.",
      },
    ));
  },
};

export const nextjsClientControlledOwnerRule: ReactRule = {
  id: "nextjs.actions.client-controlled-owner",
  description: "Detect client-controlled ownership fields written by a Server Action.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !isSupportedContext(context)) return [];
    const actions = collectServerActions(context.ast);
    if (actions.length === 0) return [];

    const matches = analyzeInterproceduralTaint(
      context.ast,
      context.file,
      createOwnerAdapter(actions),
    );

    return uniqueNodes(matches.map((match) => match.sink.node)).map((sink) => createFinding(
      context,
      sink,
      {
        ruleId: "nextjs.actions.client-controlled-owner",
        title: "Client controls a persisted ownership identifier",
        message: "A Server Action persists an ownership identifier derived from client input instead of trusted server-side identity.",
        severity: "high",
        suggestion: "Derive owner and user identifiers from authenticated server-side principal state.",
      },
    ));
  },
};

export const nextjsSensitiveActionReturnRule: ReactRule = {
  id: "nextjs.actions.sensitive-return",
  description: "Detect statically obvious secrets returned from a Server Action.",
  rollout: "advisory",

  check(node, context) {
    if (node !== context.ast || !isSupportedContext(context)) return [];
    const actions = collectServerActions(context.ast);

    return actions.flatMap((action) => directActionReturns(action)
      .filter(containsUnredactedSecret)
      .map((returned) => createFinding(context, returned, {
        ruleId: "nextjs.actions.sensitive-return",
        title: "Sensitive value returned by a Server Action",
        message: "A statically classified credential or secret is returned across the Server Action boundary.",
        severity: "high",
        suggestion: "Keep credentials and secrets on the server; return only the minimum non-sensitive result required by the client.",
      })));
  },
};

interface FindingDetails {
  readonly ruleId: string;
  readonly title: string;
  readonly message: string;
  readonly severity: Severity;
  readonly suggestion: string;
}

function createMutationInputAdapter(actions: readonly ServerAction[]): TaintFlowAdapter {
  return {
    matchSource: (node) => actionParameterSource(actions, node),
    matchSanitizer: validationSanitizer,
    matchSinks(node): readonly TaintSink[] {
      if (node.type !== "CallExpression" || !isEstablishedMutationCall(node)) return [];
      const value = firstCallArgument(node);
      return value === undefined ? [] : [{
        family: "user-input",
        node,
        value,
        label: "Established persistence mutation",
        sinkKind: "unknown",
      }];
    },
  };
}

function createOwnerAdapter(actions: readonly ServerAction[]): TaintFlowAdapter {
  return {
    matchSource: (node) => actionParameterSource(actions, node),
    matchSanitizer: () => undefined,
    matchSinks(node): readonly TaintSink[] {
      if (
        node.type !== "CallExpression" ||
        !isEstablishedMutationCall(node) ||
        !OWNER_MUTATIONS.has(mutationMethod(node) ?? "")
      ) {
        return [];
      }

      return ownershipValues(node).map((value) => ({
        family: "user-input",
        node: value,
        value,
        label: "Persisted ownership field",
        sinkKind: "unknown",
      }));
    },
  };
}

function actionParameterSource(
  actions: readonly ServerAction[],
  node: TSESTree.Node,
): TaintSource | undefined {
  if (node.type !== "Identifier") return undefined;
  const action = actionContainingNode(actions, node);
  if (action === undefined || !action.parameterNames.has(node.name)) return undefined;
  return {
    node,
    label: "Server Action client input",
    sourceKind: "request-input",
    kinds: ["user-input"],
  };
}

function validationSanitizer(node: TSESTree.CallExpression): TaintSanitizer | undefined {
  const path = callPath(node);
  if (path === undefined || !isExplicitValidationPath(path)) return undefined;
  return {
    node,
    label: "Explicit Server Action input validation",
    sanitizerKind: "schema-validation",
    clears: ["user-input"],
    argumentIndex: 0,
  };
}

function isExplicitValidationPath(path: string): boolean {
  if (/(?:Schema|schema)\.(?:parse|parseAsync)$/.test(path)) return true;
  const segments = path.split(".");
  const name = segments[segments.length - 1] ?? "";
  return /^(?:assertValid|parse|validate)[A-Z].*(?:Input|Payload|Form|Data)$/.test(name);
}

function ownershipValues(node: TSESTree.CallExpression): readonly TSESTree.Node[] {
  const payload = firstCallArgument(node);
  if (payload?.type !== "ObjectExpression") return [];

  const dataProperty = payload.properties.find((property) => (
    property.type === "Property" && propertyName(property.key) === "data"
  ));
  const mutationPayload = dataProperty?.type === "Property" ? dataProperty.value : payload;
  return collectNamedPropertyValues(mutationPayload, OWNER_FIELDS);
}

function collectNamedPropertyValues(
  node: TSESTree.Node,
  names: ReadonlySet<string>,
): readonly TSESTree.Node[] {
  if (node.type !== "ObjectExpression") return [];
  const values: TSESTree.Node[] = [];
  for (const property of node.properties) {
    if (property.type !== "Property") continue;
    const name = propertyName(property.key);
    if (name !== undefined && names.has(name)) values.push(property.value);
    values.push(...collectNamedPropertyValues(property.value, names));
  }
  return values;
}

function containsUnredactedSecret(node: TSESTree.Node): boolean {
  if (isRedactionCall(node)) return false;
  if (node.type === "Property") {
    const name = propertyName(node.key);
    if (name !== undefined && isSecretBoundaryName(name)) {
      return !isNullishLiteral(node.value) && !isRedactionCall(node.value);
    }
    return containsUnredactedSecret(node.value);
  }
  if (isSecretNamedNode(node)) return true;
  if (node.type === "ArrayExpression") {
    return node.elements.some((element) => (
      element !== null && containsUnredactedSecret(element)
    ));
  }
  if (node.type === "ObjectExpression") {
    return node.properties.some((property) => containsUnredactedSecret(property));
  }
  if (node.type === "ConditionalExpression") {
    return containsUnredactedSecret(node.consequent) ||
      containsUnredactedSecret(node.alternate);
  }
  if (node.type === "LogicalExpression") {
    return containsUnredactedSecret(node.left) || containsUnredactedSecret(node.right);
  }
  if (node.type === "AwaitExpression" || node.type === "ChainExpression") {
    return containsUnredactedSecret(node.type === "AwaitExpression" ? node.argument : node.expression);
  }
  return node.type === "TSAsExpression" ||
    node.type === "TSNonNullExpression" ||
    node.type === "TSTypeAssertion"
    ? containsUnredactedSecret(node.expression)
    : false;
}

function isSecretNamedNode(node: TSESTree.Node): boolean {
  if (node.type === "Identifier") return isSecretBoundaryName(node.name);
  if (node.type === "MemberExpression") {
    const name = memberPropertyName(node);
    return name !== undefined && isSecretBoundaryName(name);
  }
  if (node.type === "CallExpression") {
    const path = callPath(node);
    const segments = path?.split(".");
    const name = segments?.[segments.length - 1];
    return name !== undefined && isSecretBoundaryName(name);
  }
  return false;
}

function isSecretBoundaryName(name: string): boolean {
  const classifications = classifySensitiveDataName(name);
  return classifications.includes("credential") ||
    classifications.includes("secret") ||
    (classifications.includes("payment-data") && /(?:pan|cvv|cvc)/i.test(name));
}

function isRedactionCall(node: TSESTree.Node): boolean {
  if (node.type !== "CallExpression") return false;
  const path = callPath(node);
  const segments = path?.split(".");
  const name = segments?.[segments.length - 1];
  return name !== undefined && /^(?:mask|redact|sanitizeSensitive)$/.test(name);
}

function isNullishLiteral(node: TSESTree.Node): boolean {
  return node.type === "Literal" && node.value === null ||
    node.type === "Identifier" && node.name === "undefined";
}

function isSupportedContext(context: ReactRuleContext): boolean {
  const router = context.framework?.nextjs?.router;
  return router === "app" || router === "mixed";
}

function uniqueNodes(nodes: readonly TSESTree.Node[]): readonly TSESTree.Node[] {
  const keys = new Set<string>();
  return nodes.filter((node) => {
    const key = node.range?.join(":") ?? `${node.loc?.start.line}:${node.loc?.start.column}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function createFinding(
  context: ReactRuleContext,
  node: TSESTree.Node,
  details: FindingDetails,
): ReviewFinding {
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;
  return {
    id: [details.ruleId, context.file, line, column].join(":"),
    ruleId: details.ruleId,
    title: details.title,
    message: details.message,
    severity: details.severity,
    source: "security",
    confidence: 1,
    location: { file: context.file, line, column },
    suggestion: details.suggestion,
  };
}
