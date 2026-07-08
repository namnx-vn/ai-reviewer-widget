import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.rendering.key-misuse";

type KeyIssue =
    | "missing"
    | "index"
    | "unstable";

export const reactRenderingKeyMisuseRule: ReactRule = {
    id: RULE_ID,

    description:
        "Detect missing, index-based, and unstable React keys in rendered lists.",

    check(node, context): ReviewFinding[] {
        if (node.type !== "JSXOpeningElement") {
            return [];
        }

        if (!isInsideMapCallback(node, context.ast)) {
            return [];
        }

        const keyAttribute = findKeyAttribute(node);

        if (keyAttribute === undefined) {
            return [
                createFinding(
                    node,
                    context.file,
                    "missing",
                ),
            ];
        }

        const expression = getKeyExpression(keyAttribute);

        if (expression === undefined) {
            return [];
        }

        if (isIndexKey(expression)) {
            return [
                createFinding(
                    node,
                    context.file,
                    "index",
                ),
            ];
        }

        if (isUnstableKey(expression)) {
            return [
                createFinding(
                    node,
                    context.file,
                    "unstable",
                ),
            ];
        }

        return [];
    },
};

function findKeyAttribute(
    node: TSESTree.JSXOpeningElement,
): TSESTree.JSXAttribute | undefined {
    for (const attribute of node.attributes) {
        if (
            attribute.type === "JSXAttribute" &&
            attribute.name.type === "JSXIdentifier" &&
            attribute.name.name === "key"
        ) {
            return attribute;
        }
    }

    return undefined;
}

function getKeyExpression(
    attribute: TSESTree.JSXAttribute,
): TSESTree.Expression | undefined {
    if (
        attribute.value?.type !== "JSXExpressionContainer"
    ) {
        return undefined;
    }

    const expression = attribute.value.expression;

    if (expression.type === "JSXEmptyExpression") {
        return undefined;
    }

    return expression;
}

function isIndexKey(
    expression: TSESTree.Expression,
): boolean {
    return (
        expression.type === "Identifier" &&
        /^(index|idx|i)$/u.test(expression.name)
    );
}

function isUnstableKey(
    expression: TSESTree.Expression,
): boolean {
    if (
        expression.type === "CallExpression" &&
        expression.callee.type === "MemberExpression" &&
        expression.callee.object.type === "Identifier" &&
        expression.callee.object.name === "Math" &&
        expression.callee.property.type === "Identifier" &&
        expression.callee.property.name === "random"
    ) {
        return true;
    }

    if (
        expression.type === "CallExpression" &&
        expression.callee.type === "Identifier" &&
        /^(uuid|uuidv[1-9]|nanoid|randomUUID)$/iu.test(
            expression.callee.name,
        )
    ) {
        return true;
    }

    return false;
}

function isInsideMapCallback(
    node: TSESTree.JSXOpeningElement,
    ast: TSESTree.Program,
): boolean {
    let found = false;

    visitWithAncestors(ast, [], (current, ancestors) => {
        if (current !== node) {
            return;
        }

        for (let index = ancestors.length - 1; index >= 0; index -= 1) {
            const ancestor = ancestors[index];

            if (
                ancestor?.type !== "CallExpression" ||
                !isMapCall(ancestor)
            ) {
                continue;
            }

            if (
                ancestor.arguments.some(
                    (argument) =>
                        argument.type === "ArrowFunctionExpression" ||
                        argument.type === "FunctionExpression",
                )
            ) {
                found = true;
                return;
            }
        }
    });

    return found;
}

function isMapCall(
    node: TSESTree.CallExpression,
): boolean {
    return (
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "map"
    );
}

function createFinding(
    node: TSESTree.JSXOpeningElement,
    file: string,
    issue: KeyIssue,
): ReviewFinding {
    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;

    const messages: Record<KeyIssue, string> = {
        missing:
            "Rendered list item is missing a stable key prop.",

        index:
            "Using the array index as a React key can attach component state to the wrong item when the list is reordered, inserted into, or filtered.",

        unstable:
            "React key is generated dynamically and can change between renders, preventing React from correctly preserving component identity.",
    };

    const suggestions: Record<KeyIssue, string> = {
        missing:
            "Use a stable identifier from the item, such as key={item.id}.",

        index:
            "Use a stable item identifier instead of the array index.",

        unstable:
            "Use a stable identifier derived from the rendered item instead of generating a new key during render.",
    };

    const severity =
        issue === "missing" || issue === "index"
            ? "medium"
            : "high";

    return {
        id: [
            RULE_ID,
            file,
            line,
            column,
            issue,
        ].join(":"),

        ruleId: RULE_ID,

        title:
            issue === "missing"
                ? "Missing React key"
                : issue === "index"
                    ? "Index used as React key"
                    : "Unstable React key",

        message: messages[issue],

        severity,

        source: "ast",

        location: {
            file,
            line,
            column,
        },

        suggestion: suggestions[issue],

        confidence:
            issue === "missing"
                ? 0.97
                : 0.99,
    };
}

function visitWithAncestors(
    node: TSESTree.Node,
    ancestors: TSESTree.Node[],
    callback: (
        node: TSESTree.Node,
        ancestors: TSESTree.Node[],
    ) => void,
): void {
    callback(node, ancestors);

    const nextAncestors = [...ancestors, node];

    for (const child of getChildNodes(node)) {
        visitWithAncestors(
            child,
            nextAncestors,
            callback,
        );
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