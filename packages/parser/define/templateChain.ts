import AstCursor from "../ast/cursor";
import RawTemplate from "./rawTemplate";
import { Context } from "../match/types";
import TemplateParameter from "./templateParameter";
import PatternNode from "../pattern/nodes/patternNode";
import { Target } from "../treeSitterParser";
import ChainNode from "../pattern/nodes/chainNode";
import Pattern from "../pattern/pattern";

export default class TemplateChain extends TemplateParameter {
  static readonly CODE_STRING_PREFIX = "__template_chain_";

  constructor(
    public readonly name: string,
    public readonly basePattern: Pattern,
    public readonly subPatterns: RawTemplate[],
    public readonly context: Context = {}
  ) {
    super();
  }

  toCodeString(): string {
    if (this._id === undefined) {
      this._id = TemplateParameter.issueId();
    }
    return TemplateChain.CODE_STRING_PREFIX + this._id.toString();
  }

  getCodeStringsForParts(): string[] {
    return this.subPatterns.map((pattern) => pattern.toCodeString());
  }

  toPatternNode(cursor: AstCursor, language: Target): PatternNode {
    return new ChainNode(
      language,
      cursor.currentNode.text,
      cursor.currentFieldName,
      cursor.currentNode.type,
      this
    );
  }
}