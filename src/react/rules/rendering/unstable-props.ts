import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import {
    isIdentifier,
    visit,
} from "../../ast/component-utils";

const RULE_ID = "react.rendering.unstable-props";

type UnstablePropKind = "object" | "array" | "function";

export const reactRenderingUnstablePropsRule: ReactRule = {
    id: RULE_ID,

    description:
        "Detect inline object, array, and function props passed to React components.",

    check(node, context): ReviewFinding[] {
        if (node.type !== "JSXOpeningElement") {
            return [];
        }

        if (!isCustomComponent(node)) {
            return [];
        }

        const findings: ReviewFinding[] = [];

        for (const attribute of node.attributes) {
            if (attribute.type !== "JSXAttribute") {
                continue;
            }

            const propName = getPropName(attribute);

            if (propName === undefined) {
                continue;
            }

            const expression = getExpression(attribute);

            if (expression === undefined) {
                continue;
            }

            const kind = getUnstablePropKind(expression);

            if (kind === undefined) {
                continue;
            }

            findings.push(
                createFinding(
                    node,
                    context.file,
                    propName,
                    kind,
                ),
            );
        }

        return findings;
    },
};

function isCustomComponent(
    node: TSESTree.JSXOpeningElement,
): boolean {
    const name = node.name;

    if (name.type === "JSXIdentifier") {
        return isPascalCaseJsxName(name.name);
    }

    /*
     * <Foo.Bar /> and <UI.Button /> are component references.
     */
    if (name.type === "JSXMemberExpression") {
        return true;
    }

    /*
     * Namespaced JSX components are uncommon but are not intrinsic
     * HTML elements, so conservatively treat them as custom components.
     */
    if (name.type === "JSXNamespacedName") {
        return true;
    }

    return false;
}

function isPascalCaseJsxName(
    name: string,
): boolean {
    const firstCharacter = name[0];

    return (
        firstCharacter !== undefined &&
        firstCharacter === firstCharacter.toUpperCase() &&
        /[A-Z]/u.test(firstCharacter)
    );
}

function getPropName(
    attribute: TSESTree.JSXAttribute,
): string | undefined {
    const name = attribute.name;

    if (name.type === "JSXIdentifier") {
        return name.name;
    }

    return undefined;
}

function getExpression(
    attribute: TSESTree.JSXAttribute,
): TSESTree.Expression | undefined {
    const value = attribute.value;

    if (
        value?.type !== "JSXExpressionContainer"
    ) {
        return undefined;
    }

    if (
        value.expression.type === "JSXEmptyExpression"
    ) {
        return undefined;
    }

    return value.expression;
}

function getUnstablePropKind(
    expression: TSESTree.Expression,
): UnstablePropKind | undefined {
    switch (expression.type) {
        case "ObjectExpression":
            return "object";

        case "ArrayExpression":
            return "array";

        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return "function";

        default:
            return undefined;
    }
}

function createFinding(
    node: TSESTree.JSXOpeningElement,
    file: string,
    propName: string,
    kind: UnstablePropKind,
): ReviewFinding {
    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;

    const kindLabel =
        kind === "object"
            ? "object"
            : kind === "array"
                ? "array"
                : "function";

    const message =
        `Inline ${kindLabel} prop "${propName}" ` +
        "creates a new reference on every render. " +
        "This can cause unnecessary child re-renders when the receiving " +
        "component relies on referential equality.";

    return {
        id: [
            RULE_ID,
            file,
            line,
            column,
            propName,
            kind,
        ].join(":"),

        ruleId: RULE_ID,

        title: "Unstable prop reference",

        message,

        severity: "low",

        source: "ast",

        location: {
            file,
            line,
            column,
        },

        suggestion:
            kind === "function"
                ? `Move "${propName}" to useCallback when stable function identity is required.`
                : `Move "${propName}" outside render or memoize it with useMemo when stable reference identity is required.`,

        confidence: 0.98,
    };
}