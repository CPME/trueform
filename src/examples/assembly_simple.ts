import { dsl } from "../dsl.js";

export const asmPlate = dsl.part(
  "asm-plate",
  [dsl.extrude("base", dsl.profileRect(40, 40), 6, "body:main")],
  {
    connectors: [
      dsl.mateConnector(
        "plate-top",
        dsl.selectorFace(
          [dsl.predPlanar(), dsl.predCreatedBy("base")],
          [dsl.rankMaxZ()]
        )
      ),
    ],
  }
);

export const asmPeg = dsl.part(
  "asm-peg",
  [dsl.extrude("shaft", dsl.profileRect(12, 12), 20, "body:main")],
  {
    connectors: [
      dsl.mateConnector(
        "peg-bottom",
        dsl.selectorFace(
          [dsl.predPlanar(), dsl.predCreatedBy("shaft")],
          [dsl.rankMinZ()]
        )
      ),
    ],
  }
);

export const platePegAssembly = dsl.assembly(
  "plate-peg",
  [
    dsl.assemblyInstance("plate-1", "asm-plate"),
    dsl.assemblyInstance(
      "peg-1",
      "asm-peg",
      dsl.transform({ translation: [20, 0, 20] })
    ),
  ],
  {
    mates: [
      dsl.mateCoaxial(
        dsl.assemblyRef("plate-1", "plate-top"),
        dsl.assemblyRef("peg-1", "peg-bottom")
      ),
      dsl.matePlanar(
        dsl.assemblyRef("plate-1", "plate-top"),
        dsl.assemblyRef("peg-1", "peg-bottom"),
        0
      ),
    ],
  }
);

export const assemblySimple = {
  id: "plate-peg",
  title: "Plate + Peg",
  sourcePath: "src/examples/assembly_simple.ts",
  parts: [asmPlate, asmPeg],
  assembly: platePegAssembly,
};
