import TemplateParameter from "./parameters/templateParameter";
import TemplateAggregation from "./parameters/templateAggregation";
import TemplateChain from "./parameters/templateChain";
import { Language } from "@puredit/language-config";
import CodeString from "./codeString";
import Pattern from "../pattern/pattern";
import ReferencePattern from "../pattern/referencePattern";

export type Template = TransformableTemplate | ReferenceTemplate;

/**
 * @class
 * Represents a tempalte created from a tagged tempalte string that is to be
 * transformed into a pattern using the parser.
 */
export class TransformableTemplate {
  constructor(
    public readonly name: string,
    public readonly templateStrings: TemplateStringsArray,
    public readonly params: TemplateParameter[]
  ) {}

  hasAggregations(): boolean {
    return !!this.params.find((param) => param instanceof TemplateAggregation);
  }

  getAggregations(): TemplateAggregation[] {
    return this.params.filter(
      (param) => param instanceof TemplateAggregation
    ) as TemplateAggregation[];
  }

  hasChains(): boolean {
    return !!this.params.find((param) => param instanceof TemplateChain);
  }

  getChains(): TemplateChain[] {
    return this.params.filter((param) => param instanceof TemplateChain) as TemplateChain[];
  }

  toCodeString(language: Language): CodeString {
    return CodeString.fromTemplate(this, language);
  }
}

/**
 * @class
 * Represents a reference to an existing template.
 */
export class ReferenceTemplate {
  constructor(public readonly name: string) {}

  toPattern(): Pattern {
    return new ReferencePattern(this.name);
  }
}
