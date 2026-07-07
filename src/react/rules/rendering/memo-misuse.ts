import type { TSESTree } from "@typescript-eslint/typescript-estree";

import type { ReviewFinding } from "../../../review/types";
import type { ReactRule } from "../../engine/react-rule";
import { visit } from "../../ast/component-utils";

const RULE_ID = "react.rendering.memo-misuse";

export const reactRenderingMemoMisuseRule: ReactRule = {
    id: RULE_ID,

    description:
        "Detect React.memo usages that cannot provide rendering benefits.",

    check(node, context) {
        if (node.type !== "CallExpression") {
            return [];
        }

        if (!isMemoCall(node)) {
            return [];
        }

        const findings: ReviewFinding[] = [];

        const component = resolveMemoComponent(node.arguments[0], context.ast);

        if (component !== undefined && component.params.length === 0) {
            findings.push(
                createFinding(
                    context.file,
                    node,
                    "Component wrapped with memo() does not receive props.",
                    "Remove memo() or introduce props that actually influence rendering.",
                ),
            );
        }

        const comparator = node.arguments[1];

        if (
            comparator &&
            (comparator.type === "ArrowFunctionExpression" ||
                comparator.type === "FunctionExpression") &&
            alwaysReturnsTrue(comparator)
        ) {
            findings.push(
                createFinding(
                    context.file,
                    node,
                    "Custom memo comparator always returns true.",
                    "React will never re-render even when props change.",
                ),
            );
        }

        return findings;
    },
};

function resolveMemoComponent(
    node: TSESTree.Node | undefined,
    ast: TSESTree.Program,
): TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | undefined {
    if (node === undefined) {
        return undefined;
    }

    if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression"
    ) {
        return node;
    }

    if (node.type !== "Identifier") {
        return undefined;
    }

    return findComponentDeclaration(node.name, ast);
};

function findComponentDeclaration(
    name: string,
    ast: TSESTree.Program,
):
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | undefined {
    let result:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
        | undefined;

    visit(ast, (node) => {
        if (result !== undefined) {
            return;
        }

        if (
            node.type === "FunctionDeclaration" &&
            node.id?.name === name
        ) {
            result = node;
            return;
        }

        if (node.type !== "VariableDeclarator") {
            return;
        }

        if (
            node.id.type !== "Identifier" ||
            node.id.name !== name
        ) {
            return;
        }

        if (
            node.init?.type === "ArrowFunctionExpression" ||
            node.init?.type === "FunctionExpression"
        ) {
            result = node.init;
        }
    });

    return result;
};

function isMemoCall(node: TSESTree.CallExpression): boolean {
    if (
        node.callee.type === "Identifier" &&
        node.callee.name === "memo"
    ) {
        return true;
    }

    return (
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "React" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "memo"
    );
}

function alwaysReturnsTrue(
    fn:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionExpression,
): boolean {
    if (fn.body.type === "Literal") {
        return fn.body.value === true;
    }

    if (fn.body.type !== "BlockStatement") {
        return false;
    }

    if (fn.body.body.length !== 1) {
        return false;
    }

    const stmt = fn.body.body[0];

    return (
        stmt.type === "ReturnStatement" &&
        stmt.argument?.type === "Literal" &&
        stmt.argument.value === true
    );
}

function createFinding(
    file: string,
    node: TSESTree.CallExpression,
    message: string,
    suggestion: string,
): ReviewFinding {
    return {
        id: [
            RULE_ID,
            file,
            node.loc?.start.line ?? 1,
            node.loc?.start.column ?? 0,
        ].join(":"),

        ruleId: RULE_ID,

        title: "Ineffective React.memo",

        message,

        severity: "medium",

        source: "ast",

        location: {
            file,
            line: node.loc?.start.line ?? 1,
            column: node.loc?.start.column ?? 0,
        },

        suggestion,

        confidence: 0.95,
    };
}