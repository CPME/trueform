import assert from "node:assert/strict";
import {
  deriveBooleanSemanticEdgeSlot,
  describeBooleanSemanticEdge,
  describeSemanticEdgeFromAdjacentFaces,
} from "../selection_semantics.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "selection semantics: union/intersect edges keep bound semantics for plain side-cap adjacency",
    fn: async () => {
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["side.1", "top"]),
        "side.1.bound.top"
      );
    },
  },
  {
    name: "selection semantics: union/intersect edges keep bound semantics for split side-cap adjacency",
    fn: async () => {
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["split.side.1.branch.1", "top"]),
        "split.side.1.branch.1.bound.top"
      );
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["split.side.1.branch.1", "split.top.branch.1"]),
        "split.side.1.branch.1.bound.split.top.branch.1"
      );
    },
  },
  {
    name: "selection semantics: union/intersect edges preserve right-side disambiguation through split branches",
    fn: async () => {
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["split.right.side.1.branch.1", "top"]),
        "split.right.side.1.branch.1.bound.top"
      );
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["split.right.side.1.branch.1", "side.1"]),
        "split.right.side.1.branch.1.bound.side.1"
      );
    },
  },
  {
    name: "selection semantics: union/intersect edges fall back to join for side-side adjacency",
    fn: async () => {
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["right.side.1", "right.side.2"]),
        "right.side.1.join.right.side.2"
      );
    },
  },
  {
    name: "selection semantics: pipe-style outer/start adjacency keeps bound semantics",
    fn: async () => {
      assert.equal(
        deriveBooleanSemanticEdgeSlot(["outer", "start"]),
        "outer.bound.start"
      );
    },
  },
  {
    name: "selection semantics: single semantic adjacent face slot derives seam semantics",
    fn: async () => {
      assert.deepEqual(describeSemanticEdgeFromAdjacentFaces(["outer"]), {
        slot: "outer.seam",
        relation: "seam",
        faceSlots: ["outer"],
        baseFaceSlots: ["outer"],
        rootSlot: "outer",
      });
    },
  },
  {
    name: "selection semantics: semantic edge descriptors capture split provenance and signature",
    fn: async () => {
      assert.deepEqual(
        describeBooleanSemanticEdge(["split.side.1.branch.1", "split.top.branch.1"]),
        {
          slot: "split.side.1.branch.1.bound.split.top.branch.1",
          signature:
            "boolean.edge.v1|bound|split.side.1.branch.1|split.top.branch.1|side.1|top",
          provenance: {
            version: 1,
            relation: "bound",
            faceSlots: ["split.side.1.branch.1", "split.top.branch.1"],
            baseFaceSlots: ["side.1", "top"],
            rootSlot: "split.side.1.branch.1",
            targetSlot: "split.top.branch.1",
          },
        }
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
