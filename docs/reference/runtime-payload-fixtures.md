# Runtime Payload Fixtures

Stable fixtures for UI/runtime integration tests.

## Mirror

```json
{
  "kind": "feature.mirror",
  "id": "mirror-1",
  "source": { "kind": "selector.named", "name": "body:seed" },
  "plane": { "kind": "plane.datum", "ref": "mirror-plane" },
  "result": "body:mirror"
}
```

## Pattern Linear (Feature/Body Replication)

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

## Pattern Circular (Layout-Only)

```json
{
  "kind": "pattern.circular",
  "id": "pattern-c",
  "origin": { "kind": "selector.named", "name": "face:top" },
  "axis": "+Z",
  "count": 6
}
```

## Chamfer with Named Result (Modifier Output)

```json
{
  "kind": "feature.chamfer",
  "id": "chamfer-1",
  "edges": {
    "kind": "selector.edge",
    "predicates": [{ "kind": "pred.createdBy", "featureId": "base" }],
    "rank": [{ "kind": "rank.maxZ" }]
  },
  "distance": 1,
  "result": "body:chamfer-1"
}
```

## Plane Reference (Named Alias)

```json
{
  "kind": "feature.plane",
  "id": "plane-top",
  "width": 20,
  "height": 10,
  "plane": { "kind": "selector.named", "name": "Top" },
  "result": "surface:top"
}
```

## Plane Reference (Named Datum Id)

```json
{
  "kind": "feature.plane",
  "id": "plane-from-datum",
  "width": 20,
  "height": 10,
  "plane": { "kind": "selector.named", "name": "datum-plane-1" },
  "result": "surface:datum"
}
```

## Measure Request/Response

```json
{
  "buildId": "build_456",
  "target": "face:1"
}
```

```json
{
  "target": "face:1",
  "metrics": [
    { "kind": "area", "value": 314.159, "unit": "mm^2", "label": "area" },
    { "kind": "radius", "value": 10, "unit": "mm", "label": "radius" },
    { "kind": "distance", "value": 20, "unit": "mm", "label": "diameter" }
  ]
}
```
