import type { TSESTree } from "@typescript-eslint/typescript-estree";

import { parseSource } from "../analyzer/ast/parser";
import type { ReviewFinding } from "../domain/review";
import type { MicroFrontendSourceFile } from "./types";

const SHARED_REACT_PACKAGES = ["react", "react-dom"] as const;
type SharedReactPackage = typeof SHARED_REACT_PACKAGES[number];
type ConfigValue =
  | TSESTree.ArrayExpression
  | TSESTree.ObjectExpression
  | TSESTree.Literal;

interface SharedVersion {
  readonly file: string;
  readonly packageName: SharedReactPackage;
  readonly version: string;
  readonly node: ConfigValue;
}

export function analyzeModuleFederation(
  files: readonly MicroFrontendSourceFile[],
): ReviewFinding[] {
  const configFiles = files.filter((file) => isModuleFederationConfig(file.path));

  return [
    ...configFiles.flatMap((file) => (
    isModuleFederationConfig(file.path)
      ? analyzeConfig(file)
      : []
    )),
    ...analyzeSharedVersionDrift(configFiles),
  ];
}

function analyzeConfig(file: MicroFrontendSourceFile): ReviewFinding[] {
  const ast = parseSource(file.content);
  const findings: ReviewFinding[] = [];

  visit(ast, (node) => {
    if (node.type !== "ObjectExpression" || !hasProperty(node, "remotes")) {
      return;
    }

    const shared = getPropertyValue(node, "shared");

    if (shared?.type === "ArrayExpression") {
      findings.push(...analyzeArrayShared(file.path, shared));
      return;
    }

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

    findings.push(...findInsecureRemoteUrls(file.path, node));
  });

  return findings;
}

function analyzeArrayShared(
  file: string,
  shared: TSESTree.ArrayExpression,
): ReviewFinding[] {
  return shared.elements.flatMap((element) => {
    if (element?.type !== "Literal" || typeof element.value !== "string") {
      return [];
    }

    return isSharedReactPackage(element.value)
      ? [createSingletonFinding(file, element.value, element)]
      : [];
  });
}

function isSharedReactPackage(value: string): value is SharedReactPackage {
  return value === "react" || value === "react-dom";
}

function analyzeSharedVersionDrift(
  files: readonly MicroFrontendSourceFile[],
): ReviewFinding[] {
  const versions = files.flatMap(collectSharedVersions);
  const findings: ReviewFinding[] = [];

  for (const packageName of SHARED_REACT_PACKAGES) {
    const packageVersions = versions.filter((entry) => entry.packageName === packageName);
    const first = packageVersions[0];

    if (
      first === undefined ||
      packageVersions.every((entry) => entry.version === first.version)
    ) {
      continue;
    }

    const conflicting = packageVersions.find((entry) => entry.version !== first.version);

    if (conflicting !== undefined) {
      findings.push(createVersionDriftFinding(packageName, first, conflicting));
    }
  }

  return findings;
}

function collectSharedVersions(file: MicroFrontendSourceFile): SharedVersion[] {
  const ast = parseSource(file.content);
  const versions: SharedVersion[] = [];

  visit(ast, (node) => {
    if (node.type !== "ObjectExpression") {
      return;
    }

    const shared = getPropertyValue(node, "shared");

    if (shared?.type !== "ObjectExpression") {
      return;
    }

    for (const packageName of SHARED_REACT_PACKAGES) {
      const share = getPropertyValue(shared, packageName);
      const version = share === undefined ? undefined : getRequiredVersion(share);

      if (version !== undefined && share !== undefined) {
        versions.push({ file: file.path, packageName, version, node: share });
      }
    }
  });

  return versions;
}

function findInsecureRemoteUrls(
  file: string,
  config: TSESTree.ObjectExpression,
): ReviewFinding[] {
  const remotes = getPropertyValue(config, "remotes");

  if (remotes?.type !== "ObjectExpression") {
    return [];
  }

  return remotes.properties.flatMap((property) => {
    if (
      property.type !== "Property" ||
      property.value.type !== "Literal" ||
      typeof property.value.value !== "string" ||
      !isInsecureRemoteUrl(property.value.value)
    ) {
      return [];
    }

    return [createInsecureRemoteUrlFinding(file, property.value)];
  });
}

function isInsecureRemoteUrl(remote: string): boolean {
  const url = remote.slice(remote.indexOf("@") + 1);

  return (
    url.startsWith("http://") &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/.test(url)
  );
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
    property.value.type === "ArrayExpression" ||
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
  const version = getRequiredVersion(share);

  if (version === undefined) {
    return undefined;
  }

  return version.match(/\d+/)?.[0];
}

function getRequiredVersion(share: ConfigValue): string | undefined {
  if (share.type !== "ObjectExpression") {
    return undefined;
  }

  const version = getPropertyValue(share, "requiredVersion");

  return version?.type === "Literal" && typeof version.value === "string"
    ? version.value
    : undefined;
}

function createSingletonFinding(
  file: string,
  packageName: SharedReactPackage,
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

function createVersionDriftFinding(
  packageName: SharedReactPackage,
  expected: SharedVersion,
  conflicting: SharedVersion,
): ReviewFinding {
  const ruleId = "mfe.module-federation.shared-version-drift";
  const line = conflicting.node.loc?.start.line ?? 1;
  const column = conflicting.node.loc?.start.column ?? 0;

  return {
    id: [ruleId, conflicting.file, line, column].join(":"),
    ruleId,
    title: `Shared ${packageName} version drift`,
    message: `${packageName} is shared as ${expected.version} in ${expected.file} but ${conflicting.version} in ${conflicting.file}, risking incompatible host and remote runtimes.`,
    severity: "high",
    source: "architecture",
    confidence: 1,
    location: { file: conflicting.file, line, column },
    suggestion: `Align the shared ${packageName} requiredVersion across every Module Federation host and remote.`,
  };
}

function createInsecureRemoteUrlFinding(
  file: string,
  node: TSESTree.Literal,
): ReviewFinding {
  const ruleId = "mfe.module-federation.insecure-remote-url";
  const line = node.loc?.start.line ?? 1;
  const column = node.loc?.start.column ?? 0;

  return {
    id: [ruleId, file, line, column].join(":"),
    ruleId,
    title: "Insecure remote entry URL",
    message: "This remote entry uses HTTP outside localhost, allowing the remote bundle to be modified in transit.",
    severity: "high",
    source: "architecture",
    confidence: 1,
    location: { file, line, column },
    suggestion: "Use an HTTPS remote entry URL for every production host and remote.",
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
