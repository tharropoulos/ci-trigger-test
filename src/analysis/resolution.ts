import { childForField } from "../cpp-ast.js";
import type { AliasTarget, FunctionParameter } from "../types.js";
import type { SyntaxNode } from "tree-sitter";
import {
  extractStringLiteral,
  extractSubscriptIndexNode,
  parseCallExpressionNode,
  parseFieldExpression,
  unwrapExpressionNode,
} from "./syntax.js";

export function resolveExpressionNode(
  expressionNode: SyntaxNode,
  aliases: ReadonlyMap<string, AliasTarget>,
  constants: ReadonlyMap<string, string>,
): AliasTarget | undefined {
  const normalizedNode = unwrapExpressionNode(expressionNode);

  const requestRoot = resolveRequestRoot(normalizedNode);
  if (requestRoot !== undefined) {
    return requestRoot;
  }

  const directAlias =
    normalizedNode.type === "identifier"
      ? aliases.get(normalizedNode.text)
      : undefined;
  if (directAlias !== undefined) {
    return directAlias;
  }

  if (normalizedNode.type === "call_expression") {
    const callInfo = parseCallExpressionNode(normalizedNode);
    if (callInfo === undefined) {
      return undefined;
    }

    if (callInfo.methodName === undefined) {
      const calleeName = extractTerminalName(callInfo.calleeName);
      if (
        callInfo.calleeName === "nlohmann::json::parse" ||
        calleeName === "parse"
      ) {
        const firstArgument = callInfo.arguments[0];
        if (firstArgument !== undefined) {
          const firstTarget = resolveExpressionNode(
            firstArgument,
            aliases,
            constants,
          );
          if (firstTarget?.location === "body-root") {
            return { location: "body-root", segments: [] };
          }
        }
      }
      return undefined;
    }

    if (callInfo.baseNode === undefined) {
      return undefined;
    }

    const baseTarget = resolveExpressionNode(
      callInfo.baseNode,
      aliases,
      constants,
    );
    if (baseTarget === undefined) {
      return undefined;
    }

    if (callInfo.methodName === "items") {
      return baseTarget;
    }

    if (callInfo.methodName === "value") {
      if (callInfo.arguments.length === 0) {
        return baseTarget;
      }

      const firstArgument = callInfo.arguments[0];
      const segment =
        firstArgument === undefined
          ? undefined
          : resolveStringTokenNode(firstArgument, constants);
      if (segment === undefined) {
        return undefined;
      }

      return {
        location: baseTarget.location,
        segments: [...baseTarget.segments, segment],
      };
    }

    if (callInfo.methodName === "find" || callInfo.methodName === "at") {
      const firstArgument = callInfo.arguments[0];
      const segment =
        firstArgument === undefined
          ? undefined
          : resolveStringTokenNode(firstArgument, constants);
      if (segment === undefined) {
        return undefined;
      }
      return {
        location: baseTarget.location,
        segments: [...baseTarget.segments, segment],
      };
    }

    if (
      callInfo.methodName === "count" ||
      callInfo.methodName === "contains" ||
      callInfo.methodName === "key"
    ) {
      return undefined;
    }
  }

  if (normalizedNode.type === "subscript_expression") {
    const baseNode = childForField(normalizedNode, "argument");
    const indexNode = extractSubscriptIndexNode(normalizedNode);
    if (baseNode === undefined || indexNode === undefined) {
      return undefined;
    }

    const baseTarget = resolveExpressionNode(baseNode, aliases, constants);
    if (baseTarget === undefined) {
      return undefined;
    }

    const segment = resolveStringTokenNode(indexNode, constants) ?? "[]";
    return {
      location: baseTarget.location,
      segments: [...baseTarget.segments, segment],
    };
  }

  return undefined;
}

function extractTerminalName(value: string): string | undefined {
  const parts = value.split("::");
  return parts[parts.length - 1];
}

export function resolveLoopItemTarget(
  expressionNode: SyntaxNode,
  aliases: ReadonlyMap<string, AliasTarget>,
  constants: ReadonlyMap<string, string>,
): AliasTarget | undefined {
  const resolved = resolveExpressionNode(expressionNode, aliases, constants);
  if (resolved === undefined || resolved.location === "query-root") {
    return undefined;
  }

  return {
    location: "body-root",
    segments: [...resolved.segments, "[]"],
  };
}

export function resolveStringTokenNode(
  node: SyntaxNode,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  const normalizedNode = unwrapExpressionNode(node);
  if (normalizedNode.type === "string_literal") {
    return extractStringLiteral(normalizedNode.text);
  }

  if (normalizedNode.type === "concatenated_string") {
    let combined = "";
    for (const child of normalizedNode.namedChildren) {
      if (child.type !== "string_literal") {
        return undefined;
      }
      const value = extractStringLiteral(child.text);
      if (value === undefined) {
        return undefined;
      }
      combined += value;
    }
    return combined;
  }

  if (normalizedNode.type === "identifier") {
    return constants.get(normalizedNode.text);
  }

  if (normalizedNode.type === "qualified_identifier") {
    const tokenText = normalizedNode.text;
    if (tokenText.startsWith("fields::")) {
      return tokenText.slice("fields::".length);
    }

    const terminalName = extractTerminalName(tokenText);
    if (terminalName !== undefined) {
      return constants.get(terminalName);
    }
  }

  return undefined;
}

export function bootstrapAliases(
  parameters: readonly FunctionParameter[],
  inherited: ReadonlyMap<string, AliasTarget>,
): Map<string, AliasTarget> {
  const aliases = new Map(inherited);

  parameters
    .filter((parameter) => parameter.typeText.includes("std::map<std::string, std::string>"))
    .forEach((parameter) => aliases.set(parameter.name, { location: "query-root", segments: [] }));

  return aliases;
}

function resolveRequestRoot(node: SyntaxNode): AliasTarget | undefined {
  const fieldParts = parseFieldExpression(node);
  if (fieldParts === undefined) {
    return undefined;
  }

  if (
    fieldParts.operator !== "->" ||
    fieldParts.baseNode.type !== "identifier" ||
    fieldParts.baseNode.text !== "req"
  ) {
    return undefined;
  }

  if (fieldParts.fieldName === "params") {
    return { location: "params-root", segments: [] };
  }
  if (fieldParts.fieldName === "body") {
    return { location: "body-root", segments: [] };
  }
  return undefined;
}
