import assert from "node:assert/strict";
import { basename } from "node:path";
import { runTests } from "./occt_test_utils.js";

const { isDefaultTestEntry, listDefaultTestFiles } = (await (0, eval)(
  'import("../../tools/run-tests.mjs")'
)) as {
  isDefaultTestEntry: (entryName: string) => boolean;
  listDefaultTestFiles: () => Promise<string[]>;
};

const tests = [
  {
    name: "test runner: default suite includes e2e and module tests only",
    fn: async () => {
      assert.equal(isDefaultTestEntry("assertions.e2e.test.ts"), true);
      assert.equal(isDefaultTestEntry("occt.boolean.module.test.ts"), true);
      assert.equal(isDefaultTestEntry("occt.move_body.e2e.probe.ts"), false);
      assert.equal(isDefaultTestEntry("selector_conformance_harness.ts"), false);
    },
  },
  {
    name: "test runner: discovered suite contains module coverage and excludes probes",
    fn: async () => {
      const files = await listDefaultTestFiles();
      const names = files.map((file: string) => basename(file));
      assert.ok(names.includes("assertions.e2e.test.js"), "expected e2e test in discovered suite");
      assert.ok(
        names.includes("occt.boolean.module.test.js"),
        "expected module test in discovered suite"
      );
      assert.ok(
        !names.includes("occt.move_body.e2e.probe.js"),
        "probe files should stay out of the default suite"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
