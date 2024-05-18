import { RangeSet, type EditorState } from "@codemirror/state";
import { Decoration, DecorationSet } from "@codemirror/view";
import { zip } from "@puredit/utils";
import type { Match, Pattern } from "@puredit/parser";
import type { CodeRange } from "@puredit/parser/match/types";
import type {
  ContextInformation,
  FnContextProvider,
  Projection,
  ProjectionPluginConfig,
  RootProjection,
  SubProjection,
} from "../types";
import type { Template } from "@puredit/parser";
import type { ProjectionWidgetClass } from "../projection";
import AggregationDecorator from "@puredit/parser/pattern/decorators/aggregationDecorator";
import {
  loadAggregationDelimiterTokensFor,
  loadAggregationsConfigFor,
} from "@puredit/language-config";
import type { AggregatableNodeTypeConfig } from "@puredit/language-config";
import { toRootProjectionMap, toSubProjectionMap } from "../shared";

export default class DecorationSetBuilder {
  // Input
  private config!: ProjectionPluginConfig;
  private decorations!: DecorationSet;
  private isCompletion!: boolean;
  private state!: EditorState;
  private matches!: Match[];

  // State
  private projectionMap!: Map<Pattern, RootProjection>;
  private subProjectionMap!: Map<Template, SubProjection>;
  private contextBounds: number[] = [];
  private contextInformations: ContextInformation[] = [];

  // Output
  private newDecorations = Decoration.none;

  setProjectionPluginConfig(config: ProjectionPluginConfig) {
    this.config = config;
    this.contextInformations = [config.globalContextInformation];
    return this;
  }

  setDecorations(decorations: DecorationSet) {
    this.decorations = decorations;
    return this;
  }

  setIsCompletion(isCompletion: boolean) {
    this.isCompletion = isCompletion;
    return this;
  }

  setState(state: EditorState) {
    this.state = state;
    return this;
  }

  setMatches(matches: Match[]) {
    this.matches = matches;
    return this;
  }

  build(): DecorationSet {
    for (const match of this.matches) {
      this.removeContextOutOfBoundsFor(match);
      let projection: Projection;
      try {
        projection = this.getProjectionFor(match);
      } catch (error) {
        if (error instanceof NoProjectionFound) {
          continue;
        } else {
          throw error;
        }
      }

      const { segmentWidgets, prefixWidget, postfixWidget, contextProvider } = projection;
      if (contextProvider) {
        this.extractContextFrom(match, contextProvider);
      }
      const context = Object.assign({}, ...this.contextInformations);

      this.extractSegmentDecoratorsFor(match, segmentWidgets, context);

      if (prefixWidget) {
        this.extractPrefixDecoratorFor(match, prefixWidget, context);
      }

      if (postfixWidget) {
        this.extractPostfixDecoratorFor(match, postfixWidget, context);
      }
    }
    return RangeSet.join([this.newDecorations, this.decorations]);
  }

  private removeContextOutOfBoundsFor(match: Match) {
    if (
      this.contextBounds.length &&
      match.from >= this.contextBounds[this.contextBounds.length - 1]
    ) {
      this.contextInformations.pop();
      this.contextBounds.pop();
    }
  }

  private extractContextFrom(match: Match, contextProvider: FnContextProvider) {
    this.contextInformations.push(
      contextProvider(
        match,
        this.state.doc,
        Object.assign({}, ...this.contextInformations, match.contextInformation)
      )
    );
    this.contextBounds.push(match.to);
  }

  private getProjectionFor(match: Match): Projection {
    if (!this.projectionMap || !this.subProjectionMap) {
      this.initProjectionMaps();
    }

    let projection: Projection | undefined = this.projectionMap.get(match.pattern);
    if (!projection) {
      projection = this.subProjectionMap.get(match.pattern.template);
      if (!projection) {
        throw new NoProjectionFound();
      }
    }
    return projection;
  }

  private initProjectionMaps(): void {
    this.projectionMap = toRootProjectionMap(this.config.projections);
    this.subProjectionMap = toSubProjectionMap(this.config.projections);
  }

