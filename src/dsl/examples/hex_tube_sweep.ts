import { part } from "../core.js";
import { hexTubeSweep, pathSpline } from "../geometry.js";
import type { PartDefinition } from "../../examples/parts/types.js";

export const hexTubeSweepPart: PartDefinition = {
  id: "hex-tube-sweep",
  title: "Hex Tube Sweep",
  sourcePath: "src/dsl/examples/hex_tube_sweep.ts",
  part: part("hex-tube-sweep", [
    hexTubeSweep(
      "hex-sweep-1",
      pathSpline(
        [
          [0, 0, 0],
          [30, 0, 0],
          [60, 20, 10],
          [70, 40, 30],
        ],
        { degree: 3 }
      ),
      40,
      30,
      "body:main"
    ),
  ]),
};
