import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  countEdges,
  countFaces,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

function openLineProfile(
  id: string,
  profileName: string,
  start: [number, number],
  end: [number, number],
  opts?: { plane?: ReturnType<typeof dsl.planeDatum>; deps?: string[] }
) {
  const lineId = `${id}-line`;
  return dsl.sketch2d(
    id,
    [{ name: profileName, profile: dsl.profileSketchLoop([lineId], { open: true }) }],
    {
      plane: opts?.plane,
      deps: opts?.deps,
      entities: [dsl.sketchLine(lineId, start, end)],
    }
  );
}

const tests = [
  {
    name: "occt parity probe: rib/web produce valid solids from open sketch profiles",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("rib-web-probe", [
        openLineProfile("rib-sketch", "profile:rib", [-18, 0], [18, 0]),
        dsl.rib("rib", dsl.profileRef("profile:rib"), 3, 16, "body:rib", ["rib-sketch"], {
          side: "symmetric",
          axis: dsl.axisSketchNormal(),
        }),
        openLineProfile("web-sketch", "profile:web", [0, -18], [0, 18]),
        dsl.web("web", dsl.profileRef("profile:web"), 2, 12, "body:web", ["web-sketch"], {
          side: "oneSided",
          axis: dsl.axisSketchNormal(),
        }),
      ]);

      const result = buildPart(part, backend);
      const rib = result.steps[1]?.result.outputs.get("body:rib");
      const web = result.final.outputs.get("body:web");
      assert.ok(rib, "missing rib output");
      assert.ok(web, "missing web output");

      const ribShape = rib.meta["shape"] as any;
      const webShape = web.meta["shape"] as any;
      assertValidShape(occt, ribShape, "rib");
      assertValidShape(occt, webShape, "web");
      assertPositiveVolume(occt, ribShape, "rib");
      assertPositiveVolume(occt, webShape, "web");
      assert.ok(countFaces(occt, ribShape) >= 4, "expected rib to create boundary faces");
      assert.ok(countFaces(occt, webShape) >= 4, "expected web to create boundary faces");
    },
  },
  {
    name: "occt parity probe: rib axis sketch normal resolves on datum-hosted sketch planes",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("rib-web-plane-normal-probe", [
        dsl.datumPlane("dp-x", "+X"),
        openLineProfile("rib-sketch", "profile:rib", [-8, 0], [8, 0], {
          plane: dsl.planeDatum("dp-x"),
          deps: ["dp-x"],
        }),
        dsl.rib("rib", dsl.profileRef("profile:rib"), 2, 10, "body:rib", ["rib-sketch"], {
          axis: dsl.axisSketchNormal(),
        }),
      ]);

      const result = buildPart(part, backend);
      const rib = result.final.outputs.get("body:rib");
      assert.ok(rib, "missing rib output");
      const ribShape = rib.meta["shape"] as any;
      assertValidShape(occt, ribShape, "rib datum normal");
      assertPositiveVolume(occt, ribShape, "rib datum normal");
    },
  },
  {
    name: "occt parity probe: rib outputs are deterministic across repeated runs",
    fn: async () => {
      const { backend, occt } = await getBackendContext();
      const part = dsl.part("rib-determinism-probe", [
        openLineProfile("rib-sketch", "profile:rib", [-14, 0], [14, 0]),
        dsl.rib("rib", dsl.profileRef("profile:rib"), 2.5, 14, "body:rib", ["rib-sketch"], {
          side: "symmetric",
        }),
      ]);

      const first = buildPart(part, backend);
      const second = buildPart(part, backend);
      const firstOut = first.final.outputs.get("body:rib");
      const secondOut = second.final.outputs.get("body:rib");
      assert.ok(firstOut, "missing first rib output");
      assert.ok(secondOut, "missing second rib output");
      const firstShape = firstOut.meta["shape"] as any;
      const secondShape = secondOut.meta["shape"] as any;
      assertValidShape(occt, firstShape, "first rib");
      assertValidShape(occt, secondShape, "second rib");
      assert.equal(countFaces(occt, firstShape), countFaces(occt, secondShape));
      assert.equal(countEdges(occt, firstShape), countEdges(occt, secondShape));
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
