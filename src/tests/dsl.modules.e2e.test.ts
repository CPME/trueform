import assert from "node:assert/strict";
import * as core from "../dsl/core.js";
import * as assembly from "../dsl/assembly.js";
import * as geometry from "../dsl/geometry.js";
import * as booleans from "../dsl/booleans.js";
import * as features from "../dsl/features.js";
import * as selectors from "../dsl/selectors.js";
import * as sketch from "../dsl/sketch.js";
import * as tolerancing from "../dsl/tolerancing.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl modules: intent-focused helper modules",
    fn: async () => {
      const transform = assembly.transform({
        translation: [1, 2, 3],
        rotation: [0, 0, 90],
      });
      assert.equal(transform.matrix?.length, 16);
      assert.equal(transform.matrix?.[12], 1);

      const instance = assembly.instance("inst-1", "part-1", transform);
      assert.equal(instance.part, "part-1");

      const ref = assembly.ref("inst-1", "conn-1");
      assert.deepEqual(ref, { instance: "inst-1", connector: "conn-1" });

      const mateFixed = assembly.mateFixed(ref, ref);
      assert.equal(mateFixed.kind, "mate.fixed");
      const mateDistance = assembly.mateDistance(ref, ref, 4);
      assert.equal(mateDistance.kind, "mate.distance");
      const mateAngle = assembly.mateAngle(ref, ref, 15);
      assert.equal(mateAngle.kind, "mate.angle");
      const mateParallel = assembly.mateParallel(ref, ref);
      assert.equal(mateParallel.kind, "mate.parallel");
      const matePerpendicular = assembly.matePerpendicular(ref, ref);
      assert.equal(matePerpendicular.kind, "mate.perpendicular");
      const mateInsert = assembly.mateInsert(ref, ref, 2);
      assert.equal(mateInsert.kind, "mate.insert");
      const mateSlider = assembly.mateSlider(ref, ref);
      assert.equal(mateSlider.kind, "mate.slider");
      const mateHinge = assembly.mateHinge(ref, ref, 1);
      assert.equal(mateHinge.kind, "mate.hinge");

      const output = assembly.output("out-1", [ref]);
      assert.equal(output.refs.length, 1);

      const asm = assembly.assembly("asm-1", [instance], {
        mates: [
          mateFixed,
          mateDistance,
          mateAngle,
          mateParallel,
          matePerpendicular,
          mateInsert,
          mateSlider,
          mateHinge,
        ],
        outputs: [output],
      });
      assert.equal(asm.outputs?.length, 1);

      const selectorFace = selectors.selectorFace([selectors.predPlanar()]);
      const connector = assembly.connector("conn-1", selectorFace, {
        normal: "+Z",
      });
      assert.equal(connector.normal, "+Z");

      const surface = tolerancing.refSurface(selectorFace);
      const constraint = tolerancing.surfaceProfileConstraint(
        "c-1",
        surface,
        0.02
      );
      assert.equal(constraint.kind, "constraint.surfaceProfile");
      const dim = tolerancing.dimensionDistance("d-1", surface, surface, {
        nominal: 12,
        tolerance: 0.1,
      });
      assert.equal(dim.kind, "dimension.distance");

      const part = core.part("part-1", []);
      const doc = core.document("doc-1", [part], core.context(), [asm]);
      assert.equal(doc.assemblies?.length, 1);

      const profile = sketch.profileRect(2, 3);
      const extrude = features.extrude("extrude-1", profile, 5);
      assert.equal(extrude.kind, "feature.extrude");
      const plane = features.plane("plane-1", 20, 10);
      assert.equal(plane.kind, "feature.plane");
      const patternLinear = features.patternLinear(
        "p-l",
        selectors.selectorNamed("body:seed"),
        [10, 0],
        [3, 1]
      );
      assert.equal(patternLinear.kind, "pattern.linear");
      const patternCircular = features.patternCircular(
        "p-c",
        selectors.selectorNamed("body:seed"),
        "+Z",
        4
      );
      assert.equal(patternCircular.kind, "pattern.circular");

      const left = selectors.selectorNamed("body:left");
      const right = selectors.selectorNamed("body:right");
      const cut = features.cut("cut-1", left, right);
      const union = booleans.union("union-1", left, right);
      const intersect = booleans.intersect("intersect-1", left, right);
      assert.equal(cut.op, "subtract");
      assert.equal(union.op, "union");
      assert.equal(intersect.op, "intersect");

      const extrudeLegacy = geometry.extrude(
        "extrude-legacy",
        geometry.profileRect(2, 3),
        5
      );
      assert.equal(extrudeLegacy.kind, "feature.extrude");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
