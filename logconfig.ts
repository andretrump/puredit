import { LogLevel } from "typescript-logging";
import { Log4TSProvider } from "typescript-logging-log4ts-style";

export const logProvider = Log4TSProvider.createProvider("Puredit", {
  level: LogLevel.Info,
  groups: [
    {
      identifier: "parser",
      expression: new RegExp("parser.+"),
    },
    {
      identifier: "projections",
      expression: new RegExp("projections.+"),
    },
    {
      identifier: "codemirror-typescript",
      expression: new RegExp("codemirror-typescript.+"),
    },
  ],
});
