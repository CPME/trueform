import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl: tolerancing helpers",
    fn: async () => {
      const selector = dsl.selectorFace([dsl.predPlanar()]);
      const surface = dsl.refSurface(selector);
      const frame = dsl.refFrame(dsl.selectorFace([dsl.predNormal("+Z")]));
      const axis = dsl.refAxis(dsl.selectorFace([dsl.predCreatedBy("hole-1")]));
      const edge = dsl.refEdge(dsl.selectorEdge([dsl.predRole("edge")]));
      const point = dsl.refPoint(dsl.selectorNamed("body:main"));

      assert.equal(surface.kind, "ref.surface");
      assert.equal(frame.kind, "ref.frame");
      assert.equal(axis.kind, "ref.axis");
      assert.equal(edge.kind, "ref.edge");
      assert.equal(point.kind, "ref.point");

      const datum = dsl.datumFeature("datum-A", "A", surface, {
        modifiers: ["MMB"],
      });
      const datumRef = dsl.datumRef("datum-A", ["MMB"]);

      const constraint = dsl.surfaceProfileConstraint("c-1", surface, 0.05, {
        referenceFrame: frame,
        capabilities: ["cap-1"],
        requirement: "req-1",
      });

      assert.equal(constraint.kind, "constraint.surfaceProfile");
      assert.equal(constraint.id, "c-1");
      assert.equal(constraint.tolerance, 0.05);
      assert.equal(constraint.referenceFrame?.kind, "ref.frame");
      assert.deepEqual(constraint.capabilities, ["cap-1"]);
      assert.equal(constraint.requirement, "req-1");

      assert.equal(datum.kind, "datum.feature");
      assert.equal(datum.label, "A");
      assert.equal(datumRef.kind, "datum.ref");

      const flat = dsl.flatnessConstraint("flat-1", surface, 0.02);
      const parallel = dsl.parallelismConstraint(
        "par-1",
        surface,
        0.05,
        [datumRef]
      );
      const perp = dsl.perpendicularityConstraint(
        "perp-1",
        surface,
        0.08,
        [datumRef]
      );
      const pos = dsl.positionConstraint(
        "pos-1",
        axis,
        0.2,
        [datumRef],
        { zone: "diameter", modifiers: ["MMC"] }
      );
      const size = dsl.sizeConstraint("size-1", axis, {
        nominal: 10,
        tolerance: 0.1,
      });

      assert.equal(flat.kind, "constraint.flatness");
      assert.equal(parallel.kind, "constraint.parallelism");
      assert.equal(perp.kind, "constraint.perpendicularity");
      assert.equal(pos.kind, "constraint.position");
      assert.equal(size.kind, "constraint.size");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
