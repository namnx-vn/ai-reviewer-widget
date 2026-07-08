import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { visit } from "../ast/component-utils";

export type FunctionLike =
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression;

export interface DeclarationIndex {
    readonly functions: ReadonlyMap<string, FunctionLike>;
}

export function createDeclarationIndex(
    ast: TSESTree.Program,
): DeclarationIndex {
    const functions = new Map<string, FunctionLike>();

    visit(ast, (node) => {
        if (
            node.type === "FunctionDeclaration" &&
            node.id !== null
        ) {
            functions.set(node.id.name, node);
            return;
        }

        if (node.type !== "VariableDeclarator") {
            return;
        }

        if (
            node.id.type !== "Identifier" ||
            node.init === null
        ) {
            return;
        }

        if (
            node.init.type === "ArrowFunctionExpression" ||
            node.init.type === "FunctionExpression"
        ) {
            functions.set(node.id.name, node.init);
        }
    });

    return {
        functions,
    };
}