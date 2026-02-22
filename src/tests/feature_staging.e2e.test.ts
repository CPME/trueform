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
    name: "feature staging: registry includes draft/delete/replace/move/thread/surface entries",
    fn: async () => {
      const keys = listStagedFeatureKeys();
      assert.ok(keys.includes("feature.draft"));
      assert.ok(keys.includes("feature.delete.face"));
      assert.ok(keys.includes("feature.replace.face"));
      assert.ok(keys.includes("feature.move.body"));
      assert.ok(keys.includes("feature.thread"));
      assert.ok(keys.includes("feature.surface"));
      assert.equal(TF_STAGED_FEATURES["feature.draft"]?.stage, "staging");
      assert.equal(TF_STAGED_FEATURES["feature.delete.face"]?.stage, "staging");
      assert.equal(TF_STAGED_FEATURES["feature.replace.face"]?.stage, "staging");
      assert.equal(TF_STAGED_FEATURES["feature.move.body"]?.stage, "staging");
      assert.equal(TF_STAGED_FEATURES["feature.thread"]?.stage, "staging");
      assert.equal(TF_STAGED_FEATURES["feature.surface"]?.stage, "staging");
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
    name: "feature staging: delete face resolves to staging entry",
    fn: async () => {
      const deleted = dsl.deleteFace(
        "delete-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()])
      );
      const stage = getFeatureStage(deleted);
      assert.equal(stage.key, "feature.delete.face");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: replace face resolves to staging entry",
    fn: async () => {
      const replaced = dsl.replaceFace(
        "replace-1",
        dsl.selectorNamed("body:main"),
        dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxZ()]),
        dsl.selectorNamed("surface:tool")
      );
      const stage = getFeatureStage(replaced);
      assert.equal(stage.key, "feature.replace.face");
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: move body resolves to staging entry",
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
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: draft resolves to staging entry",
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
      assert.equal(stage.stage, "staging");
    },
  },
  {
    name: "feature staging: thread resolves to staging entry",
    fn: async () => {
      const thread = dsl.thread("thread-1", "+Z", 10, 8, 1.5);
      const stage = getFeatureStage(thread);
      assert.equal(stage.key, "feature.thread");
      assert.equal(stage.stage, "staging");
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
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
