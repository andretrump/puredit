import { isString } from "@puredit/utils-shared";
import TemplateParameter from "./parameters/templateParameter";
import { Language } from "@puredit/language-config";

/**
 * @class
 * Holds the paramteres in acode string with their positions in the code string.
 * It is used by the CodeString to store the positions of its parameters.
 */
export default class ParameterTable {
  private table: Record<string, TemplateParameter> = {};

  static fromTemplate(
    templateStrings: TemplateStringsArray,
    params: TemplateParameter[],
    language: Language
  ): ParameterTable {
    let result = "";
    const table = new ParameterTable();

    for (let i = 0; i < templateStrings.length; i++) {
      result += templateStrings[i];
      const param = params[i];

      if (param && param instanceof TemplateParameter) {
        const substitution = params[i].toCodeString(language);
        const substitutionIndex = result.length;
        const substitutionLength = substitution.length;
        table.set(substitutionIndex, substitutionIndex + substitutionLength, param);
        result += substitution;
      } else if (param && isString(param)) {
        result += param;
      }
    }

    return table;
  }

  set(from: number, to: number, templateParameter: TemplateParameter) {
    const hash = this.getKey(from, to);
    this.table[hash] = templateParameter;
  }

  get(from: number, to: number): TemplateParameter | undefined {
    const hash = this.getKey(from, to);
    return this.table[hash];
  }

  delete(from: number, to: number) {
    const key = this.getKey(from, to);
    delete this.table[key];
  }

  shift(offset: number) {
    const tempTable: Record<string, TemplateParameter> = {};
    Object.keys(this.table).forEach((key: string) => {
      const { from, to } = this.decodeKey(key);
      const newFrom = from + offset;
      const newTo = to + offset;
      const parameter = this.get(from, to)!;
      tempTable[this.getKey(newFrom, newTo)] = parameter;
    });
    this.table = tempTable;
  }

  shiftStartingAfter(bound: number, offset: number) {
    const tempTable: Record<string, TemplateParameter> = {};
    Object.keys(this.table).forEach((key: string) => {
      const { from, to } = this.decodeKey(key);
      const parameter = this.get(from, to)!;
      if (from > bound) {
        const newFrom = from + offset;
        const newTo = to + offset;
        tempTable[this.getKey(newFrom, newTo)] = parameter;
      } else {
        tempTable[this.getKey(from, to)] = parameter;
      }
    });
  }

  merge(other: ParameterTable) {
    Object.keys(other.table).forEach((key: string) => {
      const { from, to } = JSON.parse(key);
      const existingParameter = this.get(from, to);
      if (existingParameter) {
        throw new Error(`Cannot insert item with duplicate key from ${from} to ${to}`);
      }
      this.set(from, to, other.get(from, to)!);
    });
  }

  private getKey(from: number, to: number): string {
    return JSON.stringify({ from, to });
  }

  private decodeKey(key: string) {
    return JSON.parse(key);
  }
}