  private extractSegmentDecoratorsFor(
    match: Match,
    widgets: ProjectionWidgetClass[],
    contextInformation: ContextInformation
  ) {
    const ranges = this.getActualRangesFor(match);

    for (const [range, Widget] of zip(ranges, widgets)) {
      try {
        this.updateExistsingSegmentWidgetForRange(range, match, contextInformation, Widget);
      } catch (error) {
        if (error instanceof NoWidgetFound) {
          this.createNewSegmentWidgetForRange(range, match, contextInformation, Widget);
        } else {
          throw error;
        }
      }
    }
  }

  private getActualRangesFor(match: Match): Range[] {
    let rangesToRemove = match.blockRanges
      .concat(match.chainRanges)
      .concat(match.aggregationRanges);
    rangesToRemove = this.sortByFrom(rangesToRemove);

    let ranges: Range[] = [];
    let currentFrom = match.from;
    for (const rangeToRemove of rangesToRemove) {
      if (rangeToRemove.from !== currentFrom) {
        ranges.push({ from: currentFrom, to: rangeToRemove.from });
      }
      currentFrom = rangeToRemove.to;
    }

    if (currentFrom < match.to) {
      ranges.push({ from: currentFrom, to: match.to });
    }

    this.removeWhitespaceFromRanges(ranges, match);
    ranges = ranges.filter((range) => range.from !== range.to);

    if (match.pattern instanceof AggregationDecorator) {
      ranges = this.removeSeparatorTokenRanges(ranges, match);
    }

    return ranges;
  }

  private sortByFrom(ranges: CodeRange[]): CodeRange[] {
    const sortedRanges = [...ranges];
    sortedRanges.sort((rangeA, rangeB) => {
      if (rangeA.from < rangeB.from) {
        return -1;
      } else if (rangeA.from > rangeB.from) {
        return 1;
      }
      return 0;
    });
    return sortedRanges;
  }

  private removeWhitespaceFromRanges(ranges: Range[], match: Match) {
    for (const range of ranges) {
      let relativeFrom = range.from - match.node.startIndex;
      let relativeTo = range.to - match.node.startIndex;

      const delimiterTokens = loadAggregationDelimiterTokensFor(match.pattern.language);
      const rangeText = match.node.text.slice(relativeFrom, relativeTo);
      let textPointer = 0;
      while (
        (/\s/g.test(rangeText.charAt(textPointer)) ||
          delimiterTokens.includes(rangeText.charAt(textPointer))) &&
        relativeFrom < relativeTo
      ) {
        textPointer++;
        relativeFrom++;
      }

      textPointer = rangeText.length - 1;
      while (
        (/\s/g.test(rangeText.charAt(textPointer)) ||
          delimiterTokens.includes(rangeText.charAt(textPointer))) &&
        relativeFrom < relativeTo
      ) {
        textPointer--;
        relativeTo--;
      }

      range.from = relativeFrom + match.node.startIndex;
      range.to = relativeTo + match.node.startIndex;
    }
  }

  private removeSeparatorTokenRanges(ranges: Range[], match: Match) {
    const aggregatableNodeTypes = loadAggregationsConfigFor(
      match.pattern.language
    ).aggregatableNodeTypes;
    const separatorTokens = Object.values(aggregatableNodeTypes).reduce(
      (separatorTokens: string[], nodeTypeConfig: AggregatableNodeTypeConfig) => {
        return separatorTokens.concat(nodeTypeConfig.delimiterToken);
      },
      []
    );
    return ranges.filter((range) => {
      const relativeFrom = range.from - match.node.startIndex;
      const relativeTo = range.to - match.node.startIndex;
      const trimmedRangeText = match.node.text.slice(relativeFrom, relativeTo).trim();
      return !separatorTokens.includes(trimmedRangeText);
    });
  }

