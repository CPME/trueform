# Runtime Selection Integration

Use this page when you are building an external viewer, editor, or service that
needs to persist and reuse TrueForm feature selections across rebuilds.

This is the canonical consumer workflow for semantic topology.

## Core Rules

- Gate direct-pick persistence on `/v1/capabilities.semanticTopology`.
- Persist emitted `selection.id` values exactly as returned.
- Treat the id as an opaque token even when it looks readable.
- Use mesh data for hit testing and highlighting only.
- Map picks back to semantic ids immediately.
- Reuse stored ids through `selectorNamed(selectionId)` or the equivalent raw
  `{ kind: "selector.named", name: selectionId }` payload.
- Handle published `selector_*` error codes explicitly.

## Recommended Imports

Runtime integration helpers:

```ts
import {
  TfServiceClient,
  getEdgeSelectionId,
  getMeshSelectionId,
  getSemanticTopologyContractVersion,
  indexBuildSelectionIds,
  isSemanticTopologyEnabled,
  isSelectorError,
  selectionIdToNamedSelector,
} from "@trueform/service-client";
```

If your app authors DSL directly, you can also reuse the stored id with:

```ts
import { selectorNamed } from "trueform/dsl/selectors";
```

Compatibility note:

- The same helper surface is also re-exported from `trueform/experimental`.
- Prefer `@trueform/service-client` for runtime-facing consumer code.

## End-To-End Flow

### 1. Check capabilities

```ts
const client = new TfServiceClient({ baseUrl: "http://127.0.0.1:8080" });
const capabilities = await client.capabilities();

if (!isSemanticTopologyEnabled(capabilities)) {
  throw new Error("semantic_topology_unavailable");
}

const contractVersion = getSemanticTopologyContractVersion(capabilities);
if (contractVersion !== "beta-2026-03-02") {
  throw new Error(`unsupported_semantic_topology_contract:${String(contractVersion)}`);
}
```

### 2. Build and fetch mesh data

```ts
const accepted = await client.build({
  part,
  options: { meshProfile: "interactive" },
});

const job = await client.pollJob<{
  selections?: {
    faces?: string[];
    edges?: string[];
    solids?: string[];
    surfaces?: string[];
    points?: string[];
  };
  mesh?: { asset?: { url?: string } };
}>(accepted.jobId);

if (job.state !== "succeeded" || !job.result) {
  throw new Error("build_failed");
}

const selectionIndex = indexBuildSelectionIds(job.result);
const meshUrl = String(job.result.mesh?.asset?.url ?? "");
const mesh = await client.getAssetJson<{
  selections?: Array<{ id?: string; kind?: string; meta?: Record<string, unknown> }>;
  edgeSelectionIndices?: number[];
}>(meshUrl);
```

### 3. Map a UI pick back to a semantic id

For a face hit where your viewer already knows the mesh selection index:

```ts
const storedFaceId = getMeshSelectionId(mesh, faceSelectionIndex);
if (!storedFaceId || !selectionIndex.faces.has(storedFaceId)) {
  throw new Error("face_selection_not_in_canonical_index");
}
```

For a rendered edge segment:

```ts
const storedEdgeId = getEdgeSelectionId(mesh, edgeSegmentIndex);
if (!storedEdgeId || !selectionIndex.edges.has(storedEdgeId)) {
  throw new Error("edge_selection_not_in_canonical_index");
}
```

Persist that emitted id directly in your application state or saved document.

## Reuse The Stored Id

If you are constructing raw intent payloads:

```ts
const onFace = selectionIdToNamedSelector(storedFaceId);
```

If you are constructing DSL:

```ts
const holeFeature = hole(
  "hole-1",
  selectorNamed(storedFaceId),
  "-Z",
  6,
  "throughAll"
);
```

Do not derive a new token from `selectionSlot`, `selectionLineage`,
`adjacentFaceSlots`, `selectionSignature`, or `selectionProvenance`.

## Error Handling

Selector failures are a normal part of the contract when a stored semantic id
no longer resolves.

```ts
if (job.error && isSelectorError(job.error)) {
  console.error("stored selection failed", job.error.code, job.error.details);
}
```

At minimum, handle:

- `selector_named_missing`
- `selector_ambiguous`
- `selector_empty`
- `selector_empty_after_rank`
- `selector_legacy_numeric_unsupported`

Recommended UI behavior:

- Show which stored id failed.
- Show which action or feature depends on it.
- Do not silently substitute a different face or edge.

## What Not To Do

- Do not persist mesh-local handles, triangle ids, or edge traversal order.
- Do not parse readable semantic fragments out of `selection.id` and rebuild the
  token yourself.
- Do not promote `selection.meta` into a second reference format.
- Do not assume all topology-changing workflows are covered outside the
  documented semantic-topology beta scope.

## Related References

- [API Reference](./api)
- [Selectors, Predicates, Ranking](./dsl/selectors)
- [Runtime Payload Fixtures](./runtime-payload-fixtures)
