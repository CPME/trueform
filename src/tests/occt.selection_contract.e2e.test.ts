import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { collectSelectionContractIssues } from "../selection_contract.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

function issueCodesForFeature(
  selections: Parameters<typeof collectSelectionContractIssues>[0],
  featureId: string,
  ownerKey: string
): string[] {
  return collectSelectionContractIssues(selections, { featureId, ownerKey }).map(
    (issue) => issue.code
  );
}

const tests = [
  {
    name: "occt selection contract: extrude creator outputs are semantic and issue-free",
    fn: async () => {
      const { backend } = await getBackendContext();
      const result = buildPart(
        dsl.part("selection-contract-extrude", [
          dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
        ]),
        backend
      );
      assert.deepEqual(issueCodesForFeature(result.final.selections, "base", "body:main"), []);
    },
  },
  {
    name: "occt selection contract: revolve creator outputs are semantic and issue-free",
    fn: async () => {
      const { backend } = await getBackendContext();
      const sketch = dsl.sketch2d(
        "sketch-profile",
        [
          {
            name: "profile:loop",
            profile: dsl.profileSketchLoop(["line-1", "line-2", "line-3", "line-4"]),
          },
        ],
        {
          entities: [
            dsl.sketchLine("line-1", [2, 0], [4, 0]),
            dsl.sketchLine("line-2", [4, 0], [4, 2]),
            dsl.sketchLine("line-3", [4, 2], [2, 2]),
            dsl.sketchLine("line-4", [2, 2], [2, 0]),
          ],
        }
      );
      const result = buildPart(
        dsl.part("selection-contract-revolve", [
          sketch,
          dsl.revolve(
            "sketch-revolve",
            dsl.profileRef("profile:loop"),
            "+Y",
            Math.PI,
            "body:main"
          ),
        ]),
        backend
      );
      assert.deepEqual(
        issueCodesForFeature(result.final.selections, "sketch-revolve", "body:main"),
        []
      );
    },
  },
  {
    name: "occt selection contract: pipe creator outputs are semantic and issue-free",
    fn: async () => {
      const { backend } = await getBackendContext();
      const result = buildPart(
        dsl.part("selection-contract-pipe", [
          dsl.pipe("pipe-1", "+Z", 80, 60, 40, "body:main"),
        ]),
        backend
      );
      assert.deepEqual(issueCodesForFeature(result.final.selections, "pipe-1", "body:main"), []);
    },
  },
  {
    name: "occt selection contract: pipe sweep creator outputs are semantic and issue-free",
    fn: async () => {
      const { backend } = await getBackendContext();
      const path = dsl.pathSegments([
        dsl.pathArc([40, 0, 0], [0, 40, 0], [0, 0, 0], "ccw"),
      ]);
      const result = buildPart(
        dsl.part("selection-contract-pipe-sweep", [
          dsl.pipeSweep("sweep-1", path, 20, 10, "body:main"),
        ]),
        backend
      );
      assert.deepEqual(issueCodesForFeature(result.final.selections, "sweep-1", "body:main"), []);
    },
  },
  {
    name: "occt selection contract: generic sweep reports hash-only creator coverage gaps",
    fn: async () => {
      const { backend } = await getBackendContext();
      const result = buildPart(
        dsl.part("selection-contract-sweep", [
          dsl.sweep(
            "sweep-1",
            dsl.profileCircle(4),
            dsl.pathPolyline([
              [0, 0, 0],
              [0, 0, 20],
              [10, 8, 30],
            ]),
            "body:main"
          ),
        ]),
        backend
      );
      assert.equal(
        issueCodesForFeature(result.final.selections, "sweep-1", "body:main").includes(
          "selection_hash_only_creator_output"
        ),
        true
      );
    },
  },
  {
    name: "occt selection contract: loft reports hash-only creator coverage gaps",
    fn: async () => {
      const { backend } = await getBackendContext();
      const result = buildPart(
        dsl.part("selection-contract-loft", [
          dsl.loft(
            "loft-solid",
            [
              dsl.profileCircle(10, [0, 0, 0]),
              dsl.profilePoly(6, 16, [0, 0, 24], Math.PI / 6),
            ],
            "body:main"
          ),
        ]),
        backend
      );
      assert.equal(
        issueCodesForFeature(result.final.selections, "loft-solid", "body:main").includes(
          "selection_hash_only_creator_output"
        ),
        true
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
