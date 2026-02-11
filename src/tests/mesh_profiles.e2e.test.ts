import assert from "node:assert/strict";
import { meshOptionsForProfile, MESH_PROFILE_DEFAULTS } from "../mesh_profiles.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "mesh profiles: overrides apply",
    fn: async () => {
      const opts = meshOptionsForProfile("interactive", { linearDeflection: 0.9 });
      assert.equal(opts.linearDeflection, 0.9);
      assert.equal(opts.includeEdges, MESH_PROFILE_DEFAULTS.interactive.includeEdges);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
