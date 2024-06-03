import PatternNode from "./patternNode";
import AstCursor from "../../ast/cursor";
import { Language, loadArgumentsConfigFor, typePlaceHolder } from "@puredit/language-config";

export default class ArgumentNode extends PatternNode {
  static readonly TYPE: string = "ArgumentNode";

  public readonly name: string;
  public readonly astNodeTypes: string[];

  constructor(
    name: string,
    language: Language,
    astNodeTypes: string[],
    fieldName: string | undefined,
    text: string
  ) {
    super(language, ArgumentNode.TYPE, fieldName, text);
    this.name = name;
    this.astNodeTypes = astNodeTypes;
  }

  getMatchedTypes(): string[] {
    return this.astNodeTypes;
  }

  matches(astCursor: AstCursor): boolean {
    const astNode = astCursor.currentNode;
    return (
      this.astNodeTypes.includes(astNode.cleanNodeType) &&
      astCursor.currentFieldName === this.fieldName
    );
  }

  toDraftString(): string {
    if (this.astNodeTypes.length === 1) {
      return this.getDraftStringForSingeType(this.astNodeTypes[0], this.language!);
    } else {
      return this.getDraftStringForMultipleTypes(this.language!);
    }
  }

  private getDraftStringForSingeType(type: string, language: Language): string {
    const argumentsConfig = loadArgumentsConfigFor(language);
    const maybeDraft = argumentsConfig.draftTypeMapping[type];
    if (maybeDraft) {
      return maybeDraft;
    } else {
      return argumentsConfig.draftTypeMapping["default"].replace(typePlaceHolder, type);
    }
  }

  private getDraftStringForMultipleTypes(language: Language): string {
    return this.astNodeTypes
      .map((type) => {
        const argumentsConfig = loadArgumentsConfigFor(language);
        return argumentsConfig.draftTypeMapping["default"].replace(typePlaceHolder, type);
      })
      .join("_or");
  }
}
