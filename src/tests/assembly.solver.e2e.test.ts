import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { solveAssembly } from "../assembly.js";
import { MockBackend } from "../mock_backend.js";
import { multiplyMatrices, type Matrix4 } from "../transform.js";
import { runTests } from "./occt_test_utils.js";

type FrameAxes = {
  origin: [number, number, number];
  zAxis: [number, number, number];
};

const normalize = (v: [number, number, number]): [number, number, number] => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};

const frameFrom = (transform: Matrix4, connector: { matrix: number[] }): FrameAxes => {
  const world = multiplyMatrices(transform, connector.matrix as Matrix4);
  return {
    origin: [world[12] ?? 0, world[13] ?? 0, world[14] ?? 0],
    zAxis: normalize([world[8] ?? 0, world[9] ?? 0, world[10] ?? 0]),
  };
};

const dot = (a: [number, number, number], b: [number, number, number]): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

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
  {
    name: "assembly: distance mate honors target distance",
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
      const distance = 5;
      const assembly = dsl.assembly(
        "asm-4",
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
            dsl.mateDistance(
              dsl.assemblyRef("inst-a", "conn-top"),
              dsl.assemblyRef("inst-b", "conn-top"),
              distance
            ),
          ],
        }
      );

      const result = solveAssembly(
        assembly,
        new Map([["plate", built.connectors]])
      );
      assert.equal(result.converged, true);
      const instA = result.instances.find((inst) => inst.id === "inst-a");
      const instB = result.instances.find((inst) => inst.id === "inst-b");
      assert.ok(instA && instB);
      const connector = built.connectors.get("conn-top");
      assert.ok(connector);
      const frameA = frameFrom(instA!.transform, connector!);
      const frameB = frameFrom(instB!.transform, connector!);
      const dx = frameB.origin[0] - frameA.origin[0];
      const dy = frameB.origin[1] - frameA.origin[1];
      const dz = frameB.origin[2] - frameA.origin[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      assert.ok(Math.abs(dist - distance) < 1e-3);
    },
  },
  {
    name: "assembly: angle mate honors target angle",
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
      const angle = 90;
      const assembly = dsl.assembly(
        "asm-5",
        [
          dsl.assemblyInstance("inst-a", "plate"),
          dsl.assemblyInstance(
            "inst-b",
            "plate",
            dsl.transform({ rotation: [0, 0, 0] })
          ),
        ],
        {
          mates: [
            dsl.mateAngle(
              dsl.assemblyRef("inst-a", "conn-top"),
              dsl.assemblyRef("inst-b", "conn-top"),
              angle
            ),
          ],
        }
      );

      const result = solveAssembly(
        assembly,
        new Map([["plate", built.connectors]])
      );
      assert.equal(result.converged, true);
      const instA = result.instances.find((inst) => inst.id === "inst-a");
      const instB = result.instances.find((inst) => inst.id === "inst-b");
      assert.ok(instA && instB);
      const connector = built.connectors.get("conn-top");
      assert.ok(connector);
      const frameA = frameFrom(instA!.transform, connector!);
      const frameB = frameFrom(instB!.transform, connector!);
      const cos = dot(frameA.zAxis, frameB.zAxis);
      assert.ok(Math.abs(cos - Math.cos((angle * Math.PI) / 180)) < 1e-3);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
