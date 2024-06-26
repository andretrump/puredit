/**
 * @module inspect
 * Implements a set of functions to convert patterns, ast-nodes and matches to their
 * string representation
 */

import { NodeTransformVisitor } from "./parse/internal";
import type { AstNodeMap, Match } from "./match/types";
import AstNode from "./ast/node";
import PatternNode from "./pattern/nodes/patternNode";
import CodeString from "./template/codeString";
import { Language } from "@puredit/language-config";

export function patternToString(node: PatternNode, indent = ""): string {
  let out = indent + (node.fieldName ? node.fieldName + ": " : "") + node.type;
  if (node.children) {
    out +=
      " {\n" +
      node.children.map((child) => patternToString(child, indent + "  ")).join("") +
      indent +
      "}\n";
  } else if (node.text) {
    out += " " + JSON.stringify(node.text) + "\n";
  }
  return out;
}

export function syntaxNodeToString(language: Language, node: AstNode, indent = ""): string {
  const nodeTransformVisitor = new NodeTransformVisitor(language);
  return patternToString(
    nodeTransformVisitor.transform(node.walk(), new CodeString(node.text))[0],
    indent
  );
}

export function argMapToString(language: Language, args: AstNodeMap, indent = ""): string {
  let out = "{\n";
  for (const key of Object.keys(args)) {
    out +=
      indent +
      `  ${key} = {\n${syntaxNodeToString(language, args[key], indent + "    ") + indent}  }\n`;
  }
  return out + indent + "}";
}

export function matchToString(match: Match): string {
  return `Match {
  args = ${argMapToString(match.pattern.language, match.argsToAstNodeMap, "  ")}
}`;
}
