import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../domain/review";
import type { ReactRule } from "../../engine/react-rule";

const RULE_ID = "react.rendering.memo-boundary";

type UnstableKind = "object" | "array" | "function";

interface MemoComponent {
    readonly name: string;
    readonly node: TSESTree.CallExpression;
}

interface ComponentUsage {
    readonly element: TSESTree.JSXOpeningElement;
    readonly componentName: string;
}

export const reactRenderingMemoBoundaryRule: ReactRule = {
    id: RULE_ID,

    description:
        "Detect memoized React components receiving statically unstable prop references.",

    check(node, context): ReviewFinding[] {
        if (node.type !== "Program") {
            return [];
        }

        const memoComponents = collectMemoComponents(node);

        if (memoComponents.length === 0) {
            return [];
        }

        const usages = collectComponentUsages(node);

        const findings: ReviewFinding[] = [];

        for (const memoComponent of memoComponents) {
            const componentUsages = usages.filter(
                (usage) =>
                    usage.componentName === memoComponent.name,
            );

            for (const usage of componentUsages) {
                findings.push(
                    ...analyzeUsage(
                        usage.element,
                        context.file,
                        memoComponent.name,
                    ),
                );
            }
        }

        return deduplicateFindings(findings);
    },
};

function collectMemoComponents(
    ast: TSESTree.Program,
): MemoComponent[] {
    const result: MemoComponent[] = [];

    visit(ast, (node) => {
        if (
            node.type !== "VariableDeclarator" ||
            node.id.type !== "Identifier" ||
            node.init?.type !== "CallExpression"
        ) {
            return;
        }

        if (!isMemoCall(node.init)) {
            return;
        }

        result.push({
            name: node.id.name,
            node: node.init,
        });
    });

    return result;
}

function collectComponentUsages(
    ast: TSESTree.Program,
): ComponentUsage[] {
    const result: ComponentUsage[] = [];

    visit(ast, (node) => {
        if (node.type !== "JSXOpeningElement") {
            return;
        }

        if (node.name.type !== "JSXIdentifier") {
            return;
        }

        if (!isComponentName(node.name.name)) {
            return;
        }

        result.push({
            element: node,
            componentName: node.name.name,
        });
    });

    return result;
}

function analyzeUsage(
    element: TSESTree.JSXOpeningElement,
    file: string,
    componentName: string,
): ReviewFinding[] {
    const findings: ReviewFinding[] = [];

    for (const attribute of element.attributes) {
        if (attribute.type !== "JSXAttribute") {
            continue;
        }

        if (attribute.name.type !== "JSXIdentifier") {
            continue;
        }

        const expression = getExpression(attribute);

        if (expression === undefined) {
            continue;
        }

        const kind = getUnstableKind(expression);

        if (kind === undefined) {
            continue;
        }

        findings.push(
            createFinding(
                element,
                file,
                componentName,
                attribute.name.name,
                kind,
            ),
        );
    }

    return findings;
}

function getExpression(
    attribute: TSESTree.JSXAttribute,
): TSESTree.Expression | undefined {
    if (
        attribute.value?.type !== "JSXExpressionContainer"
    ) {
        return undefined;
    }

    const expression = attribute.value.expression;

    if (
        expression.type === "JSXEmptyExpression"
    ) {
        return undefined;
    }

    return expression;
}

function getUnstableKind(
    expression: TSESTree.Expression,
): UnstableKind | undefined {
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

function isMemoCall(
    node: TSESTree.CallExpression,
): boolean {
    if (
        node.callee.type === "Identifier" &&
        node.callee.name === "memo"
    ) {
        return true;
    }

    return (
        node.callee.type === "MemberExpression" &&
        !node.callee.computed &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "React" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "memo"
    );
}

function isComponentName(name: string): boolean {
    const firstCharacter = name[0];

    return (
        firstCharacter !== undefined &&
        firstCharacter === firstCharacter.toUpperCase() &&
        /[A-Z]/u.test(firstCharacter)
    );
}

function createFinding(
    node: TSESTree.JSXOpeningElement,
    file: string,
    componentName: string,
    propName: string,
    kind: UnstableKind,
): ReviewFinding {
    const line = node.loc?.start.line ?? 1;
    const column = node.loc?.start.column ?? 0;

    const kindLabel =
        kind === "object"
            ? "object"
            : kind === "array"
                ? "array"
                : "function";

    return {
        id: [
            RULE_ID,
            file,
            line,
            column,
            componentName,
            propName,
            kind,
        ].join(":"),

        ruleId: RULE_ID,

        title: "Unstable prop defeats memoization",

        message:
            `Memoized component "${componentName}" receives an inline ` +
            `${kindLabel} prop "${propName}". ` +
            "The new reference can cause the memoized component to render again.",

        severity: "medium",

        source: "ast",

        location: {
            file,
            line,
            column,
        },

        suggestion:
            kind === "function"
                ? `Memoize "${propName}" with useCallback when stable identity is required.`
                : `Memoize "${propName}" with useMemo or move the value outside render when stable identity is required.`,

        confidence: 0.99,
    };
}

function deduplicateFindings(
    findings: readonly ReviewFinding[],
): ReviewFinding[] {
    const seen = new Set<string>();
    const result: ReviewFinding[] = [];

    for (const finding of findings) {
        if (seen.has(finding.id)) {
            continue;
        }

        seen.add(finding.id);
        result.push(finding);
    }

    return result;
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