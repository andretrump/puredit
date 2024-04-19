import { parser } from "../../parser";
import { svelteProjection } from "@puredit/projections/svelte";
import type { SubProjection } from "@puredit/projections/types";
import Widget from "./Widget.svelte";
import { agg } from "@puredit/parser";
import { binColumnCompositionSubProjection } from "../binColumnCompositionSubProjection/config";
import { columnChainSubProjection } from "../columnChainSubProjection/config";
import EmptyWidget from "@puredit/projections/EmptyWidget.svelte";

const columnCombinations = agg("columnCombinations", "argument_list", [
  binColumnCompositionSubProjection.pattern,
  columnChainSubProjection.pattern,
]);
const pattern = parser.subPattern(
  "extendDataFrameProjectionPattern"
)`with_columns${columnCombinations}`;

const beginWidget = svelteProjection(Widget);
const endWidget = svelteProjection(EmptyWidget);

export const extendDataFrameSubProjection: SubProjection = {
  name: "Extend Dataframe",
  description: "Extend a dataframe with a set of columns.",
  pattern,
  requiredContextVariables: [],
  segmentWidgets: [beginWidget, endWidget],
};