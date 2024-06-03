import AstCursor from "../ast/cursor";
import Template from "../template/template";
import TemplateAggregation from "../template/parameters/templateAggregation";
import PatternNode from "../pattern/nodes/patternNode";
import Pattern from "../pattern/pattern";
import AggregationDecorator from "../pattern/decorators/aggregationDecorator";
import ChainDecorator from "../pattern/decorators/chainDecorator";
import PatternCursor from "../pattern/cursor";
import { PatternMap, PatternsMap } from "../match/types";
import { loadAggregatableNodeTypeConfigFor } from "@puredit/language-config";
import {
  NodeTransformVisitor,
  AggStartTemplateTransformation,
  AggPartTemplateTransformation,
  ChainLinkTemplateTransformation,
  CompleteTemplateTransformation,
  Parser,
} from "./internal";
import AggregationNode from "../pattern/nodes/aggregationNode";
import CodeString from "../template/codeString";

export default abstract class TemplateTransformation {
  protected template!: Template;
  protected isExpression!: boolean;
  protected nodeTransformVisitor!: NodeTransformVisitor;

  constructor(protected readonly parser: Parser) {
    this.nodeTransformVisitor = new NodeTransformVisitor(this.parser.language);
  }

  setIsExpression(isExpression: boolean): TemplateTransformation {
    this.isExpression = isExpression;
    return this;
  }

  setTemplate(template: Template): TemplateTransformation {
    this.template = template;
    return this;
  }

  abstract execute(): Pattern;

  protected transformToPatternTree(codeString: CodeString): PatternNode {
    const cursor = new AstCursor(this.parser.parse(codeString.raw).walk());
    if (this.isExpression) {
      cursor.goToExpression();
    }
    const rootPatternNode = this.nodeTransformVisitor.transform(cursor, codeString)[0];
    if (rootPatternNode.isTopNode() && rootPatternNode.children) {
      return rootPatternNode.children[0].cutOff();
    }
    return rootPatternNode;
  }

  protected buildAggregationSubPatterns(pattern: Pattern): AggregationDecorator {
    const aggregationPatternMap: PatternsMap = {};
    const aggregationTypeMap: Record<string, string> = {};
    const specialStartPatternMap: PatternMap = {};
    const aggregations = this.template.getAggregations();
    for (const aggregation of aggregations) {
      const aggregatedNodeType = this.getAggregatedNodeType(pattern, aggregation);
      const nodeTypeConfig = loadAggregatableNodeTypeConfigFor(
        this.template.language,
        aggregatedNodeType
      );

      const aggregationPartPatternsGeneration = new AggPartTemplateTransformation(this.parser);
      if (aggregation.startTemplate) {
        aggregationPartPatternsGeneration.setStartTemplateCodeString(
          aggregation.startTemplate.toCodeString(this.parser.language)
        );
      }
      const aggregationSubPatterns = aggregation.partTemplates.map((subTemplate) => {
        return aggregationPartPatternsGeneration
          .setNodeTypeConfig(nodeTypeConfig)
          .setIsExpression(false)
          .setTemplate(subTemplate)
          .execute();
      });
      aggregationPatternMap[aggregation.name] = aggregationSubPatterns;
      aggregationTypeMap[aggregation.name] = aggregatedNodeType;

      if (aggregation.startTemplate) {
        const aggregationStartTemplateTransformation = new AggStartTemplateTransformation(
          this.parser
        );
        const aggregationStartPattern = aggregationStartTemplateTransformation
          .setNodeTypeConfig(nodeTypeConfig)
          .setIsExpression(false)
          .setTemplate(aggregation.startTemplate)
          .execute();
        specialStartPatternMap[aggregation.name] = aggregationStartPattern;
      }
    }
    const aggregationDecorator = new AggregationDecorator(
      pattern,
      aggregationPatternMap,
      specialStartPatternMap,
      aggregationTypeMap
    );
    this.template.addPattern(aggregationDecorator);
    return aggregationDecorator;
  }

  private getAggregatedNodeType(pattern: Pattern, aggregation: TemplateAggregation): string {
    const aggregationCodeString = aggregation.toCodeString(this.parser.language);
    const aggregationPath = pattern.getPathToNodeWithText(aggregationCodeString);
    const patternCursor = new PatternCursor(pattern);
    patternCursor.follow(aggregationPath);
    const aggregationNode = patternCursor.currentNode as AggregationNode;
    return aggregationNode.astNodeType;
  }

  protected buildChainSubPatterns(pattern: Pattern): ChainDecorator {
    const startPatternMap: PatternMap = {};
    const linkPatternMap: PatternsMap = {};
    const chains = this.template.getChains();
    for (const chain of chains) {
      const startTemplateTransformation = new CompleteTemplateTransformation(this.parser);
      const startPattern = startTemplateTransformation
        .setIsExpression(true)
        .setTemplate(chain.startTemplate)
        .execute();

      const linkPatterns = chain.linkTemplates.map((linkTemplate) => {
        const linkTemplateTransformation = new ChainLinkTemplateTransformation(this.parser);
        return linkTemplateTransformation
          .setStartPatternRootNode(startPattern.rootNode)
          .setIsExpression(false)
          .setTemplate(linkTemplate)
          .execute();
      });
      startPatternMap[chain.name] = startPattern;
      linkPatternMap[chain.name] = linkPatterns;
    }
    const chainDecorator = new ChainDecorator(pattern, startPatternMap, linkPatternMap);
    this.template.addPattern(chainDecorator);
    return chainDecorator;
  }
}
