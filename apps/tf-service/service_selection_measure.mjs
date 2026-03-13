export function sanitizeSelections(selections) {
  return selections.map((selection) => ({
    id: selection.id,
    kind: selection.kind,
    meta: (() => {
      const meta = serializeSelectionMeta(selection.meta);
      const pointAnchors = derivePointAnchors(selection);
      if (pointAnchors) meta.pointAnchors = pointAnchors;
      return meta;
    })(),
  }));
}

export function scopeSelectionsToTarget(selections, target, output) {
  if (!Array.isArray(selections) || selections.length === 0) return [];
  const byTargetOwner = selections.filter((selection) => {
    const ownerKey = selection?.meta?.ownerKey;
    return typeof ownerKey === "string" && ownerKey === target;
  });
  if (byTargetOwner.length > 0) return byTargetOwner;

  const outputOwnerKey = output?.meta?.ownerKey;
  if (typeof outputOwnerKey === "string" && outputOwnerKey.length > 0) {
    const byOutputOwner = selections.filter((selection) => {
      const ownerKey = selection?.meta?.ownerKey;
      return typeof ownerKey === "string" && ownerKey === outputOwnerKey;
    });
    if (byOutputOwner.length > 0) return byOutputOwner;
  }

  if (typeof output?.id === "string" && output.id.length > 0) {
    const byOutputId = selections.filter((selection) => selection?.id === output.id);
    if (byOutputId.length > 0) return byOutputId;
  }

  return selections;
}

export function summarizeSelections(selections) {
  const summary = { total: 0, byKind: { face: 0, edge: 0, solid: 0 } };
  for (const selection of selections) {
    if (!selection) continue;
    summary.total += 1;
    const kind = selection.kind || "face";
    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
  }
  return summary;
}

export function buildEdgeSelectionIndices(mesh, selections) {
  const edgeIndices = Array.isArray(mesh?.edgeIndices) ? mesh.edgeIndices : [];
  if (edgeIndices.length === 0 || !Array.isArray(selections) || selections.length === 0) {
    return undefined;
  }

  const selectionByEdgeIndex = new Map();
  for (let selectionIndex = 0; selectionIndex < selections.length; selectionIndex += 1) {
    const selection = selections[selectionIndex];
    if (selection?.kind !== "edge") continue;
    const rawIndices = Array.isArray(selection?.meta?.backendEdgeIndices)
      ? selection.meta.backendEdgeIndices
      : [];
    for (const rawIndex of rawIndices) {
      if (!Number.isInteger(rawIndex) || rawIndex < 0) continue;
      if (!selectionByEdgeIndex.has(rawIndex)) {
        selectionByEdgeIndex.set(rawIndex, selectionIndex);
      }
    }
  }

  if (selectionByEdgeIndex.size === 0) return undefined;
  return edgeIndices.map((edgeIndex) =>
    Number.isInteger(edgeIndex) && selectionByEdgeIndex.has(edgeIndex)
      ? selectionByEdgeIndex.get(edgeIndex)
      : -1
  );
}

export function buildOutputsMap(outputs) {
  const result = {};
  for (const [key, obj] of outputs.entries()) {
    result[key] = { kind: obj.kind, selectionId: obj.id };
  }
  return result;
}

export function buildSelectionIndex(selections) {
  const faces = [];
  const edges = [];
  const solids = [];
  const points = [];
  const pointSeen = new Set();
  for (const selection of selections) {
    if (selection.kind === "face") faces.push(selection.id);
    if (selection.kind === "edge") edges.push(selection.id);
    if (selection.kind === "solid") solids.push(selection.id);
    const pointAnchors = derivePointAnchors(selection);
    if (!pointAnchors || typeof pointAnchors !== "object") continue;
    for (const anchor of Object.values(pointAnchors)) {
      const id = anchor?.id;
      if (typeof id !== "string" || id.length === 0 || pointSeen.has(id)) continue;
      pointSeen.add(id);
      points.push(id);
    }
  }
  return { faces, edges, solids, points };
}

export function inferMeasureUnits(entry, lookupDocument) {
  if (!entry?.docId || !entry?.tenantId) return "mm";
  const stored = lookupDocument(entry.tenantId, entry.docId);
  const units = stored?.document?.context?.units;
  return typeof units === "string" && units.trim().length > 0 ? units.trim() : "mm";
}

export function resolveMeasureSelection(entry, target) {
  const outputs = entry?.result?.final?.outputs;
  if (outputs instanceof Map && outputs.has(target)) {
    const output = outputs.get(target);
    if (
      output &&
      (output.kind === "face" ||
        output.kind === "edge" ||
        output.kind === "solid" ||
        output.kind === "surface")
    ) {
      return { id: output.id, kind: output.kind, meta: output.meta ?? {} };
    }
  }

  const selections = Array.isArray(entry?.result?.final?.selections)
    ? entry.result.final.selections
    : [];
  const hit = selections.find((selection) => selection?.id === target);
  if (hit) return hit;

  if (outputs instanceof Map) {
    for (const output of outputs.values()) {
      if (
        output &&
        output.id === target &&
        (output.kind === "face" ||
          output.kind === "edge" ||
          output.kind === "solid" ||
          output.kind === "surface")
      ) {
        return { id: output.id, kind: output.kind, meta: output.meta ?? {} };
      }
    }
  }

  return null;
}

