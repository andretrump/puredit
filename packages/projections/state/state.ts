import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { PatternMatching } from "@puredit/parser";
import { pickedCompletion } from "@codemirror/autocomplete";
import type { ContextVariableRange, Match, Parser } from "@puredit/parser";
import type { ProjectionPluginConfig } from "../types";
import DecorationSetBuilder from "./decorationSetBuilder";
import AstNode from "@puredit/parser/ast/node";
import AstCursor from "@puredit/parser/ast/cursor";
import { zip } from "@puredit/utils-shared";
import { Extension } from "@puredit/declarative-projections";

import { logProvider } from "../../../logconfig";
const logger = logProvider.getLogger("projections.state.state");

export interface ProjectionState {
  config: ProjectionPluginConfig;
  decorations: DecorationSet;
  contextVariableRanges: ContextVariableRange[];
}

export function createProjectionState(
  state: EditorState,
  config: ProjectionPluginConfig
): ProjectionState {
  const cursor = config.parser.parse(state.sliceDoc(0)).walk();
  const patternMatching = new PatternMatching(
    config.projectionRegistry.rootProjectionPatternsByRootNodeType,
    cursor,
    config.globalContextVariables
  );
  const { matches, contextVariableRanges } = patternMatching.execute();

  const decorationSetBuilder = new DecorationSetBuilder();
  decorationSetBuilder
    .setProjectionPluginConfig(config)
    .setDecorations(Decoration.none)
    .setIsCompletion(false)
    .setState(state)
    .setMatches(matches);
  const decorations = decorationSetBuilder.build();

  return { config, decorations, contextVariableRanges };
}

export const insertDeclarativeProjectionsEffect = StateEffect.define<Extension[]>();
export const removeProjectionPackagesEffect = StateEffect.define<string[]>();

export const projectionState = StateField.define<ProjectionState>({
  create(): ProjectionState {
    throw new Error("ProjectionState must be created through init()");
  },

  update({ config, decorations, contextVariableRanges }, transaction) {
    const isCompletion = Boolean(transaction.annotation(pickedCompletion));
    decorations = decorations.map(transaction.changes);
    const oldState = transaction.startState;
    const newState = transaction.state;

    let projectionsChanged = false;
    for (const effect of transaction.effects) {
      if (effect.is(removeProjectionPackagesEffect)) {
        logger.debug("removeProjectionPackagesEffect found. Updating projections");
        effect.value.forEach((packageName) => config.projectionRegistry.removePackage(packageName));
        projectionsChanged = true;
      } else if (effect.is(insertDeclarativeProjectionsEffect) && config.projectionCompiler) {
        logger.debug("insertDeclarativeProjectionsEffect found. Updating projections");
        config.projectionCompiler.compile(effect.value);
        projectionsChanged = true;
      }
    }

    if (!transaction.docChanged && !transaction.selection && !projectionsChanged) {
      logger.debug("Rematching nothing");
      return { config, decorations, contextVariableRanges };
    }
    const mainSelect = transaction.selection?.main;
    let nodesToRematch: AstNode[];
    let nodesToInvalidate: AstNode[] = [];
    if (projectionsChanged) {
      logger.debug("Projections changed. Rematching everything");
      nodesToRematch = getAllStatementNodes(newState.sliceDoc(0), config.parser);
      nodesToInvalidate = nodesToRematch;
    } else if (transaction.docChanged) {
      logger.debug("Rematching changed nodes");
      const { changedStatementNodes, errorNodes } = analyzeChanges(
        oldState.sliceDoc(0),
        newState.sliceDoc(0),
        config.parser
      );
      nodesToRematch = changedStatementNodes;
      nodesToInvalidate = errorNodes;
    } else if (mainSelect && mainSelect.anchor === mainSelect.head) {
      // TODO: Implement partial rematching for selection of size > 0
      logger.debug("Rematching node with cursor");
      nodesToRematch = findNodeContainingCursor(
        newState.sliceDoc(0),
        transaction.selection?.main.anchor,
        config.parser
      );
    } else {
      logger.debug("Rematching all nodes");
      nodesToRematch = getAllStatementNodes(newState.sliceDoc(0), config.parser);
    }

    let allMatches: Match[] = [];
    let allContextVariableRanges: ContextVariableRange[] = [];
    for (const changedNode of nodesToRematch) {
      const cursor = changedNode.walk();
      const patternMatching = new PatternMatching(
        config.projectionRegistry.rootProjectionPatternsByRootNodeType,
        cursor,
        config.globalContextVariables
      );
      const { matches, contextVariableRanges } = patternMatching.execute();
      allMatches = allMatches.concat(matches);
      allContextVariableRanges = allContextVariableRanges.concat(contextVariableRanges);
    }

    const decorationSetBuilder = new DecorationSetBuilder();
    decorationSetBuilder
      .setProjectionPluginConfig(config)
      .setDecorations(decorations)
      .setIsCompletion(isCompletion)
      .setState(newState)
      .setMatches(allMatches)
      .setNodesToInvalidate(nodesToInvalidate);
    decorations = decorationSetBuilder.build();
    return { config, decorations, contextVariableRanges: allContextVariableRanges };
  },

  provide(field: StateField<ProjectionState>) {
    return EditorView.decorations.from(field, (state) => state.decorations);
  },
});

