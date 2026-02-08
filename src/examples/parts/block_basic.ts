import { exprLiteral, exprParam, paramLength, part, withTags } from "../../dsl/core.js";
import { extrude, profileRect } from "../../dsl/geometry.js";
import type { PartDefinition } from "./types.js";

export const blockBasic: PartDefinition = {
  id: "block-basic",
  title: "Block (Basic Extrude)",
  sourcePath: "src/examples/parts/block_basic.ts",
  part: part(
    "block-basic",
    [
      withTags(
        extrude(
          "block",
          profileRect(exprParam("w"), exprParam("h")),
          exprParam("d"),
          "body:main"
        ),
        ["basic-block"]
      ),
    ],
    {
      params: [
        paramLength("w", exprLiteral(60, "mm")),
        paramLength("h", exprLiteral(40, "mm")),
        paramLength("d", exprLiteral(20, "mm")),
      ],
    }
  ),
};
