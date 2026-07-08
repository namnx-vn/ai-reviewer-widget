import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.rendering.callback-misuse";

type CallbackReferenceKind =
    | "intrinsic-jsx-prop"
    | "component-jsx-prop"
    | "direct-call"
    | "hook-dependency"
    | "external-usage"
    | "unknown";

interface CallbackReference {
    readonly node: TSESTree.Identifier;
    readonly kind: CallbackReferenceKind;
}

export const reactRenderingCallbackMisuseRule: ReactRule = {
    id: RULE_ID,

    description:
        "Detect useCallback calls whose stable identity does not provide a meaningful rendering benefit.",

    check(node, context): ReviewFinding[] {
        if (
            node.type !== "CallExpression" ||
            !isUseCallbackCall(node)
        ) {
            return [];
        }

        const declaration = findCallbackDeclaration(node, context.ast);

        if (declaration === undefined) {
            return [];
        }

        const callbackName = getDeclaredName(declaration);

        if (callbackName === undefined) {
            return [];
        }

        const references = collectReferences(
            callbackName,
            declaration,
            context.ast,
        );

        if (references.length === 0) {
            return [
                createFinding(
                    node,
                    context.file,
                    callbackName,
                    "unused",
                ),
            ];
        }

        if (hasIdentitySensitiveUsage(references)) {
            return [];
        }

        if (!references.every(isIdentityInsensitiveReference)) {
            return [];
        }

        return [
            createFinding(
                node,
                context.file,
                callbackName,
                "identity-insensitive",
            ),
        ];
    },
};

function isUseCallbackCall(
    node: TSESTree.CallExpression,
): boolean {
    if (
        node.callee.type === "Identifier" &&
        node.callee.name === "useCallback"
    ) {
        return true;
    }

    return (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "React" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "useCallback"
    );
}

function findCallbackDeclaration(
    call: TSESTree.CallExpression,
    ast: TSESTree.Program,
): TSESTree.VariableDeclarator | undefined {
    let result: TSESTree.VariableDeclarator | undefined;

    visit(ast, (node) => {
        if (
            result === undefined &&
            node.type === "VariableDeclarator" &&
            node.init === call
        ) {
            result = node;
        }
    });

    return result;
}

function getDeclaredName(
    declaration: TSESTree.VariableDeclarator,
): string | undefined {
    return declaration.id.type === "Identifier"
        ? declaration.id.name
        : undefined;
}

function collectReferences(
    name: string,
    declaration: TSESTree.VariableDeclarator,
    ast: TSESTree.Program,
): CallbackReference[] {
    const references: CallbackReference[] = [];

    visitWithParent(ast, undefined, (node, parent) => {
        if (
            node.type !== "Identifier" ||
            node.name !== name
        ) {
            return;
        }

        if (node === declaration.id) {
            return;
        }

        if (!isReferenceIdentifier(node, parent)) {
            return;
        }

        references.push({
            node,
            kind: classifyReference(node, ast),
        });
    });

    return references;
}

function classifyReference(
    identifier: TSESTree.Identifier,
    ast: TSESTree.Program,
): CallbackReferenceKind {
    const parent = findParent(ast, identifier);

    if (parent === undefined) {
        return "unknown";
    }

    if (
        parent.type === "CallExpression" &&
        parent.callee === identifier
    ) {
        return "direct-call";
    }

    if (
        parent.type === "JSXExpressionContainer"
    ) {
        return classifyJsxReference(parent, ast);
    }

    if (
        parent.type === "ArrayExpression" &&
        isHookDependencyArray(parent, ast)
    ) {
        return "hook-dependency";
    }

    if (
        parent.type === "CallExpression" &&
        parent.arguments.some(
            (argument) => argument === identifier,
        )
    ) {
        return "external-usage";
    }

    if (
        parent.type === "ReturnStatement" ||
        parent.type === "AssignmentExpression" ||
        parent.type === "Property" ||
        parent.type === "ArrayExpression"
    ) {
        return "external-usage";
    }

    return "unknown";
}

function classifyJsxReference(
    container: TSESTree.JSXExpressionContainer,
    ast: TSESTree.Program,
): CallbackReferenceKind {
    const attribute = findParent(ast, container);

    if (attribute?.type !== "JSXAttribute") {
        return "unknown";
    }

    const openingElement = findParent(ast, attribute);

    if (openingElement?.type !== "JSXOpeningElement") {
        return "unknown";
    }

    return isIntrinsicJsxElement(openingElement)
        ? "intrinsic-jsx-prop"
        : "component-jsx-prop";
}

