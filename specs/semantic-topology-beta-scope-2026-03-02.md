# Semantic Topology Beta Scope

This is the mechanical TrueForm-side support matrix for the `beta-2026-03-14`
semantic-topology contract exposed by `/v1/capabilities.semanticTopology`.

## Supported

| Area | Status | Notes |
| --- | --- | --- |
| Primary prismatic face ids | Supported | Direct-pick face ids for canonical slots such as `top`, `bottom`, and `side.<n>`. |
| Primary prismatic edge ids | Supported | Direct-pick edge ids when a deterministic semantic slot exists. |
| Split face slot families | Supported | Conservative rebinding covers plain slot `<->` `split.*.branch.*` migrations. |
| Fillet/chamfer edge families | Supported | Stable `bound`, `join`, `seam`, and deterministic fallback edge families. |
| Boolean subtract face ids | Supported | Includes `cut.*` cavity faces when the tool-face mapping is justified. |
| Boolean subtract edge ids | Supported | Includes `cut.*.bound.*` and `cut.*.join.*` edge families when the adjacent-face mapping is justified. |
| Boolean union face ids | Supported | Preserves left operand slots and disambiguates overlapping right operand slots with `right.` prefixes. |
| Boolean union edge ids | Supported | Emits semantic edge ids when exactly two semantic adjacent face slots are available. |
| Boolean intersect face ids | Supported | Preserves semantic overlap face slots in simple overlap cases. |
| Boolean intersect edge ids | Supported | Emits semantic edge ids from adjacent semantic overlap faces. |
| Direct-pick point anchors derived from face/edge selections | Supported | Exposed as `pointAnchors` metadata attached to the face or edge selection. |

## Supported With Explicit Limits

| Area | Limit | Notes |
| --- | --- | --- |
| Selector rebinding | Conservative only | Only documented semantic migrations are repaired. |
| Mesh selections | Requested output only | Mesh payload selections are a scoped subset of build-result selections. |
| Hash-shaped canonical ids | Partial | Still possible for creator families that do not yet publish strong semantic face slots. Persist them exactly as returned; do not treat them as aliases. |

## Not In Scope For This Beta Contract

| Area | Status | Notes |
| --- | --- | --- |
| Heuristic geometric selector repair | Not supported | No broad signature-guessing or nearest-geometry fallback. |
| Legacy numeric selector auto-migration | Not supported | Runtime emits `selector_legacy_numeric_unsupported`. |
| Legacy hash-alias selector auto-migration | Not supported | Semantic selections no longer emit or resolve legacy alias ids. |
| General-purpose vertex direct-pick ids | Not supported | Point anchors exist only as face/edge-derived metadata. |
| Arbitrary free-point direct-pick ids | Not supported | No standalone point topology contract yet. |
| Broad backward compatibility across future naming revisions | Not supported | Only the currently documented migration set is covered. |

## Client Rule

Persist the emitted `selection.id` value exactly as returned. Do not reconstruct
ids from `selectionSlot`, `selectionLineage`, `adjacentFaceSlots`, or mesh
topology ordering.