function getAllStatementNodes(text: string, parser: Parser): AstNode[] {
  const astCursor = new AstCursor(parser.parse(text).walk());
  return astCursor.currentNode.children;
}

function findNodeContainingCursor(text: string, cursorPos: number, parser: Parser): AstNode[] {
  const astCursor = new AstCursor(parser.parse(text).walk());
  const statementNodes = astCursor.currentNode.children;
  let low = 0;
  let high = statementNodes.length - 1;
  while (high >= low) {
    const mid = Math.floor(low + (high - low) / 2);
    const currentNode = statementNodes[mid];
    if (cursorPos >= currentNode.startIndex && cursorPos <= currentNode.endIndex) {
      return [currentNode];
    } else if (cursorPos > currentNode.endIndex) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return statementNodes;
}

function analyzeChanges(oldText: string, newText: string, parser: Parser) {
  const oldAstCursor = new AstCursor(parser.parse(oldText).walk());
  const oldStatementNodes = oldAstCursor.currentNode.children;

  const newAstCursor = new AstCursor(parser.parse(newText).walk());
  const newStatementNodes = newAstCursor.currentNode.children;

  if (!newStatementNodes.length) {
    return { changedStatementNodes: [], errorNodes: [] };
  }

  const changedStatementNodes: AstNode[] = [];
  const errorNodes: AstNode[] = [];

  const oldLeadingWhiteSpace = oldText.match(/^\s*/);
  const newLeadingWhiteSpace = newText.match(/^\s*/);
  let i = 0;
  if (
    (oldLeadingWhiteSpace &&
      newLeadingWhiteSpace &&
      oldLeadingWhiteSpace[0] !== newLeadingWhiteSpace[0]) ||
    (oldLeadingWhiteSpace && !newLeadingWhiteSpace) ||
    (!oldLeadingWhiteSpace && newLeadingWhiteSpace)
  ) {
    changedStatementNodes.push(newStatementNodes[0]);
    i = 1;
  }
  for (; i < newStatementNodes.length; i++) {
    const oldStatementNode = oldStatementNodes[i];
    const newStatementNode = newStatementNodes[i];
    if (!oldStatementNode) {
      changedStatementNodes.push(newStatementNode);
      continue;
    }
    if (newStatementNode.type === "ERROR") {
      errorNodes.push(newStatementNode);
      continue;
    }
    if (
      oldStatementNode.startIndex !== newStatementNode.startIndex ||
      oldStatementNode.endIndex !== newStatementNode.endIndex
    ) {
      changedStatementNodes.push(newStatementNode);
      continue;
    }
    if (oldStatementNode.text === newStatementNode.text) {
      continue;
    }
    if (!nodesEqual(oldStatementNode, newStatementNode)) {
      changedStatementNodes.push(newStatementNode);
      continue;
    }
  }
  return { changedStatementNodes, errorNodes };
}

function nodesEqual(oldNode: AstNode, newNode: AstNode): boolean {
  if (oldNode.type !== newNode.type) {
    return false;
  }
  if (oldNode.startIndex !== newNode.startIndex || oldNode.endIndex !== newNode.endIndex) {
    return false;
  }
  if (oldNode.children?.length !== newNode.children?.length) {
    return false;
  }
  if (oldNode.children.length === 0) {
    return oldNode.text === newNode.text;
  }
  for (const [oldChildNode, newChildNode] of zip(oldNode.children, newNode.children)) {
    if (!nodesEqual(oldChildNode, newChildNode)) {
      return false;
    }
  }
  return true;
}
