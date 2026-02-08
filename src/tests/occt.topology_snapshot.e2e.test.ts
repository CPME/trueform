import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPart } from "../executor.js";
import { partRegistry } from "../examples/parts/registry.js";
import { viewerPart } from "../examples/viewer_part.js";
import {
  countEdges,
  countFaces,
  countSolids,
  getBackendContext,
  runTests,
} from "./occt_test_utils.js";

const tests = [
  {
    name: "occt e2e: topology snapshot matches export",
    fn: async () => {
      const snapshotPath = path.resolve("tools/viewer/assets/topology.json");
      let snapshotRaw = "";
      try {
        snapshotRaw = await readFile(snapshotPath, "utf8");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Missing topology snapshot at ${snapshotPath} (${msg}). Run npm run viewer:export.`
        );
      }
      const snapshot = JSON.parse(snapshotRaw);
      const partsSnapshot = snapshot.parts ?? snapshot;

      const parts = [
        { id: "plate", part: viewerPart },
        ...partRegistry.map((entry) => ({ id: entry.id, part: entry.part })),
      ];

      const { occt, backend } = await getBackendContext();

      for (const entry of parts) {
        const expected = partsSnapshot[entry.id];
        assert.ok(expected, `Missing topology snapshot for ${entry.id}`);

        const result = buildPart(entry.part, backend);
        const body = result.final.outputs.get("body:main");
        assert.ok(body, `Missing body:main output for ${entry.id}`);

        const shape = body.meta["shape"] as any;
        assert.ok(shape, `Missing shape metadata for ${entry.id}`);

        const actual = {
          faces: countFaces(occt, shape),
          edges: countEdges(occt, shape),
          solids: countSolids(occt, shape),
        };

        assert.deepEqual(
          actual,
          expected,
          `Topology mismatch for ${entry.id}`
        );
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
