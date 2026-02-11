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

      const constraint = dsl.surfaceProfileConstraint(
        "c1",
        dsl.refSurface(dsl.selectorFace([dsl.predPlanar()])),
        0.1
      );

      const assertion = dsl.assertBrepValid("a1");
      const partWithOpts = dsl.part("part-2", [], {
        params: [dsl.paramLength("len", dsl.exprLiteral(5, "mm"))],
        constraints: [constraint],
        assertions: [assertion],
      });
      assert.equal(partWithOpts.params?.length, 1);
      assert.equal(partWithOpts.constraints?.length, 1);
      assert.equal(partWithOpts.assertions?.length, 1);

      const doc = dsl.document("doc-1", [part], undefined, undefined, {
        capabilities: { process: "milling" },
        constraints: [constraint],
        assertions: [assertion],
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
      assert.equal(transform.matrix?.length, 16);
      assert.equal(transform.matrix?.[12], 1);
      assert.equal(transform.matrix?.[13], 2);
      assert.equal(transform.matrix?.[14], 3);

      const instance = dsl.assemblyInstance("inst-1", "part-1", transform, [
        "tag-1",
      ]);
      assert.equal(instance.part, "part-1");
      assert.equal(instance.tags?.length, 1);

      const ref = dsl.assemblyRef("inst-1", "conn-1");
      assert.deepEqual(ref, { instance: "inst-1", connector: "conn-1" });

      const mateFixed = dsl.mateFixed(ref, ref);
      assert.equal(mateFixed.kind, "mate.fixed");
      const mateCoaxial = dsl.mateCoaxial(ref, ref);
      assert.equal(mateCoaxial.kind, "mate.coaxial");
      const matePlanar = dsl.matePlanar(ref, ref, 2);
      assert.equal(matePlanar.kind, "mate.planar");
      assert.equal(matePlanar.offset, 2);
      const mateDistance = dsl.mateDistance(ref, ref, 5);
      assert.equal(mateDistance.kind, "mate.distance");
      assert.equal(mateDistance.distance, 5);
      const mateAngle = dsl.mateAngle(ref, ref, 45);
      assert.equal(mateAngle.kind, "mate.angle");
      assert.equal(mateAngle.angle, 45);
      const mateParallel = dsl.mateParallel(ref, ref);
      assert.equal(mateParallel.kind, "mate.parallel");
      const matePerpendicular = dsl.matePerpendicular(ref, ref);
      assert.equal(matePerpendicular.kind, "mate.perpendicular");
      const mateInsert = dsl.mateInsert(ref, ref, 1.5);
      assert.equal(mateInsert.kind, "mate.insert");
      assert.equal(mateInsert.offset, 1.5);
      const mateSlider = dsl.mateSlider(ref, ref);
      assert.equal(mateSlider.kind, "mate.slider");
      const mateHinge = dsl.mateHinge(ref, ref, 0.25);
      assert.equal(mateHinge.kind, "mate.hinge");
      assert.equal(mateHinge.offset, 0.25);

      const output = dsl.assemblyOutput("out-1", [ref]);
      assert.equal(output.refs.length, 1);

      const assembly = dsl.assembly("asm-1", [instance], {
        mates: [
          mateFixed,
          mateCoaxial,
          matePlanar,
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
      assert.equal(assembly.instances.length, 1);
      assert.equal(assembly.mates?.length, 10);
      assert.equal(assembly.outputs?.length, 1);
    },
  },
  {
    name: "dsl: datum + feature helpers",
    fn: async () => {
      const selectorFace = dsl.selectorFace([dsl.predPlanar()]);
      const selectorEdge = dsl.selectorEdge([dsl.predRole("edge")]);

      const connector = dsl.mateConnector("conn-1", selectorFace, {
        normal: "+Z",
        xAxis: "+X",
      });
      assert.equal(connector.id, "conn-1");
      assert.equal(connector.normal, "+Z");

      const datumPlane = dsl.datumPlane("datum-plane", "+Z");
      assert.equal(datumPlane.kind, "datum.plane");
      assert.equal(datumPlane.normal, "+Z");
      assert.equal("origin" in datumPlane, false);

      const axisVec = dsl.axisVector([0, 1, 0]);
      assert.equal((axisVec as { kind: string }).kind, "axis.vector");
      const axisDatum = dsl.axisDatum("datum-axis");
      assert.equal((axisDatum as { kind: string }).kind, "axis.datum");
      const axisSketch = dsl.axisSketchNormal();
      assert.equal((axisSketch as { kind: string }).kind, "axis.sketch.normal");
      const planeDatum = dsl.planeDatum("datum-plane");
      assert.equal((planeDatum as { kind: string }).kind, "plane.datum");

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
      const surface = dsl.surface("surface-1", dsl.profileRect(2, 3));
      assert.equal(surface.kind, "feature.surface");
      assert.equal(surface.result, "surface:surface-1");
      const extrudeSurface = dsl.extrude(
        "extrude-surface",
        dsl.profileRect(2, 3),
        5,
        undefined,
        undefined,
        { mode: "surface" }
      );
      assert.equal(extrudeSurface.mode, "surface");
      assert.equal(extrudeSurface.result, "surface:extrude-surface");
      const tagged = dsl.withTags(extrude, ["base-feature"]);
      assert.deepEqual(tagged.tags, ["base-feature"]);

      const revolve = dsl.revolve(
        "revolve-1",
        dsl.profileCircle(2),
        "+Z",
        "full"
      );
      assert.equal(revolve.kind, "feature.revolve");
      assert.equal(revolve.result, "body:revolve-1");
      const revolveSurface = dsl.revolve(
        "revolve-surface",
        dsl.profileCircle(2),
        "+Z",
        "full",
        undefined,
        { mode: "surface" }
      );
      assert.equal(revolveSurface.mode, "surface");
      assert.equal(revolveSurface.result, "surface:revolve-surface");

      const loftSurface = dsl.loft(
        "loft-surface",
        [dsl.profileCircle(2), dsl.profileCircle(3, [0, 0, 5])],
        undefined,
        undefined,
        { mode: "surface" }
      );
      assert.equal(loftSurface.mode, "surface");
      assert.equal(loftSurface.result, "surface:loft-surface");

      const sweep = dsl.sweep(
        "sweep-1",
        dsl.profileRect(2, 3),
        dsl.pathPolyline([
          [0, 0, 0],
          [0, 0, 5],
          [5, 0, 10],
        ])
      );
      assert.equal(sweep.kind, "feature.sweep");
      assert.equal(sweep.result, "body:sweep-1");
      const sweepSurface = dsl.sweep(
        "sweep-surface",
        dsl.profileRect(2, 3),
        dsl.pathPolyline([
          [0, 0, 0],
          [0, 0, 5],
          [5, 0, 10],
        ]),
        undefined,
        undefined,
        { mode: "surface" }
      );
      assert.equal(sweepSurface.mode, "surface");
      assert.equal(sweepSurface.result, "surface:sweep-surface");
      const sweepFrenet = dsl.sweep(
        "sweep-frenet",
        dsl.profileRect(2, 3),
        dsl.pathPolyline([
          [0, 0, 0],
          [0, 0, 5],
          [5, 0, 10],
        ]),
        undefined,
        undefined,
        { orientation: "frenet" }
      );
      assert.equal(sweepFrenet.orientation, "frenet");
      const sweepFrame = dsl.sweep(
        "sweep-frame",
        dsl.profileRect(2, 3),
        dsl.pathPolyline([
          [0, 0, 0],
          [0, 0, 5],
          [5, 0, 10],
        ]),
        undefined,
        undefined,
        { frame: planeDatum }
      );
      assert.equal((sweepFrame.frame as { kind: string }).kind, "plane.datum");

      const mirror = dsl.mirror(
        "mirror-1",
        selectorFace,
        planeDatum
      );
      assert.equal(mirror.kind, "feature.mirror");

      const thicken = dsl.thicken("thicken-1", selectorFace, 2);
      assert.equal(thicken.kind, "feature.thicken");

      const shell = dsl.shell("shell-1", dsl.selectorNamed("body:base"), 2);
      assert.equal(shell.kind, "feature.shell");

      const thread = dsl.thread("thread-1", "+Z", 10, 6, 1.5);
      assert.equal(thread.kind, "feature.thread");

      const polyProfile = dsl.profilePoly(6, 4);
      assert.equal(polyProfile.kind, "profile.poly");

      const loft = dsl.loft("loft-1", [dsl.profileCircle(2), polyProfile]);
      assert.equal(loft.kind, "feature.loft");
      assert.equal(loft.result, "body:loft-1");

      const hole = dsl.hole("hole-1", selectorFace, "+Z", 5, "throughAll");
      assert.equal(hole.kind, "feature.hole");
      assert.equal(hole.depth, "throughAll");
      assert.equal("pattern" in hole, false);

      const holePatterned = dsl.hole("hole-2", selectorFace, "+Z", 5, 10, {
        pattern: { kind: "pattern.linear", ref: "pattern-l" },
        position: [2, 3],
      });
      assert.equal(holePatterned.kind, "feature.hole");
      assert.deepEqual(holePatterned.position, [2, 3]);

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

      const pipe = dsl.pipe("pipe-1", "+Z", 100, 40, 30);
      assert.equal(pipe.kind, "feature.pipe");
      assert.equal(pipe.axis, "+Z");
      assert.equal(pipe.result, "body:pipe-1");

      const pathSeg = dsl.pathLine([0, 0, 0], [10, 0, 0]);
      const path = dsl.pathSegments([pathSeg]);
      const poly = dsl.pathPolyline([
        [0, 0, 0],
        [5, 0, 0],
      ]);
      const spline = dsl.pathSpline([
        [0, 0, 0],
        [5, 2, 0],
        [10, 0, 0],
      ]);
      assert.equal(poly.kind, "path.polyline");
      assert.equal(spline.kind, "path.spline");
      const pipeSweep = dsl.pipeSweep("pipe-sweep-1", path, 40, 30);
      assert.equal(pipeSweep.kind, "feature.pipeSweep");
      assert.equal(pipeSweep.result, "body:pipe-sweep-1");
      const hexSweep = dsl.hexTubeSweep("hex-sweep-1", path, 40, 30);
      assert.equal(hexSweep.kind, "feature.hexTubeSweep");
      assert.equal(hexSweep.result, "body:hex-sweep-1");

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
    name: "dsl: generator helpers",
    fn: async () => {
      const cubes = dsl.featureArray(
        { count: [2, 2], spacing: [10, 20], origin: [1, 2, 3] },
        ({ index, offset }) =>
          dsl.extrude(
            `cube-${index}`,
            dsl.profileRect(4, 4, offset),
            6,
            `body:cube-${index}`
          )
      );
      assert.equal(cubes.length, 4);
      const first = cubes[0];
      if (!first || first.kind !== "feature.extrude") {
        throw new Error("Expected extrude on first cube");
      }
      const firstProfile = first.profile;
      if (firstProfile.kind !== "profile.rectangle") {
        throw new Error("Expected rectangle profile on first cube");
      }
      assert.deepEqual(firstProfile.center, [1, 2, 3]);
      const last = cubes[cubes.length - 1];
      if (!last || last.kind !== "feature.extrude") {
        throw new Error("Expected extrude on last cube");
      }
      const lastProfile = last.profile;
      if (lastProfile.kind !== "profile.rectangle") {
        throw new Error("Expected rectangle profile on last cube");
      }
      assert.deepEqual(lastProfile.center, [11, 22, 3]);

      const rects = dsl.sketchArray(
        { count: [3, 1], spacing: [5, 0], origin: [-5, 0] },
        ({ index, offset }) =>
          dsl.sketchRectCenter(`rect-${index}`, offset, 2, 1)
      );
      assert.equal(rects.length, 3);
      const middle = rects[1];
      if (!middle) {
        throw new Error("Expected middle rectangle in sketch array");
      }
      if (middle.kind !== "sketch.rectangle" || middle.mode !== "center") {
        throw new Error("Expected center rectangle in sketch array");
      }
      assert.deepEqual(middle.center, [0, 0]);

      const circlePoints = dsl.sketchCircularArray(
        { count: 4, radius: 10, units: "deg" },
        ({ index, offset }) => dsl.sketchPoint(`p-${index}`, offset)
      );
      assert.equal(circlePoints.length, 4);
      const p0 = circlePoints[0];
      if (!p0 || p0.kind !== "sketch.point") {
        throw new Error("Expected sketch point in circular array");
      }
      assert.deepEqual(p0.point, [10, 0]);
      const p2 = circlePoints[2];
      if (!p2 || p2.kind !== "sketch.point") {
        throw new Error("Expected sketch point in circular array");
      }
      const p2x = p2.point[0];
      const p2y = p2.point[1];
      if (typeof p2x !== "number" || typeof p2y !== "number") {
        throw new Error("Expected numeric sketch point in circular array");
      }
      assert.equal(p2x, -10);
      assert.ok(Math.abs(p2y) < 1e-9);

      const radialPoints = dsl.sketchRadialArray(
        { count: [4, 2], radiusStep: 5, radiusStart: 5, angleStep: 90, units: "deg" },
        ({ index, offset }) => dsl.sketchPoint(`r-${index}`, offset)
      );
      assert.equal(radialPoints.length, 8);
      const r0 = radialPoints[0];
      if (!r0 || r0.kind !== "sketch.point") {
        throw new Error("Expected sketch point in radial array");
      }
      assert.deepEqual(r0.point, [5, 0]);
      const r7 = radialPoints[7];
      if (!r7 || r7.kind !== "sketch.point") {
        throw new Error("Expected sketch point in radial array");
      }
      const r7x = r7.point[0];
      const r7y = r7.point[1];
      if (typeof r7x !== "number" || typeof r7y !== "number") {
        throw new Error("Expected numeric sketch point in radial array");
      }
      assert.ok(Math.abs(r7x) < 1e-9);
      assert.equal(r7y, -10);

      const splinePoints = dsl.sketchArrayAlongSpline(
        { points: [[0, 0], [10, 0], [20, 0]], count: 3, mode: "polyline" },
        ({ index, offset }) => dsl.sketchPoint(`s-${index}`, offset)
      );
      assert.equal(splinePoints.length, 3);
      const s1 = splinePoints[1];
      if (!s1 || s1.kind !== "sketch.point") {
        throw new Error("Expected sketch point in spline array");
      }
      assert.deepEqual(s1.point, [10, 0]);
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

      const bundle = dsl.sketchProfileLoop(
        "sketch-loop",
        "profile:loop",
        ["line-a", "line-b"],
        [dsl.sketchLine("line-a", [0, 0], [1, 0]), dsl.sketchLine("line-b", [1, 0], [0, 0])]
      );
      assert.equal(bundle.sketch.kind, "feature.sketch2d");
      assert.equal(bundle.sketch.profiles[0]?.profile.kind, "profile.sketch");
      assert.equal(bundle.profile.kind, "profile.ref");
      assert.equal(bundle.profile.name, "profile:loop");

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
