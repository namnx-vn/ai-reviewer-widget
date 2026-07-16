import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../analyzer/ast/parser";
import type { ReviewFinding } from "../review/types";
import type { MicroFrontendSourceFile } from "./types";

const SHARED_REACT_PACKAGES = ["react", "react-dom"] as const;
type ConfigValue = TSESTree.ObjectExpression | TSESTree.Literal;

export function analyzeModuleFederation(
  files: readonly MicroFrontendSourceFile[],
): ReviewFinding[] {
  return files.flatMap((file) => (
    isModuleFederationConfig(file.path)
      ? analyzeConfig(file)
      : []
  ));
}

function analyzeConfig(file: MicroFrontendSourceFile): ReviewFinding[] {
  const ast = parseSource(file.content);
  const findings: ReviewFinding[] = [];

  visit(ast, (node) => {
    if (node.type !== "ObjectExpression" || !hasProperty(node, "remotes")) {
      return;
    }

    const shared = getPropertyValue(node, "shared");

    if (shared?.type !== "ObjectExpression") {
      return;
    }

    for (const packageName of SHARED_REACT_PACKAGES) {
      const share = getPropertyValue(shared, packageName);

      if (share === undefined || isSingletonShare(share)) {
        continue;
      }

      findings.push(createSingletonFinding(file.path, packageName, share));
    }

    const versionMismatch = findReactVersionMismatch(shared);

    if (versionMismatch !== undefined) {
      findings.push(createVersionMismatchFinding(file.path, versionMismatch));
    }
  });

  return findings;
}

function isModuleFederationConfig(path: string): boolean {
  return /(?:module[-.]federation(?:\.config)?|webpack\.config)\.[cm]?[jt]s$/i.test(path);
}

function hasProperty(node: TSESTree.ObjectExpression, name: string): boolean {
  return getPropertyValue(node, name) !== undefined;
}

function getPropertyValue(
  node: TSESTree.ObjectExpression,
  name: string,
): ConfigValue | undefined {
  const property = node.properties.find((candidate) => (
    candidate.type === "Property" &&
    !candidate.computed &&
    getPropertyName(candidate.key) === name
  ));

  if (property?.type !== "Property") {
    return undefined;
  }

  return (
    property.value.type === "ObjectExpression" ||
    property.value.type === "Literal"
  )
    ? property.value
    : undefined;
}

function getPropertyName(node: TSESTree.Expression | TSESTree.PrivateIdentifier): string | undefined {
  if (node.type === "Identifier") {
    return node.name;
  }

  return node.type === "Literal" && typeof node.value === "string"
    ? node.value
    : undefined;
}

function isSingletonShare(value: ConfigValue): boolean {
  if (value.type !== "ObjectExpression") {
    return false;
  }

  const singleton = getPropertyValue(value, "singleton");

  return singleton?.type === "Literal" && singleton.value === true;
}

function findReactVersionMismatch(
  shared: TSESTree.ObjectExpression,
): ConfigValue | undefined {
  const react = getPropertyValue(shared, "react");
  const reactDom = getPropertyValue(shared, "react-dom");

  if (react === undefined || reactDom === undefined) {
    return undefined;
  }

  const reactMajor = getRequiredVersionMajor(react);
  const reactDomMajor = getRequiredVersionMajor(reactDom);

  return (
    reactMajor !== undefined &&
    reactDomMajor !== undefined &&
    reactMajor !== reactDomMajor
  )
    ? reactDom
    : undefined;
}

function getRequiredVersionMajor(
  share: ConfigValue,
): string | undefined {
  if (share.type !== "ObjectExpression") {
    return undefined;
  }

  const version = getPropertyValue(share, "requiredVersion");

  if (version?.type !== "Literal" || typeof version.value !== "string") {
    return undefined;
  }

  return version.value.match(/\d+/)?.[0];
}

function createSingletonFinding(
  file: string,
  packageName: typeof SHARED_REACT_PACKAGES[number],
  node: ConfigValue,
): ReviewFinding {
  const ruleId = `mfe.module-federation.${packageName}-singleton`;
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [ruleId, file, line, column].join(":"),
    ruleId,
    title: `${packageName} must be shared as a singleton`,
    message: `Module Federation shares ${packageName} without singleton: true, which can load multiple React runtimes and break hooks or context identity across boundaries.`,
    severity: "high",
    source: "architecture",
    confidence: 1,
    location: { file, line, column },
    suggestion: `Configure shared.${packageName}.singleton as true and align its required version across host and remotes.`,
  };
}

function createVersionMismatchFinding(
  file: string,
  node: ConfigValue,
): ReviewFinding {
  const ruleId = "mfe.module-federation.react-version-mismatch";
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [ruleId, file, line, column].join(":"),
    ruleId,
    title: "React shared-version mismatch",
    message: "The shared react and react-dom requirements resolve to different major versions, which can create incompatible renderers across Micro Frontend boundaries.",
    severity: "high",
    source: "architecture",
    confidence: 1,
    location: { file, line, column },
    suggestion: "Align the shared react and react-dom requiredVersion values to the same major version in every host and remote.",
  };
}

function visit(
  node: TSESTree.Node,
  callback: (node: TSESTree.Node) => void,
): void {
  callback(node);

  for (const [key, value] of Object.entries(node)) {
    if (["parent", "loc", "range", "tokens", "comments"].includes(key)) {
      continue;
    }

    if (isNode(value)) {
      visit(value, callback);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          visit(item, callback);
        }
      }
    }
  }
}

function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
  );
}
