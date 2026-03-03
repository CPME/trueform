# Runtime Contract (Draft v0)

This document defines the initial HTTP/JSON contract for TrueForm webapp usage.
It prioritizes interactive modeling, async jobs, and backend-agnostic selectors.

## Goals
- Support interactive modeling via fast mesh delivery and progressive refinement.
- Keep B-Rep exclusively on the server (no kernel objects sent to the browser).
- Make the client and server backend-agnostic (OCCT.js and native OCCT can both serve this contract).
- Enable multi-tenant SaaS while remaining OSS-friendly.
- Make stable semantic references the client contract for selections, measurements,
  and downstream interactions.

## Versioning
- All endpoints are versioned under `/v1`.
- Requests must include `irVersion` and responses include `apiVersion`.
- Backward-incompatible changes require a new `/vN`.

## Job Model
Long-running operations are asynchronous.

Job states:
- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`

Common job response shape:
```json
{
  "id": "job_123",
  "jobId": "job_123",
  "state": "running",
  "progress": 0.42,
  "createdAt": "2026-02-10T12:00:00Z",
  "updatedAt": "2026-02-10T12:00:02Z",
  "result": null,
  "error": null
}
```

Error shape:
```json
{
  "code": "backend_unsupported_feature",
  "message": "Backend does not support feature feature.pipeSweep",
  "details": { "featureId": "pipe-1" }
}
```

## Capabilities
`GET /v1/capabilities`

Response:
```json
{
  "apiVersion": "1.2",
  "backend": "opencascade.js",
  "featureKinds": ["feature.extrude", "feature.loft", "feature.surface"],
  "featureStages": {
    "feature.extrude": {
      "stage": "stable"
    },
    "feature.loft": {
      "stage": "stable"
    },
    "feature.surface": {
      "stage": "stable"
    },
    "feature.extrude:mode.surface": {
      "stage": "staging",
      "notes": "Surface-mode extrude remains in staging while robustness improves."
    }
  },
  "exports": { "step": true, "stl": true },
  "mesh": true,
  "assertions": ["assert.brepValid"],
  "optionalFeatures": {
    "partialBuild": {
      "endpoint": true,
      "execution": "incremental",
      "requirements": {
        "sessionScoped": true,
        "changedFeatureIds": true
      }
    },
    "buildSessions": { "enabled": true },
    "assembly": { "solve": true, "preview": false, "validate": false },
    "measure": { "endpoint": true },
    "bom": { "derive": false },
    "release": { "preflight": false, "bundle": false },
    "pmi": { "stepAp242": false, "supportMatrix": false },
    "featureStaging": { "registry": true }
  },
  "errorContract": {
    "envelope": {
      "sync": "{ error: { code, message, details? } }",
      "async": "{ id, jobId, state, result|null, error: { code, message, details? } }"
    },
    "selectorCodes": [
      "selector_named_missing",
      "selector_ambiguous",
      "selector_empty",
      "selector_empty_after_rank",
      "selector_legacy_numeric_unsupported"
    ],
    "genericCodes": ["runtime_error"],
    "clientRule": "Treat error.code as the stable programmatic key; message text is diagnostic only."
  },
  "semanticTopology": {
    "enabled": true,
    "contractVersion": "beta-2026-03-02",
    "selectionTransport": {
      "canonicalSelectionIdField": "selection.id",
      "buildResultIndex": "result.selections lists canonical ids by kind across the full final selection set.",
      "meshSelections": "result.mesh.asset.selections reuses canonical ids for the requested output scope only.",
      "relationship": "mesh selections are a scoped subset of build-result canonical ids when the same topology is present in both payloads.",
      "clientRule": "Persist emitted selection ids exactly as returned and do not synthesize ids from metadata."
    },
    "selectorRebinding": {
      "policy": "deterministic_and_conservative",
      "supportedMigrations": [
        "plain semantic slot <-> split.*.branch.*",
        "legacy union tie suffixes -> right.* disambiguation",
        "matching face-slot migrations propagated into semantic edge slots"
      ]
    },
    "supportedWorkflows": [
      "direct-pick semantic face ids for primary prismatic output faces",
      "direct-pick semantic edge ids for primary prismatic output edges",
      "split face slot families",
      "fillet/chamfer semantic edge families",
      "boolean subtract semantic cut faces and cut-derived edges",
      "boolean union semantic face and edge ids with right.* disambiguation",
      "boolean intersect semantic overlap face and edge ids"
    ],
    "unsupportedWorkflows": [
      "broad heuristic selector repair beyond documented migrations",
      "automatic migration of legacy numeric selectors",
      "general-purpose vertex or free-point direct-pick ids"
    ]
  }
}
```

Notes:
- `featureStages` includes an explicit `stage` entry for every `featureKinds` item.
- Additional keys may appear for mode-specific variants (for example `feature.extrude:mode.surface`).
- `optionalFeatures.assembly.solve` indicates endpoint availability only; it does
  not promote assembly solve to a stable contract tier by itself.
- Assembly solve remains dependent on stable part-level connector resolution and
  semantic references from part builds.
- `errorContract` publishes the stable programmatic error-code surface for
  runtime and selector failures.
- `semanticTopology` is the capability/version signal for direct-pick semantic
  selection ids in the beta contract.

## Semantic Topology Capability Contract
The runtime publishes semantic-topology support through
`/v1/capabilities.semanticTopology`.

Client rules:
- Treat `semanticTopology.enabled` and `semanticTopology.contractVersion` as the
  gating signal for direct-pick semantic-id flows.
- Persist the full emitted `selection.id` token exactly as returned.
- Use `selection.meta` fields such as `selectionSlot`, `selectionLineage`, or
  `adjacentFaceSlots` for display or diagnostics only.
- Do not synthesize new ids from metadata.

Selection transport rules:
- `result.selections` is the canonical build-result index of ids by kind across
  the full final selection set for the build.
- `result.mesh.asset.selections` reuses those same canonical ids, but scopes the
  list to the requested output mesh.
- When the same topology appears in both payloads, mesh selection ids must be a
  subset of the ids exposed in `result.selections`.

## Stable Error Contract
The runtime uses the same structured error envelope across sync HTTP failures
and async job failures.

Programmatic rules:
- Key client behavior off `error.code`.
- Treat `error.message` as diagnostic text, not as a stable matching surface.
- Expect selector failures to use the explicit `selector_*` codes published in
  `/v1/capabilities.errorContract.selectorCodes`.

Reference docs:
- Beta scope matrix:
  [specs/semantic-topology-beta-scope-2026-03-02.md](/home/eveber/code/trueform/specs/semantic-topology-beta-scope-2026-03-02.md)
- Canonical runtime fixtures:
  [specs/semantic-topology-runtime-fixtures-2026-03-02.md](/home/eveber/code/trueform/specs/semantic-topology-runtime-fixtures-2026-03-02.md)

## Health
`GET /v1/health`

Response:
```json
{
  "status": "ok",
  "apiVersion": "1.2",
  "tenantId": "public",
  "timestamp": "2026-02-21T12:00:00.000Z",
  "uptimeMs": 1642,
  "dependencies": {
    "opencascade": {
      "ready": true,
      "error": null
    }
  },
  "backend": {
    "ready": true,
    "fingerprint": "opencascade.js:40ab6a2ac9e6f6f9"
  },
  "queue": {
    "queued": 0,
    "running": 0,
    "succeeded": 2,
    "failed": 0,
    "canceled": 0
  }
}
```

## Build
`POST /v1/build`
`POST /v1/build/partial`

Request:
```json
{
  "irVersion": "1.0",
  "document": { /* DocumentIR or PartIR */ },
  "params": { "thickness": 6 },
  "units": "mm",
  "partial": {
    "changedFeatureIds": ["extrude-1"],
    "selectorHints": { "body:main": { "kind": "solid" } }
  },
  "options": {
    "validationMode": "default",
    "stagedFeatures": "error",
    "meshProfile": "interactive"
  }
}
```

Response:
```json
{
  "id": "job_123",
  "jobId": "job_123",
  "state": "queued"
}
```

Job result (`GET /v1/jobs/:id`):
```json
{
  "id": "job_123",
  "jobId": "job_123",
  "state": "succeeded",
  "result": {
    "buildId": "build_456",
    "partId": "plate",
    "featureOrder": ["sketch-1", "extrude-1"],
    "outputs": {
      "body:main": {
        "kind": "solid",
        "selectionId": "solid:body.main~base.seed"
      }
    },
    "selections": {
      "faces": ["face:body.main~base.top", "face:body.main~base.bottom"],
      "edges": [
        "edge:body.main~base.loop.1",
        "edge:body.main~base.loop.2"
      ],
      "points": [
        "face:body.main~base.top.point.center",
        "edge:body.main~base.loop.1.point.mid"
      ]
    },
    "mesh": {
      "profile": "interactive",
      "asset": { "url": "/v1/assets/mesh/mesh_789" }
    },
    "metadata": {
      "bounds": [[0,0,0],[100,60,6]]
    }
  },
  "error": null
}
```

Build result notes:
- `outputs.*.selectionId` and `selections.*` are stable semantic reference tokens,
  not raw kernel traversal ids.
- Tokens should be derived from semantic ownership and producer context where
  possible (`<kind>:<owner>~<feature>.<slot-or-fallback>`).
- If a semantic slot cannot be named directly, the runtime may use a deterministic
  fallback suffix, but the full token remains the canonical stable id.
- `selections.points` is an additive index of derived point anchors. These are
  stable point-reference tokens built from semantic parent geometry plus a
  locator suffix (`.point.center`, `.point.mid`, `.point.start`, `.point.end`).
- Clients may round-trip these tokens for inspection and HUD workflows, but
  authoring flows should still prefer datums, selectors, and named outputs.

## Measure
`POST /v1/measure`

Request:
```json
{
  "buildId": "build_456",
  "target": "face:body.main~base.top"
}
```

Response:
```json
{
  "target": "face:body.main~base.top",
  "metrics": [
    { "kind": "area", "value": 314.159, "unit": "mm^2", "label": "area" },
    { "kind": "radius", "value": 10, "unit": "mm", "label": "radius" },
    { "kind": "distance", "value": 20, "unit": "mm", "label": "diameter" }
  ]
}
```

Notes:
- `target` accepts runtime output names (for example `body:main`) or stable
  semantic selection ids (for example `face:body.main~base.top`).
- Raw numeric topology ids (for example `face:12`, `edge:4`) are not part of the
  stable client contract.
- The endpoint is synchronous and intended for HUD/inspection interactions.
- Availability is explicitly gated by `/v1/capabilities.optionalFeatures.measure.endpoint`.

## Mesh (direct)
`POST /v1/mesh`

Request:
```json
{
  "buildId": "build_456",
  "target": "body:main",
  "profile": "interactive",
  "options": {
    "includeEdges": true,
    "hideTangentEdges": true,
    "edgeSegmentLength": 2
  }
}
```

Response:
```json
{
  "id": "job_124",
  "jobId": "job_124",
  "state": "queued"
}
```

Job result provides `asset.url` for the mesh.

## Export
`POST /v1/export/step`
`POST /v1/export/stl`

Request:
```json
{
  "buildId": "build_456",
  "target": "body:main",
  "options": { "schema": "AP242", "unit": "mm" }
}
```

Response:
```json
{ "id": "job_200", "jobId": "job_200", "state": "queued" }
```

Job result returns `asset.url` for the binary export.

## Mirror/Pattern Runtime Payload Variants
Mirror and pattern intent should be sent using the same naming as the DSL/IR:

- Mirror:
  - `kind: "feature.mirror"`
  - `source`: selector (typically `selector.named("body:...")`)
  - `plane`: `plane.datum(...)` or selector-backed plane ref
  - `result`: output name
- Pattern layout-only:
  - `kind: "pattern.linear"` with `origin`, `spacing`, `count`
  - `kind: "pattern.circular"` with `origin`, `axis`, `count`
  - consumed later by `feature.hole.pattern`
- Pattern feature/body replication:
  - same as above plus `source` selector and `result` output name

Diagnostics expectations for broken references:
- missing pattern refs should report `code: "pattern_missing"` with
  `error.details.featureId` and `error.details.referenceId`.
- missing named outputs should report `code: "selector_named_missing"` with
  `error.details.featureId` and `error.details.referenceId`.
- legacy numeric ids such as `face:42` / `edge:7` should report
  `code: "selector_legacy_numeric_unsupported"` with a migration hint toward
  stable selection ids or semantic selectors.

## Plane Selector Contract (`feature.plane.plane`)
`feature.plane.plane` accepts:

- `{"kind":"plane.datum","ref":"<datum-id>"}` for explicit datum references.
- selector payloads (`selector.face`, `selector.named`) that resolve to planar faces.
- canonical named aliases via `selector.named`: `Top`, `Bottom`, `Front`, `Back`, `Right`, `Left`.
- named datum ids via `selector.named("<datum-id>")` (runtime maps to `datum:<datum-id>`).
- durable face ids emitted by build results. Legacy numeric ids
  (`face:<number>`) are unsupported and non-persistent.
- stable selection ids include an owner token plus a producer token
  (`face:<owner>~<feature>.<slot-or-fallback>`), which allows clients and the
  compiler to preserve references without relying on traversal order. The
  `<owner>` token is a lookup namespace hint, not the canonical identity key:
  alias-only owner changes must not invalidate an otherwise still-unique stable
  id when the producer token and subshape slot still resolve deterministically.
- semantic ids can include feature-derived slots, not only hashes. Examples:
  - `face:body.main~base.top`
  - `face:body.main~union-1.right.side.1`
  - `face:body.main~subtract-1.cut.bottom`
  - `face:body.main~intersect-1.side.1`
  - `edge:body.main~union-1.right.side.1.bound.top`
  - `edge:body.main~edge-fillet.fillet.seed.1.bound.top`
  - `edge:body.main~edge-chamfer.chamfer.seed.1.join.chamfer.seed.2`
  - `edge:body.main~subtract-1.cut.bottom.join.cut.side.1`
- when an output cannot be named semantically, runtime falls back to a
  deterministic hashed suffix. Clients should still treat the full id as the
  canonical stable token.

## Modifier Named Outputs
`feature.hole`, `feature.fillet`, and `feature.chamfer` accept optional `result` names.

- When `result` is provided, the modified body is published under that name.
- When omitted, runtime preserves the owner output key behavior for backward compatibility.
- Downstream `selector.named(...)` references to modifier outputs should target explicit `result` names for deterministic graph dependency inference.

## Semantic Descendant Edge IDs
Modifier features can emit semantic descendant edge ids for newly created final
topology. External services should use these ids exactly as returned by build
results, typically by passing them back through `selector.named(...)`.

- `*.bound.<face-slot>`
  - Means the descendant edge lies between the modifier-created face and a
    preserved neighboring face.
  - Example:
    `edge:body.main~edge-fillet.fillet.seed.1.bound.top`
- `*.join.<other-modifier-slot>`
  - Means the descendant edge lies between two modifier-created faces.
  - Example:
    `edge:body.main~edge-chamfer.chamfer.seed.1.join.chamfer.seed.2`
- `*.seam`
  - Means the descendant edge is a seam-like edge on a modifier-created face
    (common on periodic geometry such as cylindrical or toroidal blends).
  - Example:
    `edge:body.main~edge-fillet.fillet.seed.1.seam`
- `*.end.<n>`
  - Means the descendant edge belongs to the modifier-created family but is not
    yet classified as a preserved-face boundary or a modifier-to-modifier join.
  - This is still deterministic, but semantically weaker than `bound.*`,
    `join.*`, or `seam`.
- `*.edge.<n>`
  - Deterministic fallback for a descendant edge that is real and stable but
    predates richer semantic classification.

Related metadata on emitted edge selections:
- `selectionSlot`
  - The semantic slot portion used in the canonical id when available.
- `selectionLineage`
  - Provenance such as `{ "kind": "modified", "from": "<source-edge-id>" }`.
- `adjacentFaceSlots`
  - The neighboring face slots used to classify boundary/join edges.

Client guidance:
- Prefer the full emitted id as the canonical reference token.
- You may inspect `selectionSlot`, `selectionLineage`, and `adjacentFaceSlots`
  for UI or auditing, but do not reconstruct ids yourself.
- Treat `*.bound.*`, `*.join.*`, and `*.seam` as stronger semantic anchors than
  `*.end.<n>`, and treat `*.end.<n>` as stronger than legacy `*.edge.<n>`
  fallback ids.

## Boolean Subtract Semantic Cut IDs
`feature.boolean` with `op: "subtract"` can emit semantic `cut.*` slots for
tool-derived cavity faces and their descendant edges.

- Face examples:
  - `face:body.main~subtract-1.top`
  - `face:body.main~subtract-1.cut.bottom`
  - `face:body.main~subtract-1.cut.side.1`
- Edge examples:
  - `edge:body.main~subtract-1.cut.side.1.bound.top`
  - `edge:body.main~subtract-1.cut.bottom.join.cut.side.1`
  - `edge:body.main~subtract-1.cut.side.1.join.cut.side.2`
- `cut.*` ids are emitted only when runtime can justify the mapping from the
  subtract tool's semantic face slots. Remaining boolean topology may still use
  deterministic hashed fallback ids.

## Boolean Union Semantic Face IDs
`feature.boolean` with `op: "union"` can preserve semantic face slots from both
operands. When both operands contribute the same slot name, the right operand is
disambiguated with a `right.` prefix.

- Face examples:
  - `face:body.main~union-1.bottom`
  - `face:body.main~union-1.top`
  - `face:body.main~union-1.side.1`
  - `face:body.main~union-1.right.side.1`
- Edge examples:
  - `edge:body.main~union-1.right.side.1.bound.top`
  - `edge:body.main~union-1.right.side.1.join.right.side.2`
- This keeps the left operand on the canonical slot name and avoids unstable
  tie-suffixed ids such as `side.1.1` / `side.1.2`.

## Boolean Intersect Semantic Face IDs
`feature.boolean` with `op: "intersect"` can preserve semantic face slots for
overlap faces when runtime can justify the mapping back to one operand face.

- Face examples:
  - `face:body.main~intersect-1.top`
  - `face:body.main~intersect-1.bottom`
  - `face:body.main~intersect-1.side.1`
- Edge examples:
  - `edge:body.main~intersect-1.side.1.bound.top`
  - `edge:body.main~intersect-1.side.1.bound.bottom`
- In simple overlap cases, intersect results can keep the canonical face slot
  names instead of falling back to hashed ids.

## Stable Payload Fixtures
Mirror fixture:
```json
{
  "kind": "feature.mirror",
  "id": "mirror-1",
  "source": { "kind": "selector.named", "name": "body:seed" },
  "plane": { "kind": "plane.datum", "ref": "mirror-plane" },
  "result": "body:mirror"
}
```

Linear pattern (feature/body) fixture:
```json
{
  "kind": "pattern.linear",
  "id": "pattern-f",
  "origin": { "kind": "selector.named", "name": "face:top" },
  "spacing": [14, 0],
  "count": [3, 1],
  "source": { "kind": "selector.named", "name": "body:seed" },
  "result": "body:patterned"
}
```

Circular pattern (layout) fixture:
```json
{
  "kind": "pattern.circular",
  "id": "pattern-c",
  "origin": { "kind": "selector.named", "name": "face:top" },
  "axis": "+Z",
  "count": 6
}
```

## Assets
`GET /v1/assets/mesh/:id`
`GET /v1/assets/export/:id`

- Mesh assets are JSON.
- Export assets are binary.

Mesh payload (matches viewer expectations):
```json
{
  "positions": [0,0,0, 1,0,0, 1,1,0],
  "indices": [0,1,2],
  "normals": [0,0,1, 0,0,1, 0,0,1],
  "edgePositions": [0,0,0, 1,0,0],
  "edgeIndices": [0],
  "edgeSelectionIndices": [3]
}
```

`edgeIndices` is optional. When present, each entry maps the corresponding
edge segment in `edgePositions` (6 numbers per segment) to the raw edge-occurrence
index emitted by the backend edge traversal. These values can repeat the same
semantic edge across multiple traversal occurrences.

`edgeSelectionIndices` is optional. When present, it is the same length as
`edgeIndices` and maps each rendered edge segment to the corresponding index in
the same mesh asset's `selections` array. A value of `-1` means that segment did
not resolve to a scoped semantic edge selection.

## Selection Metadata Contract
Selections are backend-agnostic and must provide required metadata keys.

Required keys by kind:
- `face`: `center`, `area`, `planar`, `createdBy`, `ownerKey`
- `edge`: `center`, `createdBy`, `ownerKey`
- `solid`: `center`, `createdBy`, `ownerKey`

Optional keys:
- `normal`, `normalVec`, `featureTags`, `role`, `surfaceType`, `radius`, `length`
- edge geometry helpers when available:
  - `startPoint`, `endPoint`, `midPoint`
  - `curveCenter` for circular edges
  - `closedEdge`
  - `backendEdgeIndices` to list the raw backend edge-occurrence indices in the
    same index space used by `edgeIndices`
- `pointAnchors`
  - Structured point locators derived from the parent semantic selection.
  - This is additive selection metadata, not a new top-level selection kind.
  - Shape:
    ```json
    {
      "center": {
        "id": "face:body.main~base.top.point.center",
        "sourceId": "face:body.main~base.top",
        "locator": "center",
        "at": [0, 0, 10]
      },
      "mid": {
        "id": "edge:body.main~base.side.1.point.mid",
        "sourceId": "edge:body.main~base.side.1",
        "locator": "mid",
        "at": [10, 0, 5]
      }
    }
    ```
  - Applications can use these anchors for UI/discovery, but authored refs
    should still be expressed as `refPoint(selectorNamed("<sourceId>"), "<locator>")`
    so intent stays attached to the parent semantic selection.
  - Clients may also round-trip an emitted anchor id directly via
    `refPoint(selectorNamed("<sourceId>.point.<locator>"))`. This is still
    resolved through the parent semantic selection; runtime does not expose a
    separate top-level `point` selection kind.

Selection metadata is exposed to the client only for selectors and debug overlays.

## Streaming (Optional)
`GET /v1/jobs/:id/stream`
- Server-sent events (SSE) or chunked JSON lines.
- Used for progressive mesh updates and progress reporting.

## OpenAPI
`GET /v1/openapi.json`

- Returns the OpenAPI 3.1 contract for `/v1` endpoints.

## Machine-Readable Feature Payload Schemas
- Authoritative IR payload schema: `src/ir_schema.ts` (`IR_SCHEMA`).
- Per-feature payload contracts are defined in `IR_SCHEMA.$defs` entries with `kind.const` values
  (for example `feature.pipe`, `feature.pipeSweep`, `feature.split.body`, `feature.thicken`).
- Clients that need strict form validation should consume `IR_SCHEMA` (or generated JSON) instead of relying on examples-only inference.

## Multi-Tenant Considerations
- Job requests include tenant/user context from auth.
- Enforce quotas on CPU time, memory, and storage per tenant.
- Store assets in tenant-isolated namespaces.

## Open Source Friendly Defaults
- All endpoints can run in a single-process mode for local usage.
- Asset storage can default to local disk for OSS deployments.
- The contract remains stable for SaaS builders to extend.
