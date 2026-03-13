import assert from "node:assert/strict";
import {
  buildEdgeSelectionIndices,
  inferMeasureUnits,
  measureMetricsForSelection,
  sanitizeSelections,
  summarizeMateResiduals,
} from "./service_selection_measure.mjs";

const sanitized = sanitizeSelections([
  {
    id: "edge:1",
    kind: "edge",
    meta: {
      backendEdgeIndices: [3],
      startPoint: [0, 0, 0],
      endPoint: [1, 0, 0],
      curveCenter: [0.5, 0, 0],
      shape: { hidden: true },
    },
  },
]);
assert.equal(sanitized[0].meta.shape, undefined);
assert.deepEqual(Object.keys(sanitized[0].meta.pointAnchors).sort(), ["center", "end", "mid", "start"]);
assert.deepEqual(buildEdgeSelectionIndices({ edgeIndices: [3, 7] }, sanitized), [0, -1]);
assert.deepEqual(
  measureMetricsForSelection({ meta: { radius: 2, area: 12 } }, "mm"),
  [
    { kind: "radius", value: 2, unit: "mm", label: "radius" },
    { kind: "distance", value: 4, unit: "mm", label: "diameter" },
    { kind: "area", value: 12, unit: "mm^2", label: "area" },
  ]
);
assert.equal(
  inferMeasureUnits(
    { tenantId: "t1", docId: "doc" },
    (tenantId, docId) => ({ document: { context: { units: `${tenantId}:${docId}` } } })
  ),
  "t1:doc"
);
assert.deepEqual(summarizeMateResiduals([{ kind: "mate.distance" }], [3]), [
  { index: 0, kind: "mate.distance", count: 1, rms: 3, maxAbs: 3 },
]);
