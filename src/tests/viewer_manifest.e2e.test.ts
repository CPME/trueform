import assert from "node:assert/strict";
import { collectMeshAssets } from "../viewer/asset_manifest.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "viewer manifest: collects mesh json assets only",
    fn: async () => {
      const files = [
        "plate.mesh.json",
        "notes.txt",
        "plate.mesh.json",
        "preview.png",
        "alpha.mesh.json",
        "README.md",
        "beta.MESH.JSON",
      ];
      const assets = collectMeshAssets(files);
      assert.deepEqual(assets, [
        "alpha.mesh.json",
        "beta.MESH.JSON",
        "plate.mesh.json",
      ]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
