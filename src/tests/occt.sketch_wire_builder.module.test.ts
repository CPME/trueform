import assert from "node:assert/strict";
import type { SketchEntity } from "../ir.js";
import {
  buildSketchWireWithStatus,
  segmentSlotsForLoop,
  type SketchWireBuilderDeps,
} from "../occt/sketch_wire_builder.js";
import { runTests } from "./occt_test_utils.js";

function makeDeps(state: { addedEdges: unknown[]; checked: Array<{ count: number; allowOpen: boolean }> }): SketchWireBuilderDeps {
  return {
    newOcct: (name: string) => {
      if (name !== "BRepBuilderAPI_MakeWire") throw new Error(`unexpected ctor ${name}`);
      return {
        edges: [] as unknown[],
        Add(edge: unknown) {
          this.edges.push(edge);
        },
        Wire() {
          return { kind: "wire", edges: this.edges.slice() };
        },
      };
    },
    addWireEdge: (builder, edge) => {
      state.addedEdges.push(edge);
      builder.Add(edge);
      return true;
    },
    checkLoopContinuity: (segments, allowOpen) => {
      state.checked.push({ count: segments.length, allowOpen });
      return !allowOpen;
    },
    point2To3: (point) => [Number(point[0]), Number(point[1]), 0],
    point2Numbers: (point) => [Number(point[0]), Number(point[1])],
    dist2: (a, b) => {
      const dx = Number(a[0]) - Number(b[0]);
      const dy = Number(a[1]) - Number(b[1]);
      return dx * dx + dy * dy;
    },
    arcMidpoint: (start, end) => [
      (Number(start[0]) + Number(end[0])) / 2,
      (Number(start[1]) + Number(end[1])) / 2,
    ],
    ellipseAxes: () => ({ major: 4, minor: 2, xDir: [1, 0, 0] }),
    rectanglePoints: () => [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ],
    polygonPoints: () => [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    rotateTranslate2: (point, origin) => [Number(point[0]) + Number(origin[0]), Number(point[1]) + Number(origin[1])],
    makeLineEdge: (start, end) => ({ kind: "line-edge", start, end }),
    makeArcEdge: (start, mid, end) => ({ kind: "arc-edge", start, mid, end }),
    makeCircleEdge: (center, radius) => ({ kind: "circle-edge", center, radius }),
    makeEllipseEdge: (center, xDir, normal, major, minor) => ({
      kind: "ellipse-edge",
      center,
      xDir,
      normal,
      major,
      minor,
    }),
    makeSplineEdge: () => ({
      edge: { kind: "spline-edge" },
      start: [0, 0, 0],
      end: [1, 1, 0],
      closed: false,
    }),
  };
}

const plane = {
  origin: [0, 0, 0] as [number, number, number],
  xDir: [1, 0, 0] as [number, number, number],
  yDir: [0, 1, 0] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
};

const tests = [
  {
    name: "sketch wire builder: assembles loop segments into a wire and delegates continuity checks",
    fn: async () => {
      const state = { addedEdges: [] as unknown[], checked: [] as Array<{ count: number; allowOpen: boolean }> };
      const deps = makeDeps(state);
      const entityMap = new Map<string, SketchEntity>([
        ["line-1", { kind: "sketch.line", id: "line-1", start: [0, 0], end: [2, 0] }],
        ["line-2", { kind: "sketch.line", id: "line-2", start: [2, 0], end: [2, 2] }],
      ]);

      const result = buildSketchWireWithStatus(["line-1", "line-2"], entityMap, plane, true, deps);

      assert.deepEqual(result, {
        wire: {
          kind: "wire",
          edges: [
            { kind: "line-edge", start: [0, 0, 0], end: [2, 0, 0] },
            { kind: "line-edge", start: [2, 0, 0], end: [2, 2, 0] },
          ],
        },
        closed: false,
      });
      assert.deepEqual(state.checked, [{ count: 2, allowOpen: true }]);
      assert.equal(state.addedEdges.length, 2);
    },
  },
  {
    name: "sketch wire builder: emits split source slots for multi-segment entities",
    fn: async () => {
      const deps = makeDeps({ addedEdges: [], checked: [] });
      const entityMap = new Map<string, SketchEntity>([
        [
          "rect-1",
          { kind: "sketch.rectangle", id: "rect-1", mode: "center", center: [0, 0], width: 4, height: 2 },
        ],
      ]);

      const slots = segmentSlotsForLoop(["rect-1"], entityMap, plane, deps);
      assert.deepEqual(slots, ["rect-1.1", "rect-1.2", "rect-1.3", "rect-1.4"]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
