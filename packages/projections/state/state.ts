import { EditorState, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import { createPatternMap, PatternMatching } from "@puredit/parser";
import { pickedCompletion } from "@codemirror/autocomplete";
import type { ContextVariableRange, Match, Parser, PatternsMap } from "@puredit/parser";
import type { ProjectionPluginConfig } from "../types";
import DecorationSetBuilder from "./decorationSetBuilder";
import AstCursor from "@puredit/parser/ast/cursor";
import AstNode from "@puredit/parser/ast/node";
import { zip } from "@puredit/utils";

export interface ProjectionState {
  config: ProjectionPluginConfig;
  patternMap: PatternsMap;
  decorations: DecorationSet;
  contextVariableRanges: ContextVariableRange[];
}

export function createProjectionState(
  state: EditorState,
  config: ProjectionPluginConfig
): ProjectionState {
  const patternMap = createPatternMap(config.projections.map((p) => p.pattern));
  const cursor = config.parser.parse(state.sliceDoc(0)).walk();
  const patternMatching = new PatternMatching(patternMap, cursor, config.globalContextVariables);
  const { matches, contextVariableRanges } = patternMatching.execute();

  const decorationSetBuilder = new DecorationSetBuilder();
  decorationSetBuilder
    .setProjectionPluginConfig(config)
    .setDecorations(Decoration.none)
    .setIsCompletion(false)
    .setState(state)
    .setMatches(matches);
  const decorations = decorationSetBuilder.build();

  return { config, patternMap, decorations, contextVariableRanges };
}

export const projectionState = StateField.define<ProjectionState>({
  create(): ProjectionState {
    throw new Error("ProjectionState must be created through init()");
  },

  update({ config, patternMap, decorations, contextVariableRanges }, transaction) {
    console.time("update");

    if (!transaction.docChanged) {
      console.timeEnd("update");
      return { config, patternMap, decorations, contextVariableRanges };
    }

    const isCompletion = Boolean(transaction.annotation(pickedCompletion));
    decorations = decorations.map(transaction.changes);
    const oldState = transaction.startState;
    const newState = transaction.state;

    const changedStatementNodes = findChangedStatements(
      oldState.sliceDoc(0),
      newState.sliceDoc(0),
      config.parser
    );

    let allMatches: Match[] = [];
    let allContextVariableRanges: ContextVariableRange[] = [];
    for (const changedNode of changedStatementNodes) {
      const cursor = changedNode.walk();
      const patternMatching = new PatternMatching(
        patternMap,
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
      .setMatches(allMatches);
    decorations = decorationSetBuilder.build();

    console.timeEnd("update");
    return { config, patternMap, decorations, contextVariableRanges: allContextVariableRanges };
  },

  provide(field: StateField<ProjectionState>) {
    return EditorView.decorations.from(field, (state) => state.decorations);
  },
});

function findChangedStatements(oldText: string, newText: string, parser: Parser): AstNode[] {
  const oldAstCursor = new AstCursor(parser.parse(oldText).walk());
  const oldStatementNodes = oldAstCursor.currentNode.children;

  const newAstCursor = new AstCursor(parser.parse(newText).walk());
  const newStatementNodes = newAstCursor.currentNode.children;

  for (let i = 0; i < newStatementNodes.length; i++) {
    const oldStatementNode = oldStatementNodes[i];
    const newStatementNode = newStatementNodes[i];
    if (!oldStatementNode) {
      return newStatementNodes.slice(i);
    }
    if (oldStatementNode.text === newStatementNode.text) {
      continue;
    }
    if (!nodesEqual(oldStatementNode, newStatementNode)) {
      return newStatementNodes.slice(i);
    }
  }
  return [];
}

function nodesEqual(oldNode: AstNode, newNode: AstNode): boolean {
  if (oldNode.type !== newNode.type) {
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
