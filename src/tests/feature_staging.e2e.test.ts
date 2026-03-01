import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import {
  TF_STAGED_FEATURES,
  featureStageKey,
  getFeatureStage,
  listStagedFeatureKeys,
} from "../feature_staging.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "feature staging: registry includes rib/web, surfacing slice 1, curve intersect, and remaining surface-mode staging entries",
    fn: async () => {
      const keys = listStagedFeatureKeys();
      assert.ok(keys.includes("feature.rib"));
      assert.ok(keys.includes("feature.web"));
      assert.ok(keys.includes("feature.trim.surface"));
      assert.ok(keys.includes("feature.extend.surface"));
      assert.ok(keys.includes("feature.knit"));
      assert.ok(keys.includes("feature.curve.intersect"));
      assert.ok(!keys.includes("feature.surface"));
      assert.ok(!keys.includes("feature.revolve:mode.surface"));
      assert.ok(keys.includes("feature.extrude:mode.surface"));
      assert.ok(keys.includes("feature.loft:mode.surface"));
      assert.ok(keys.includes("feature.sweep:mode.surface"));
      assert.ok(keys.includes("feature.pipeSweep:mode.surface"));
      assert.ok(keys.includes("feature.hexTubeSweep:mode.surface"));
      assert.equal(TF_STAGED_FEATURES["feature.surface"]?.stage, undefined);
      assert.equal(TF_STAGED_FEATURES["feature.revolve:mode.surface"]?.stage, undefined);
    },
  },
  {
    name: "feature staging: rib resolves to staging entry",
    fn: async () => {
      const feature = dsl.rib("rib-1", dsl.profileRef("profile:rib"), 2, 8);
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.rib");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: web resolves to staging entry",
    fn: async () => {
      const feature = dsl.web("web-1", dsl.profileRef("profile:web"), 2, 8);
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.web");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: trim surface resolves to staging entry",
    fn: async () => {
      const feature = dsl.trimSurface(
        "trim-1",
        dsl.selectorNamed("surface:seed"),
        [dsl.selectorNamed("body:tool")]
      );
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.trim.surface");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: extend surface resolves to staging entry",
    fn: async () => {
      const feature = dsl.extendSurface(
        "extend-1",
        dsl.selectorNamed("surface:seed"),
        dsl.selectorEdge([dsl.predCreatedBy("seed")]),
        2
      );
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.extend.surface");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: knit resolves to staging entry",
    fn: async () => {
      const feature = dsl.knit("knit-1", [dsl.selectorNamed("surface:a"), dsl.selectorNamed("surface:b")]);
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.knit");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: curve intersect resolves to staging entry",
    fn: async () => {
      const feature = dsl.curveIntersect(
        "curve-1",
        dsl.selectorNamed("surface:a"),
        dsl.selectorNamed("surface:b")
      );
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.curve.intersect");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: split body resolves to stable entry",
    fn: async () => {
      const split = dsl.splitBody(
        "split-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorNamed("surface:tool")
      );
      const stage = getFeatureStage(split);
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: split face resolves to stable entry",
    fn: async () => {
      const split = dsl.splitFace(
        "split-face-1",
        dsl.selectorFace([dsl.predPlanar()]),
        dsl.selectorNamed("surface:tool")
      );
      const stage = getFeatureStage(split);
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: unwrap resolves to stable entry",
    fn: async () => {
      const unwrap = dsl.unwrap(
        "unwrap-1",
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()])
      );
      const stage = getFeatureStage(unwrap);
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: delete face resolves to stable entry",
    fn: async () => {
      const deleted = dsl.deleteFace(
        "delete-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()])
      );
      const stage = getFeatureStage(deleted);
      assert.equal(stage.key, "feature.delete.face");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: replace face resolves to stable entry",
    fn: async () => {
      const replaced = dsl.replaceFace(
        "replace-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
        dsl.selectorNamed("surface:tool")
      );
      const stage = getFeatureStage(replaced);
      assert.equal(stage.key, "feature.replace.face");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: move face resolves to stable entry",
    fn: async () => {
      const moved = dsl.moveFace(
        "move-face-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
        undefined,
        undefined,
        { translation: [0, 0, 1] }
      );
      const stage = getFeatureStage(moved);
      assert.equal(stage.key, "feature.move.face");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: variable fillet resolves to stable entry",
    fn: async () => {
      const feature = dsl.variableFillet(
        "variable-fillet-1",
        dsl.selectorNamed("body:main"),
        [{ edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]), radius: 1 }]
      );
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.fillet.variable");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: variable chamfer resolves to stable entry",
    fn: async () => {
      const feature = dsl.variableChamfer(
        "variable-chamfer-1",
        dsl.selectorNamed("body:main"),
        [{ edge: dsl.selectorEdge([dsl.predCreatedBy("base")], [dsl.rankMaxZ()]), distance: 1 }]
      );
      const stage = getFeatureStage(feature);
      assert.equal(stage.key, "feature.chamfer.variable");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: move body resolves to stable entry",
    fn: async () => {
      const moved = dsl.moveBody(
        "move-1",
        dsl.selectorNamed("body:main"),
        undefined,
        undefined,
        { translation: [5, 0, 0] }
      );
      const stage = getFeatureStage(moved);
      assert.equal(stage.key, "feature.move.body");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: draft resolves to stable entry",
    fn: async () => {
      const draft = dsl.draft(
        "draft-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()]),
        dsl.planeDatum("datum-1"),
        dsl.axisVector([0, 0, 1]),
        0.1
      );
      const stage = getFeatureStage(draft);
      assert.equal(stage.key, "feature.draft");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: thread resolves to stable entry",
    fn: async () => {
      const thread = dsl.thread("thread-1", "+Z", 10, 8, 1.5);
      const stage = getFeatureStage(thread);
      assert.equal(stage.key, "feature.thread");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: surface mode operations resolve to staging",
    fn: async () => {
      const extrudeSurface = dsl.extrude(
        "ext-1",
        dsl.profileRef("profile:line"),
        10,
        "surface:main",
        undefined,
        { mode: "surface" }
      );
      const key = featureStageKey(extrudeSurface);
      assert.equal(key, "feature.extrude:mode.surface");
      assert.equal(getFeatureStage(extrudeSurface).stage, "staging");
    },
  },
  {
    name: "feature staging: solid-mode operations stay stable",
    fn: async () => {
      const extrudeSolid = dsl.extrude("ext-2", dsl.profileCircle(4), 10);
      assert.equal(featureStageKey(extrudeSolid), "feature.extrude");
      assert.equal(getFeatureStage(extrudeSolid).stage, "stable");
    },
  },
  {
    name: "feature staging: surface feature resolves to stable entry",
    fn: async () => {
      const surface = dsl.surface("surface-1", dsl.profileRef("profile:rect"), "surface:main");
      const stage = getFeatureStage(surface);
      assert.equal(stage.key, "feature.surface");
      assert.equal(stage.stage, "stable");
    },
  },
  {
    name: "feature staging: revolve surface mode resolves to stable entry",
    fn: async () => {
      const revolve = dsl.revolve(
        "rev-1",
        dsl.profileRef("profile:open"),
        "+Z",
        "full",
        "surface:main",
        { mode: "surface" }
      );
      const stage = getFeatureStage(revolve);
      assert.equal(stage.key, "feature.revolve:mode.surface");
      assert.equal(stage.stage, "stable");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
