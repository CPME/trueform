import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  assertPositiveVolume,
  assertValidShape,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: linear pattern applies to holes",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("plate"), dsl.predNormal("+Z")],
        [dsl.rankMaxZ()]
      );
      const part = dsl.part("pattern-linear", [
        dsl.extrude("plate", dsl.profileRect(80, 40), 8, "body:main"),
        dsl.patternLinear("pattern-l", topFace, [20, 0], [2, 1]),
        dsl.hole("hole-l", topFace, "+Z", 6, "throughAll", {
          pattern: { kind: "pattern.linear", ref: "pattern-l" },
          position: [10, 0],
        }),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "linear pattern solid");
      assertPositiveVolume(occt, shape, "linear pattern solid");
    },
  },
  {
    name: "occt e2e: circular pattern applies to holes",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("plate"), dsl.predNormal("+Z")],
        [dsl.rankMaxZ()]
      );
      const part = dsl.part("pattern-circular", [
        dsl.extrude("plate", dsl.profileRect(90, 90), 10, "body:main"),
        dsl.patternCircular("pattern-c", topFace, "+Z", 6),
        dsl.hole("hole-c", topFace, "+Z", 6, "throughAll", {
          pattern: { kind: "pattern.circular", ref: "pattern-c" },
          position: [25, 0],
        }),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "circular pattern solid");
      assertPositiveVolume(occt, shape, "circular pattern solid");
    },
  },
  {
    name: "occt e2e: linear pattern replicates source solids",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const topFace = dsl.selectorFace(
        [dsl.predCreatedBy("seed"), dsl.predNormal("+Z")],
        [dsl.rankMaxZ()]
      );
      const part = dsl.part("pattern-linear-feature", [
        dsl.extrude("seed", dsl.profileRect(8, 8), 6, "body:seed"),
        dsl.patternLinear("pattern-f", topFace, [14, 0], [3, 1], {
          source: dsl.selectorNamed("body:seed"),
          result: "body:main",
          deps: ["seed"],
        }),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "linear feature pattern solid");
      assertPositiveVolume(occt, shape, "linear feature pattern solid");
    },
  },
  {
    name: "occt e2e: circular pattern replicates source solids",
    fn: async () => {
      const { occt, backend } = await getBackendContext();
      const anchorTopFace = dsl.selectorFace(
        [dsl.predCreatedBy("anchor"), dsl.predNormal("+Z")],
        [dsl.rankMaxZ()]
      );
      const part = dsl.part("pattern-circular-feature", [
        dsl.extrude("anchor", dsl.profileRect(6, 6), 2, "body:anchor"),
        dsl.extrude("seed", dsl.profileRect(6, 6, [18, 0, 0]), 6, "body:seed"),
        dsl.patternCircular("pattern-fc", anchorTopFace, "+Z", 4, {
          source: dsl.selectorNamed("body:seed"),
          result: "body:main",
          deps: ["anchor", "seed"],
        }),
      ]);

      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      const shape = body.meta["shape"] as any;
      assert.ok(shape, "missing shape metadata");
      assertValidShape(occt, shape, "circular feature pattern solid");
      assertPositiveVolume(occt, shape, "circular feature pattern solid");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
