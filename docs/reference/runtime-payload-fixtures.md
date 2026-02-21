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
