import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertValidShape,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: mirror creates a solid across a datum plane",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const base = dsl.extrude("base", dsl.profileRect(20, 10), 4, "body:base");
      const plane = dsl.datumPlane("mirror-plane", "+X");
      const mirror = dsl.mirror(
        "mirror-1",
        dsl.selectorNamed("body:base"),
        dsl.planeDatum("mirror-plane"),
        "body:mirror"
      );
      const part = dsl.part("mirror-test", [base, plane, mirror]);

      const result = buildPart(part, backend);
      const output = result.final.outputs.get("body:mirror");
      assert.ok(output, "missing mirror output");
      assert.equal(output.kind, "solid");
      const shape = output.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "mirror shape");
      assert.ok(countSolids(occt, shape) >= 1, "expected mirrored solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
