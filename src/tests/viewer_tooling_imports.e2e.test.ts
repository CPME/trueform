import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "viewer tooling: assembly imports use experimental entrypoint",
    fn: async () => {
      const files = [
        resolve("tools/viewer/export.mjs"),
        resolve("tools/viewer/slider_sweep.mjs"),
      ];

      for (const file of files) {
        const content = await readFile(file, "utf8");
        assert.ok(
          content.includes('import { buildAssembly } from "../../dist/experimental.js";'),
          `Expected experimental buildAssembly import in ${file}`
        );
        assert.ok(
          !content.includes('import { buildAssembly, dsl } from "../../dist/index.js";'),
          `Found stale root buildAssembly import in ${file}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
