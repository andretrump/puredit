import type { ProjectionPluginConfig } from "@puredit/projections";
import { globalContextVariables } from "./globalContext";
import { Language } from "@puredit/language-config";
import { projections as polarsProjections } from "@puredit/py-polars";
import { projections as latexMathProjections } from "@puredit/py-latex-math";
import { projections as pytorchProjections } from "@puredit/py-pytorch";
import { Parser } from "@puredit/parser";
import { BrowserWasmPathProvider } from "@puredit/utils-browser";

const wasmPathProvider = new BrowserWasmPathProvider(Language.Python);
const parser = await Parser.load(Language.Python, wasmPathProvider);

export const projectionPluginConfig: ProjectionPluginConfig = {
  parser,
  globalContextVariables,
  globalContextInformation: {},
  projections: {
    "py-polars": polarsProjections,
    "py-latex-math": latexMathProjections,
    "py pytorch": pytorchProjections,
  },
};
