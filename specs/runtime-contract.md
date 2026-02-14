# Runtime Contract (Draft v0)

This document defines the initial HTTP/JSON contract for TrueForm webapp usage.
It prioritizes interactive modeling, async jobs, and backend-agnostic selectors.

## Goals
- Support interactive modeling via fast mesh delivery and progressive refinement.
- Keep B-Rep exclusively on the server (no kernel objects sent to the browser).
- Make the client and server backend-agnostic (OCCT.js and native OCCT can both serve this contract).
- Enable multi-tenant SaaS while remaining OSS-friendly.

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
  "featureKinds": ["feature.extrude", "feature.loft"],
  "featureStages": {
    "feature.thread": {
      "stage": "staging",
      "notes": "Modelled thread output is still under active geometry tuning."
    },
    "feature.surface": {
      "stage": "staging",
      "notes": "Surface workflows are supported but still maturing for reliability."
    }
  },
  "exports": { "step": true, "stl": true },
  "mesh": true,
  "assertions": ["assert.brepValid"],
  "optionalFeatures": {
    "partialBuild": {
      "endpoint": true,
      "execution": "hinted_full_rebuild"
    },
    "buildSessions": { "enabled": false },
    "assembly": { "solve": false, "preview": false, "validate": false },
    "bom": { "derive": false },
    "release": { "preflight": false, "bundle": false },
    "pmi": { "stepAp242": false, "supportMatrix": false },
    "featureStaging": { "registry": true }
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
        "selectionId": "solid:1"
      }
    },
    "selections": {
      "faces": ["face:1", "face:2"],
      "edges": ["edge:1", "edge:2"]
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
  "edgePositions": [0,0,0, 1,0,0]
}
```

## Selection Metadata Contract
Selections are backend-agnostic and must provide required metadata keys.

Required keys by kind:
- `face`: `center`, `area`, `planar`, `createdBy`, `ownerKey`
- `edge`: `center`, `createdBy`, `ownerKey`
- `solid`: `center`, `createdBy`, `ownerKey`

Optional keys:
- `normal`, `normalVec`, `featureTags`, `role`

Selection metadata is exposed to the client only for selectors and debug overlays.

## Streaming (Optional)
`GET /v1/jobs/:id/stream`
- Server-sent events (SSE) or chunked JSON lines.
- Used for progressive mesh updates and progress reporting.

## OpenAPI
`GET /v1/openapi.json`

- Returns the OpenAPI 3.1 contract for `/v1` endpoints.

## Multi-Tenant Considerations
- Job requests include tenant/user context from auth.
- Enforce quotas on CPU time, memory, and storage per tenant.
- Store assets in tenant-isolated namespaces.

## Open Source Friendly Defaults
- All endpoints can run in a single-process mode for local usage.
- Asset storage can default to local disk for OSS deployments.
- The contract remains stable for SaaS builders to extend.