export function measureMetricsForSelection(selection, units) {
  const metrics = [];
  const meta = selection?.meta && typeof selection.meta === "object" ? selection.meta : {};
  const lengthUnit = buildLengthUnit(units);
  const areaUnit = buildAreaUnit(units);

  const radius = meta.radius;
  if (finiteNumber(radius) && radius > 0) {
    metrics.push({ kind: "radius", value: radius, unit: lengthUnit, label: "radius" });
    metrics.push({
      kind: "distance",
      value: radius * 2,
      unit: lengthUnit,
      label: "diameter",
    });
  }

  const length = meta.length;
  if (finiteNumber(length) && length > 0) {
    metrics.push({ kind: "distance", value: length, unit: lengthUnit, label: "length" });
  }

  const area = meta.area;
  if (finiteNumber(area) && area > 0) {
    metrics.push({ kind: "area", value: area, unit: areaUnit, label: "area" });
  }

  return metrics;
}

export function summarizeValidation(results) {
  const summary = { total: results.length, ok: 0, fail: 0, unsupported: 0 };
  for (const result of results) {
    if (result.status === "ok") summary.ok += 1;
    else if (result.status === "fail") summary.fail += 1;
    else summary.unsupported += 1;
  }
  return summary;
}

export function residualCountForMate(mate) {
  switch (mate?.kind) {
    case "mate.fixed":
      return 6;
    case "mate.coaxial":
      return 6;
    case "mate.planar":
      return 4;
    case "mate.distance":
      return 1;
    case "mate.angle":
      return 1;
    case "mate.parallel":
      return 3;
    case "mate.perpendicular":
      return 1;
    case "mate.insert":
      return 8;
    case "mate.slider":
      return 6;
    case "mate.hinge":
      return 7;
    default:
      return 0;
  }
}

export function summarizeMateResiduals(mates, residuals) {
  const out = [];
  let offset = 0;
  for (let i = 0; i < mates.length; i += 1) {
    const mate = mates[i];
    const count = residualCountForMate(mate);
    const values = residuals.slice(offset, offset + count);
    offset += count;
    const maxAbs = values.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0);
    const rms =
      values.length === 0
        ? 0
        : Math.sqrt(values.reduce((acc, v) => acc + v * v, 0) / values.length);
    out.push({ index: i, kind: mate?.kind ?? "unknown", count, rms, maxAbs });
  }
  return out;
}

function isPrimitive(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isPrimitiveArray(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" || typeof entry === "number")
  );
}

function serializeSelectionMeta(meta) {
  const output = {};
  if (!meta || typeof meta !== "object") return output;
  for (const [key, value] of Object.entries(meta)) {
    if (key === "shape" || key === "owner" || key === "face" || key === "wire") continue;
    if (isPrimitive(value)) {
      output[key] = value;
      continue;
    }
    if (isPrimitiveArray(value)) output[key] = value.slice();
  }
  return output;
}

function isPointTriplet(value) {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function pointAnchor(selection, locator, point) {
  return {
    id: `${selection.id}.point.${locator}`,
    sourceId: selection.id,
    locator,
    at: [point[0], point[1], point[2]],
  };
}

function derivePointAnchors(selection) {
  const meta = selection?.meta && typeof selection.meta === "object" ? selection.meta : {};
  const kind = selection?.kind;
  const anchors = {};

  const center =
    kind === "edge" && isPointTriplet(meta.curveCenter)
      ? meta.curveCenter
      : isPointTriplet(meta.center)
        ? meta.center
        : null;
  if (center && (kind === "face" || kind === "edge" || kind === "solid" || kind === "surface")) {
    anchors.center = pointAnchor(selection, "center", center);
  }
  if (kind !== "edge") return Object.keys(anchors).length > 0 ? anchors : undefined;

  const mid = isPointTriplet(meta.midPoint) ? meta.midPoint : center;
  if (mid) anchors.mid = pointAnchor(selection, "mid", mid);
  const closed = meta.closedEdge === true;
  if (!closed && isPointTriplet(meta.startPoint)) anchors.start = pointAnchor(selection, "start", meta.startPoint);
  if (!closed && isPointTriplet(meta.endPoint)) anchors.end = pointAnchor(selection, "end", meta.endPoint);
  return Object.keys(anchors).length > 0 ? anchors : undefined;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function buildLengthUnit(units) {
  return typeof units === "string" && units.trim().length > 0 ? units.trim() : undefined;
}

function buildAreaUnit(units) {
  const lengthUnit = buildLengthUnit(units);
  return lengthUnit ? `${lengthUnit}^2` : undefined;
}
