import { Path } from "../context-var-detection/blockVariableMap";
import AstCursor from "@puredit/parser/ast/cursor";
import ComplexTemplateParameter from "./complexParameter";

export class TemplateChain extends ComplexTemplateParameter {
  static lastId = -1;
  static issueId() {
    TemplateChain.lastId++;
    return TemplateChain.lastId;
  }

  public startSubProjectionName = "";
  public linkSubProjectionNames: string[] = [];

  constructor(path: Path, public readonly start: ChainStart, public readonly links: ChainLink[]) {
    super(TemplateChain.issueId(), path);
  }

  copyWithPath(newPath: Path): TemplateChain {
    const copy = new TemplateChain(newPath, this.start, this.links);
    copy.startSubProjectionName = this.startSubProjectionName;
    copy.linkSubProjectionNames = this.linkSubProjectionNames;
    return copy;
  }

  toDeclarationString(): string {
    const variableName = this.toVariableName();
    const subProjectionsString = this.linkSubProjectionNames
      .map((name) => `  ${name}.template,`)
      .join("\n");
    return `const ${variableName} = chain("${variableName}", ${this.startSubProjectionName}.template, [
${subProjectionsString}
]);\n`;
  }

  toVariableName(): string {
    return `chain${this.id}`;
  }

  getEndIndex(astCursor: AstCursor) {
    astCursor.follow(this.links[this.links.length - 1].endNodepath);
    return astCursor.currentNode.endIndex;
  }

  getSubProjectionsCode(astCursor: AstCursor, sample: string): string {
    let subProjectionsCodes = [];
    subProjectionsCodes.push(this.start.extractText(astCursor, sample));
    subProjectionsCodes = subProjectionsCodes.concat(
      this.links.map((link) => link.extractText(astCursor, sample))
    );
    return subProjectionsCodes.join(" | ");
  }
}

export class ChainLink {
  constructor(public readonly startNodePath: number[], public readonly endNodepath: number[]) {}

  extractText(astCursor: AstCursor, codeSample: string) {
    astCursor.follow(this.startNodePath);
    const startIndex = astCursor.currentNode.startIndex + 1;
    astCursor.reverseFollow(this.startNodePath);
    astCursor.follow(this.endNodepath);
    const endIndex = astCursor.currentNode.endIndex;
    astCursor.reverseFollow(this.endNodepath);
    return codeSample.slice(startIndex, endIndex);
  }
}

export class ChainStart {
  constructor(public readonly nodePath: number[]) {}

  extractText(astCursor: AstCursor, codeSample: string) {
    astCursor.follow(this.nodePath);
    const startIndex = astCursor.currentNode.startIndex;
    const endIndex = astCursor.currentNode.endIndex;
    astCursor.reverseFollow(this.nodePath);
    return codeSample.slice(startIndex, endIndex);
  }
}
