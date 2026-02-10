# Assembly Examples

## Basic Assembly

```ts
import { dsl, buildAssembly, buildPart, MockBackend } from "trueform";

const plate = dsl.part(
  "plate",
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

const peg = dsl.part(
  "peg",
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

const assembly = dsl.assembly(
  "plate-peg",
  [
    dsl.assemblyInstance("plate-1", "plate"),
    dsl.assemblyInstance(
      "peg-1",
      "peg",
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

const backend = new MockBackend();
const plateBuilt = buildPart(plate, backend);
const pegBuilt = buildPart(peg, backend);
const solved = buildAssembly(assembly, [plateBuilt, pegBuilt]);
```
