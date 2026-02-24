function summarizeSelections(selections) {
  const summary = { total: 0, byKind: { face: 0, edge: 0, solid: 0 } };
  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    summary.total += 1;
    const kind = typeof selection.kind === "string" ? selection.kind : "face";
    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
  }
  return summary;
}

function formatSelectionSummary(summary, selections) {
  const lines = [];
  lines.push(`Total: ${summary.total}`);
  lines.push(
    `Faces: ${summary.byKind.face || 0} | Edges: ${summary.byKind.edge || 0} | Solids: ${
      summary.byKind.solid || 0
    }`
  );
  lines.push("---");
  const preview = selections.slice(0, 18);
  for (const selection of preview) {
    if (!selection || typeof selection !== "object") continue;
    const meta = selection.meta && typeof selection.meta === "object" ? selection.meta : {};
    const createdBy = meta.createdBy ? ` createdBy=${meta.createdBy}` : "";
    const normal = meta.normal ? ` normal=${meta.normal}` : "";
    const tags =
      Array.isArray(meta.featureTags) && meta.featureTags.length > 0
        ? ` tags=[${meta.featureTags.join(", ")}]`
        : "";
    lines.push(`${selection.id} (${selection.kind})${createdBy}${normal}${tags}`);
  }
  if (selections.length > preview.length) {
    lines.push(`... ${selections.length - preview.length} more`);
  }
  return lines.join("\n");
}

function prepareSelectionOverlay(payload) {
  const selections = Array.isArray(payload?.selections) ? payload.selections : [];
  const center = payload?.center && typeof payload.center === "object" ? payload.center : null;
  const radius = Number.isFinite(payload?.radius) ? Math.max(0, Number(payload.radius)) : 1;
  const summary = summarizeSelections(selections);
  const text = formatSelectionSummary(summary, selections);
  const markerRadius = Math.max(radius * 0.02, 0.6);
  const markers = [];
  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    const kind = typeof selection.kind === "string" ? selection.kind : "face";
    const meta = selection.meta && typeof selection.meta === "object" ? selection.meta : {};
    const point = Array.isArray(meta.center) ? meta.center : null;
    if (!point || point.length < 3) continue;
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const position = center
      ? [x - Number(center.x || 0), y - Number(center.y || 0), z - Number(center.z || 0)]
      : [x, y, z];
    const normalVec = Array.isArray(meta.normalVec) ? meta.normalVec : null;
    markers.push({
      id: typeof selection.id === "string" ? selection.id : "",
      kind,
      position,
      normalVec:
        Array.isArray(normalVec) && normalVec.length >= 3
          ? [Number(normalVec[0]), Number(normalVec[1]), Number(normalVec[2])]
          : null,
    });
  }
  return { summary, text, markerRadius, markers };
}

self.addEventListener("message", (event) => {
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const id = data.id;
  const kind = data.kind;
  const payload = data.payload;
  if (typeof id !== "number" || typeof kind !== "string") return;
  try {
    if (kind === "decodeJsonText") {
      const text = typeof payload?.text === "string" ? payload.text : "";
      const json = JSON.parse(text);
      self.postMessage({ id, ok: true, result: json });
      return;
    }
    if (kind === "prepareSelectionOverlay") {
      const result = prepareSelectionOverlay(payload);
      self.postMessage({ id, ok: true, result });
      return;
    }
    throw new Error(`Unsupported worker task kind: ${kind}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ id, ok: false, error: message });
  }
});