function isIntrinsicJsxElement(
    node: TSESTree.JSXOpeningElement,
): boolean {
    if (node.name.type !== "JSXIdentifier") {
        return false;
    }

    const firstCharacter = node.name.name[0];

    return (
        firstCharacter !== undefined &&
        firstCharacter === firstCharacter.toLowerCase()
    );
}

function isHookDependencyArray(
    array: TSESTree.ArrayExpression,
    ast: TSESTree.Program,
): boolean {
    const parent = findParent(ast, array);

    if (
        parent?.type !== "CallExpression" ||
        parent.arguments[1] !== array
    ) {
        return false;
    }

    return isHookCall(parent);
}

function isHookCall(
    node: TSESTree.CallExpression,
): boolean {
    if (node.callee.type === "Identifier") {
        return /^use[A-Z0-9]/u.test(node.callee.name);
    }

    return (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.property.type === "Identifier" &&
        /^use[A-Z0-9]/u.test(node.callee.property.name)
    );
}

function hasIdentitySensitiveUsage(
    references: readonly CallbackReference[],
): boolean {
    return references.some(
        ({ kind }) =>
            kind === "component-jsx-prop" ||
            kind === "hook-dependency" ||
            kind === "external-usage",
    );
}

function isIdentityInsensitiveReference(
    reference: CallbackReference,
): boolean {
    return (
        reference.kind === "intrinsic-jsx-prop" ||
        reference.kind === "direct-call"
    );
}

function isReferenceIdentifier(
    node: TSESTree.Identifier,
    parent: TSESTree.Node | undefined,
): boolean {
    if (parent === undefined) {
        return true;
    }

    if (
        parent.type === "VariableDeclarator" &&
        parent.id === node
    ) {
        return false;
    }

    if (
        parent.type === "Property" &&
        parent.key === node &&
        !parent.computed
    ) {
        return false;
    }

    if (
        parent.type === "MemberExpression" &&
        parent.property === node &&
        !parent.computed
    ) {
        return false;
    }

    return true;
}

function findParent(
    root: TSESTree.Node,
    target: TSESTree.Node,
): TSESTree.Node | undefined {
    let result: TSESTree.Node | undefined;

    visitWithParent(root, undefined, (node, parent) => {
        if (node === target) {
            result = parent;
        }
    });

    return result;
}

function createFinding(
    node: TSESTree.CallExpression,
    file: string,
    callbackName: string,
    reason: "unused" | "identity-insensitive",
): ReviewFinding {
    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;

    const message =
        reason === "unused"
            ? `${callbackName} is memoized with useCallback but is never referenced.`
            : `${callbackName} is memoized with useCallback, but its references do not rely on stable callback identity.`;

    return {
        id: [
            RULE_ID,
            file,
            line,
            column,
            callbackName,
        ].join(":"),

        ruleId: RULE_ID,

        title: "Unnecessary useCallback",

        message,

        severity: "low",

        source: "ast",

        location: {
            file,
            line,
            column,
        },

        suggestion:
            "Use a normal function unless stable callback identity is required by a memoized child, Hook dependency, or identity-sensitive API.",

        confidence:
            reason === "unused"
                ? 0.99
                : 0.9,
    };
}

function visit(
    node: TSESTree.Node,
    callback: (node: TSESTree.Node) => void,
): void {
    callback(node);

    for (const child of getChildNodes(node)) {
        visit(child, callback);
    }
}

function visitWithParent(
    node: TSESTree.Node,
    parent: TSESTree.Node | undefined,
    callback: (
        node: TSESTree.Node,
        parent: TSESTree.Node | undefined,
    ) => void,
): void {
    callback(node, parent);

    for (const child of getChildNodes(node)) {
        visitWithParent(child, node, callback);
    }
}

function getChildNodes(
    node: TSESTree.Node,
): TSESTree.Node[] {
    const children: TSESTree.Node[] = [];

    for (const value of Object.values(node)) {
        if (isNode(value)) {
            children.push(value);
            continue;
        }

        if (!Array.isArray(value)) {
            continue;
        }

        for (const item of value) {
            if (isNode(item)) {
                children.push(item);
            }
        }
    }

    return children;
}

function isNode(
    value: unknown,
): value is TSESTree.Node {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        typeof value.type === "string"
    );
}