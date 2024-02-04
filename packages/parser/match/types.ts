import type { Target } from "../treeSitterParser";
import AstNode from "../ast/node";
import Pattern from "../pattern/pattern";
import AstCursor from "../ast/cursor";

export type PatternMap = Record<string, Pattern[]>;

export type ArgMap = Record<string, AstNode>;

export interface CandidateMatch {
  pattern: Pattern;
  cursor: AstCursor;
  context: Context;
}

export interface Match {
  pattern: Pattern;
  node: AstNode;
  args: ArgMap;
  blockRanges: CodeRange[];
  aggregationRangeMap: AggregationRangeMap;
}

export type Context = Record<string, string>;

export type AggregationRangeMap = Record<string, CodeRange[]>;

export interface ContextRange {
  from: number;
  to: number;
  context: Context;
}

export interface CodeRange {
  node: AstNode;
  context: Context;
  from: number;
  to: number;
  language: Target;
}

export interface PatternMatchingResult {
  matches: Match[];
  contextRanges: ContextRange[];
}