  private updateExistsingSegmentWidgetForRange(
    range: Range,
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    let found = false;
    this.decorations.between(range.from, range.to, (decorationFrom, decorationTo, decoration) => {
      const widget = decoration.spec.widget;
      if (
        (decorationFrom === range.from || decorationTo === range.to) &&
        widget instanceof Widget
      ) {
        widget.set(match, contextInformation, this.state);
        this.newDecorations = this.newDecorations.update({
          add: [decoration.range(range.from, range.to)],
        });
        this.decorations = this.decorations.update({
          filter: (_, __, currentDecoration) => currentDecoration !== decoration,
        });
        found = true;
        return false;
      }
    });
    if (!found) {
      throw new NoWidgetFound();
    }
  }

  private createNewSegmentWidgetForRange(
    range: Range,
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    this.newDecorations = this.newDecorations.update({
      add: [
        Decoration.replace({
          widget: new Widget(this.isCompletion, match, contextInformation, this.state),
        }).range(range.from, range.to),
      ],
    });
  }

  private extractPostfixDecoratorFor(
    match: Match,
    Widget: ProjectionWidgetClass,
    contextInformation: ContextInformation
  ) {
    try {
      this.updateExistsingPostfixWidgetFor(match, contextInformation, Widget);
    } catch (error) {
      if (error instanceof NoWidgetFound) {
        this.createNewPostfixWidgetFor(match, contextInformation, Widget);
      } else {
        throw error;
      }
    }
  }

  private updateExistsingPostfixWidgetFor(
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    let found = false;
    this.decorations.between(match.from, match.to, (decorationFrom, decorationTo, decoration) => {
      const widget = decoration.spec.widget;
      if (
        (decorationFrom === match.from || decorationTo === match.to) &&
        widget instanceof Widget
      ) {
        widget.set(match, contextInformation, this.state);
        this.newDecorations = this.newDecorations.update({
          add: [decoration.range(match.to, match.to)],
        });
        this.decorations = this.decorations.update({
          filter: (_, __, currentDecoration) => currentDecoration !== decoration,
        });
        found = true;
        return false;
      }
    });
    if (!found) {
      throw new NoWidgetFound();
    }
  }

  private createNewPostfixWidgetFor(
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    this.newDecorations = this.newDecorations.update({
      add: [
        Decoration.widget({
          widget: new Widget(this.isCompletion, match, contextInformation, this.state),
          side: 1000,
        }).range(match.to, match.to),
      ],
    });
  }

  private extractPrefixDecoratorFor(
    match: Match,
    Widget: ProjectionWidgetClass,
    contextInformation: ContextInformation
  ) {
    try {
      this.updateExistsingPrefixWidgetFor(match, contextInformation, Widget);
    } catch (error) {
      if (error instanceof NoWidgetFound) {
        this.createNewPrefixWidgetFor(match, contextInformation, Widget);
      } else {
        throw error;
      }
    }
  }

  private updateExistsingPrefixWidgetFor(
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    let found = false;
    this.decorations.between(match.from, match.to, (decorationFrom, decorationTo, decoration) => {
      const widget = decoration.spec.widget;
      if (
        (decorationFrom === match.from || decorationTo === match.to) &&
        widget instanceof Widget
      ) {
        widget.set(match, contextInformation, this.state);
        this.newDecorations = this.newDecorations.update({
          add: [decoration.range(match.from, match.from)],
        });
        this.decorations = this.decorations.update({
          filter: (_, __, currentDecoration) => currentDecoration !== decoration,
        });
        found = true;
        return false;
      }
    });
    if (!found) {
      throw new NoWidgetFound();
    }
  }

  private createNewPrefixWidgetFor(
    match: Match,
    contextInformation: ContextInformation,
    Widget: ProjectionWidgetClass
  ) {
    this.newDecorations = this.newDecorations.update({
      add: [
        Decoration.widget({
          widget: new Widget(this.isCompletion, match, contextInformation, this.state),
          side: -1000,
        }).range(match.from, match.from),
      ],
    });
  }
}

interface Range {
  from: number;
  to: number;
}

class NoProjectionFound extends Error {
  constructor(message?: string) {
    super(message);
  }
}

class NoWidgetFound extends Error {
  constructor(message?: string) {
    super(message);
  }
}
