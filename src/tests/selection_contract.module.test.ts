import assert from "node:assert/strict";
import type { KernelSelection } from "../backend.js";
import {
  assertSelectionContractInvariants,
  collectSelectionContractIssues,
  formatSelectionContractIssues,
  warnSelectionContractCoverageGaps,
} from "../selection_contract.js";
import { runTests } from "./occt_test_utils.js";

function makeSelection(
  overrides: Partial<KernelSelection> & { id: string; kind: KernelSelection["kind"] }
): KernelSelection {
  return {
    id: overrides.id,
    kind: overrides.kind,
    meta: overrides.meta ?? {},
    record: overrides.record,
  };
}

const tests = [
  {
    name: "selection contract: duplicate ids and alias metadata are invariant errors",
    fn: async () => {
      const selections = [
        makeSelection({
          id: "face:body.main~base.top",
          kind: "face",
          meta: { createdBy: "base", selectionSlot: "top" },
        }),
        makeSelection({
          id: "face:body.main~base.top",
          kind: "face",
          meta: { createdBy: "base", selectionAliases: ["face:body.main~base.hdeadbeef"] },
        }),
      ];
      const issues = collectSelectionContractIssues(selections, {
        featureId: "base",
        ownerKey: "body:main",
      });
      const issueCodes = issues.map((issue) => issue.code);
      assert.equal(issueCodes.includes("selection_alias_metadata_present"), true);
      assert.equal(issueCodes.includes("selection_id_duplicate"), true);
      assert.throws(
        () =>
          assertSelectionContractInvariants(selections, {
            featureId: "base",
            ownerKey: "body:main",
          }),
        /selection contract issues detected/i
      );
    },
  },
  {
    name: "selection contract: missing derivable semantic edge slots are invariant errors",
    fn: async () => {
      const selections = [
        makeSelection({
          id: "edge:body.main~base.hdeadbeef",
          kind: "edge",
          meta: {
            createdBy: "base",
            adjacentFaceSlots: ["side.1", "top"],
          },
        }),
      ];
      const issues = collectSelectionContractIssues(selections, {
        featureId: "base",
        ownerKey: "body:main",
      });
      assert.equal(issues.some((issue) => issue.code === "selection_missing_semantic_edge_slot"), true);
      assert.throws(
        () =>
          assertSelectionContractInvariants(selections, {
            featureId: "base",
            ownerKey: "body:main",
          }),
        /missing a semantic slot/i
      );
    },
  },
  {
    name: "selection contract: hash-only creator outputs become coverage warnings",
    fn: async () => {
      const selections = [
        makeSelection({
          id: "face:body.main~sweep-1.hdeadbeef",
          kind: "face",
          meta: { createdBy: "sweep-1" },
        }),
        makeSelection({
          id: "edge:body.main~sweep-1.hcafebabe",
          kind: "edge",
          meta: { createdBy: "sweep-1" },
        }),
      ];
      const warnings = collectSelectionContractIssues(selections, {
        featureId: "sweep-1",
        ownerKey: "body:main",
      }).filter((issue) => issue.severity === "warn");
      assert.equal(warnings.length, 2);

      const emitted: string[] = [];
      warnSelectionContractCoverageGaps(
        selections,
        { featureId: "sweep-1", ownerKey: "body:main" },
        {
          enabled: true,
          warn: (message) => emitted.push(String(message ?? "")),
        }
      );
      assert.equal(emitted.length, 1);
      assert.match(emitted[0] ?? "", /selection_hash_only_creator_output/);
    },
  },
  {
    name: "selection contract: semantic selections pass invariants without warnings",
    fn: async () => {
      const selections = [
        makeSelection({
          id: "face:body.main~base.top",
          kind: "face",
          meta: { createdBy: "base", selectionSlot: "top" },
        }),
        makeSelection({
          id: "edge:body.main~base.side.1.bound.top",
          kind: "edge",
          meta: {
            createdBy: "base",
            selectionSlot: "side.1.bound.top",
            adjacentFaceSlots: ["side.1", "top"],
          },
        }),
      ];
      assert.doesNotThrow(() =>
        assertSelectionContractInvariants(selections, {
          featureId: "base",
          ownerKey: "body:main",
        })
      );
      assert.equal(
        formatSelectionContractIssues(
          collectSelectionContractIssues(selections, {
            featureId: "base",
            ownerKey: "body:main",
          })
        ),
        "TrueForm selection contract issues detected:"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
