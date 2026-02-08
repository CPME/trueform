import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { solveAssembly } from "../assembly.js";
import { MockBackend } from "../mock_backend.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "connector: resolves frame from selector metadata",
    fn: async () => {
      const backend = new MockBackend();
      const part = dsl.part(
        "plate",
        [dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main")],
        {
          connectors: [
            dsl.mateConnector(
              "conn-top",
              dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")])
            ),
          ],
        }
      );
      const result = buildPart(part, backend);
      const connector = result.connectors.get("conn-top");
      assert.ok(connector);
      assert.deepEqual(connector?.origin, [0, 0, 6]);
      assert.deepEqual(connector?.zAxis, [0, 0, 1]);
    },
  },
  {
    name: "assembly: fixed mate solves transforms",
    fn: async () => {
      const backend = new MockBackend();
      const part = dsl.part(
        "plate",
        [dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main")],
        {
          connectors: [
            dsl.mateConnector(
              "conn-top",
              dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")])
            ),
          ],
        }
      );
      const built = buildPart(part, backend);
      const assembly = dsl.assembly(
        "asm-1",
        [
          dsl.assemblyInstance("inst-a", "plate"),
          dsl.assemblyInstance(
            "inst-b",
            "plate",
            dsl.transform({ translation: [10, 0, 0] })
          ),
        ],
        {
          mates: [
            dsl.mateFixed(
              dsl.assemblyRef("inst-a", "conn-top"),
              dsl.assemblyRef("inst-b", "conn-top")
            ),
          ],
        }
      );

      const result = solveAssembly(
        assembly,
        new Map([["plate", built.connectors]])
      );
      assert.equal(result.converged, true);
      const instB = result.instances.find((inst) => inst.id === "inst-b");
      assert.ok(instB);
      assert.ok(Math.abs((instB?.transform[12] ?? 0) - 0) < 1e-3);
    },
  },
  {
    name: "assembly: coaxial mate aligns axes without axial lock",
    fn: async () => {
      const backend = new MockBackend();
      const part = dsl.part(
        "plate",
        [dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main")],
        {
          connectors: [
            dsl.mateConnector(
              "conn-top",
              dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")])
            ),
          ],
        }
      );
      const built = buildPart(part, backend);
      const assembly = dsl.assembly(
        "asm-2",
        [
          dsl.assemblyInstance("inst-a", "plate"),
          dsl.assemblyInstance(
            "inst-b",
            "plate",
            dsl.transform({ translation: [10, 5, 3] })
          ),
        ],
        {
          mates: [
            dsl.mateCoaxial(
              dsl.assemblyRef("inst-a", "conn-top"),
              dsl.assemblyRef("inst-b", "conn-top")
            ),
          ],
        }
      );

      const result = solveAssembly(
        assembly,
        new Map([["plate", built.connectors]])
      );
      assert.equal(result.converged, true);
      const instB = result.instances.find((inst) => inst.id === "inst-b");
      assert.ok(instB);
      assert.ok(Math.abs((instB?.transform[12] ?? 0) - 0) < 1e-3);
      assert.ok(Math.abs((instB?.transform[13] ?? 0) - 0) < 1e-3);
      assert.ok(Math.abs((instB?.transform[14] ?? 0) - 3) < 2e-3);
    },
  },
  {
    name: "assembly: planar mate honors offset",
    fn: async () => {
      const backend = new MockBackend();
      const part = dsl.part(
        "plate",
        [dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main")],
        {
          connectors: [
            dsl.mateConnector(
              "conn-top",
              dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")])
            ),
          ],
        }
      );
      const built = buildPart(part, backend);
      const offset = 4;
      const assembly = dsl.assembly(
        "asm-3",
        [
          dsl.assemblyInstance("inst-a", "plate"),
          dsl.assemblyInstance(
            "inst-b",
            "plate",
            dsl.transform({ translation: [0, 0, 20] })
          ),
        ],
        {
          mates: [
            dsl.matePlanar(
              dsl.assemblyRef("inst-a", "conn-top"),
              dsl.assemblyRef("inst-b", "conn-top"),
              offset
            ),
          ],
        }
      );

      const result = solveAssembly(
        assembly,
        new Map([["plate", built.connectors]])
      );
      assert.equal(result.converged, true);
      const instB = result.instances.find((inst) => inst.id === "inst-b");
      assert.ok(instB);
      assert.ok(Math.abs((instB?.transform[14] ?? 0) - offset) < 1e-3);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
