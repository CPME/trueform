import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "dsl: context/document/part/params/expr helpers",
    fn: async () => {
      const ctx = dsl.context();
      assert.deepEqual(ctx, {
        units: "mm",
        kernel: { name: "opencascade.js", version: "unknown" },
        tolerance: { linear: 0.01, angular: 0.001 },
      });

      const ctxOverride = dsl.context({
        units: "in",
        kernel: { name: "occt", version: "7.7" },
        tolerance: { linear: 0.1, angular: 0.002 },
      });
      assert.equal(ctxOverride.units, "in");
      assert.equal(ctxOverride.kernel.name, "occt");
      assert.equal(ctxOverride.kernel.version, "7.7");
      assert.equal(ctxOverride.tolerance.linear, 0.1);
      assert.equal(ctxOverride.tolerance.angular, 0.002);

      const part = dsl.part("part-1", []);
      assert.equal(part.id, "part-1");
      assert.equal(part.features.length, 0);
      assert.equal("params" in part, false);
      assert.equal("constraints" in part, false);
      assert.equal("assertions" in part, false);

      const partWithOpts = dsl.part("part-2", [], {
        params: [dsl.paramLength("len", dsl.exprLiteral(5, "mm"))],
        constraints: ["c1"],
        assertions: ["a1"],
      });
      assert.equal(partWithOpts.params?.length, 1);
      assert.equal(partWithOpts.constraints?.length, 1);
      assert.equal(partWithOpts.assertions?.length, 1);

      const doc = dsl.document("doc-1", [part], undefined, undefined, {
        capabilities: { process: "milling" },
        constraints: ["c1"],
        assertions: ["a1"],
      });
      assert.equal(doc.id, "doc-1");
      assert.equal(doc.context.units, "mm");
      assert.equal("assemblies" in doc, false);
      assert.equal(doc.constraints?.length, 1);
      assert.equal(doc.assertions?.length, 1);

      const assembly = dsl.assembly("asm-1", []);
      const docWithCtx = dsl.document("doc-2", [part], ctxOverride, [assembly]);
      assert.equal(docWithCtx.context.units, "in");
      assert.equal(docWithCtx.assemblies?.length, 1);

      const paramLen = dsl.paramLength("len", dsl.exprLiteral(5, "mm"));
      assert.deepEqual(paramLen, {
        id: "len",
        type: "length",
        value: { kind: "expr.literal", value: 5, unit: "mm" },
      });
      const paramAng = dsl.paramAngle("ang", dsl.exprLiteral(90, "deg"));
      assert.equal(paramAng.type, "angle");
      const paramCount = dsl.paramCount("count", dsl.exprLiteral(3));
      assert.equal(paramCount.type, "count");

      const exprLiteralUnitless = dsl.exprLiteral(2);
      assert.deepEqual(exprLiteralUnitless, { kind: "expr.literal", value: 2 });
      const exprParam = dsl.exprParam("len");
      assert.deepEqual(exprParam, { kind: "expr.param", id: "len" });

      const exprAdd = dsl.exprAdd(exprParam, dsl.exprLiteral(1, "mm"));
      assert.deepEqual(exprAdd, {
        kind: "expr.binary",
        op: "+",
        left: { kind: "expr.param", id: "len" },
        right: { kind: "expr.literal", value: 1, unit: "mm" },
      });
      const exprSub = dsl.exprSub(exprParam, dsl.exprLiteral(1, "mm"));
      assert.equal(exprSub.kind, "expr.binary");
      if (exprSub.kind !== "expr.binary") throw new Error("Expected binary expr");
      assert.equal(exprSub.op, "-");
      const exprMul = dsl.exprMul(exprParam, dsl.exprLiteral(2));
      assert.equal(exprMul.kind, "expr.binary");
      if (exprMul.kind !== "expr.binary") throw new Error("Expected binary expr");
      assert.equal(exprMul.op, "*");
      const exprDiv = dsl.exprDiv(exprParam, dsl.exprLiteral(2));
      assert.equal(exprDiv.kind, "expr.binary");
      if (exprDiv.kind !== "expr.binary") throw new Error("Expected binary expr");
      assert.equal(exprDiv.op, "/");
      const exprNeg = dsl.exprNeg(exprParam);
      assert.deepEqual(exprNeg, { kind: "expr.neg", value: exprParam });
    },
  },
  {
    name: "dsl: assembly helpers",
    fn: async () => {
      const transform = dsl.transform({
        translation: [1, 2, 3],
        rotation: [0, 0, 90],
      });
      assert.deepEqual(transform.translation, [1, 2, 3]);
      assert.deepEqual(transform.rotation, [0, 0, 90]);

      const instance = dsl.assemblyInstance("inst-1", "part-1", transform, [
        "tag-1",
      ]);
      assert.equal(instance.part, "part-1");
      assert.equal(instance.tags?.length, 1);

      const selector = dsl.selectorNamed("body:main");
      const ref = dsl.assemblyRef("inst-1", selector);
      assert.deepEqual(ref, { instance: "inst-1", selector });

      const mateFixed = dsl.mateFixed(ref, ref);
      assert.equal(mateFixed.kind, "mate.fixed");
      const mateCoaxial = dsl.mateCoaxial(ref, ref);
      assert.equal(mateCoaxial.kind, "mate.coaxial");
      const matePlanar = dsl.matePlanar(ref, ref, 2);
      assert.equal(matePlanar.kind, "mate.planar");
      assert.equal(matePlanar.offset, 2);

      const output = dsl.assemblyOutput("out-1", [ref]);
      assert.equal(output.refs.length, 1);

      const assembly = dsl.assembly("asm-1", [instance], {
        mates: [mateFixed, mateCoaxial, matePlanar],
        outputs: [output],
      });
      assert.equal(assembly.instances.length, 1);
      assert.equal(assembly.mates?.length, 3);
      assert.equal(assembly.outputs?.length, 1);
    },
  },
  {
    name: "dsl: datum + feature helpers",
    fn: async () => {
      const selectorFace = dsl.selectorFace([dsl.predPlanar()]);
      const selectorEdge = dsl.selectorEdge([dsl.predRole("edge")]);

      const datumPlane = dsl.datumPlane("datum-plane", "+Z");
      assert.equal(datumPlane.kind, "datum.plane");
      assert.equal(datumPlane.normal, "+Z");
      assert.equal("origin" in datumPlane, false);

      const datumAxis = dsl.datumAxis("datum-axis", "+X", [0, 0, 0], [
        "dep-1",
      ]);
      assert.equal(datumAxis.kind, "datum.axis");
      assert.equal(datumAxis.direction, "+X");
      assert.equal(datumAxis.deps?.length, 1);

      const datumFrame = dsl.datumFrame("datum-frame", selectorFace, ["dep-2"]);
      assert.equal(datumFrame.kind, "datum.frame");
      assert.equal(datumFrame.deps?.length, 1);

      const extrude = dsl.extrude("extrude-1", dsl.profileRect(2, 3), 5);
      assert.equal(extrude.kind, "feature.extrude");
      assert.equal(extrude.result, "body:extrude-1");
      assert.equal("deps" in extrude, false);

      const revolve = dsl.revolve(
        "revolve-1",
        dsl.profileCircle(2),
        "+Z",
        "full"
      );
      assert.equal(revolve.kind, "feature.revolve");
      assert.equal(revolve.result, "body:revolve-1");

      const hole = dsl.hole("hole-1", selectorFace, "+Z", 5, "throughAll");
      assert.equal(hole.kind, "feature.hole");
      assert.equal(hole.depth, "throughAll");
      assert.equal("pattern" in hole, false);

      const fillet = dsl.fillet("fillet-1", selectorEdge, 1);
      assert.equal(fillet.kind, "feature.fillet");

      const chamfer = dsl.chamfer("chamfer-1", selectorEdge, 2);
      assert.equal(chamfer.kind, "feature.chamfer");

      const booleanOp = dsl.booleanOp(
        "bool-1",
        "union",
        dsl.selectorNamed("body:left"),
        dsl.selectorNamed("body:right")
      );
      assert.equal(booleanOp.kind, "feature.boolean");
      assert.equal(booleanOp.result, "body:bool-1");

      const patternLinear = dsl.patternLinear(
        "pattern-l",
        dsl.selectorNamed("body:main"),
        [1, 2],
        [3, 4]
      );
      assert.equal(patternLinear.kind, "pattern.linear");

      const patternCircular = dsl.patternCircular(
        "pattern-c",
        dsl.selectorNamed("body:main"),
        "+Z",
        6
      );
      assert.equal(patternCircular.kind, "pattern.circular");
    },
  },
  {
    name: "dsl: sketch helpers + profiles",
    fn: async () => {
      const plane = dsl.selectorFace([dsl.predNormal("+Z")]);
      const profile = dsl.profileRect(10, 5, [0, 0, 0]);
      assert.equal(profile.kind, "profile.rectangle");

      const sketch = dsl.sketch2d(
        "sketch-1",
        [{ name: "profile:base", profile }],
        { plane, origin: [0, 0, 0], deps: ["datum-1"], entities: [] }
      );
      assert.equal(sketch.kind, "feature.sketch2d");
      assert.equal(sketch.profiles.length, 1);
      assert.equal(sketch.deps?.length, 1);

      const line = dsl.sketchLine("line-1", [0, 0], [1, 1]);
      assert.equal(line.kind, "sketch.line");

      const arc = dsl.sketchArc("arc-1", [0, 0], [1, 0], [0, 1], "cw");
      assert.equal(arc.kind, "sketch.arc");

      const circle = dsl.sketchCircle("circle-1", [0, 0], 2);
      assert.equal(circle.kind, "sketch.circle");

      const ellipse = dsl.sketchEllipse("ellipse-1", [0, 0], 2, 1, {
        rotation: 0,
      });
      assert.equal(ellipse.kind, "sketch.ellipse");

      const rectCenter = dsl.sketchRectCenter("rect-center", [0, 0], 2, 1);
      assert.equal(rectCenter.kind, "sketch.rectangle");
      assert.equal(rectCenter.mode, "center");

      const rectCorner = dsl.sketchRectCorner("rect-corner", [0, 0], 2, 1);
      assert.equal(rectCorner.kind, "sketch.rectangle");
      assert.equal(rectCorner.mode, "corner");

      const slot = dsl.sketchSlot("slot-1", [0, 0], 10, 2, {
        endStyle: "arc",
      });
      assert.equal(slot.kind, "sketch.slot");

      const polygon = dsl.sketchPolygon("poly-1", [0, 0], 5, 6, {
        rotation: 0,
      });
      assert.equal(polygon.kind, "sketch.polygon");

      const spline = dsl.sketchSpline("spline-1", [[0, 0], [1, 1]], {
        closed: true,
        degree: 3,
      });
      assert.equal(spline.kind, "sketch.spline");

      const point = dsl.sketchPoint("point-1", [1, 2]);
      assert.equal(point.kind, "sketch.point");

      const circleProfile = dsl.profileCircle(4, [0, 0, 0]);
      assert.equal(circleProfile.kind, "profile.circle");

      const profileRef = dsl.profileRef("profile:base");
      assert.deepEqual(profileRef, { kind: "profile.ref", name: "profile:base" });
    },
  },
  {
    name: "dsl: selector/predicate/rank helpers",
    fn: async () => {
      const predNormal = dsl.predNormal("+Z");
      assert.deepEqual(predNormal, { kind: "pred.normal", value: "+Z" });
      const predPlanar = dsl.predPlanar();
      assert.deepEqual(predPlanar, { kind: "pred.planar" });
      const predCreatedBy = dsl.predCreatedBy("feat-1");
      assert.deepEqual(predCreatedBy, { kind: "pred.createdBy", featureId: "feat-1" });
      const predRole = dsl.predRole("edge");
      assert.deepEqual(predRole, { kind: "pred.role", value: "edge" });

      const rankMaxArea = dsl.rankMaxArea();
      assert.deepEqual(rankMaxArea, { kind: "rank.maxArea" });
      const rankMinZ = dsl.rankMinZ();
      assert.deepEqual(rankMinZ, { kind: "rank.minZ" });
      const rankMaxZ = dsl.rankMaxZ();
      assert.deepEqual(rankMaxZ, { kind: "rank.maxZ" });

      const target = dsl.selectorFace([predPlanar]);
      const rankClosest = dsl.rankClosestTo(target);
      assert.deepEqual(rankClosest, { kind: "rank.closestTo", target });

      const selectorFace = dsl.selectorFace([predPlanar]);
      assert.equal(selectorFace.kind, "selector.face");
      assert.deepEqual(selectorFace.rank, []);

      const selectorEdge = dsl.selectorEdge([predRole], [rankMaxArea]);
      assert.equal(selectorEdge.kind, "selector.edge");
      assert.equal(selectorEdge.rank.length, 1);

      const selectorSolid = dsl.selectorSolid([predCreatedBy], [rankMinZ]);
      assert.equal(selectorSolid.kind, "selector.solid");
      assert.equal(selectorSolid.rank.length, 1);

      const selectorNamed = dsl.selectorNamed("body:main");
      assert.deepEqual(selectorNamed, { kind: "selector.named", name: "body:main" });
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
