# Native Parity And Package Completion Plan

Updated: 2026-03-13

## Goal

Finish the two remaining architecture tracks that still block the long-term
vision:

1. native OCCT becomes a first-class backend product contract rather than a
   thin transport shell
2. workspace packages become real ownership boundaries instead of transitional
   wrappers

## Native Backend Finish Plan

### Phase N1: Contract honesty

- publish explicit native capabilities from wrapper, transports, and native
  server
- enforce unsupported-feature failures from `buildPartAsync` using declared
  capabilities
- add focused capability and smoke-parity tests

Exit gate:
- native local, native HTTP, and native server all expose a stable
  `BackendCapabilities` payload
- unsupported features fail with `backend_unsupported_feature`

### Phase N2: Minimal feature baseline

- implement native-server support for low-complexity non-topology features
  first:
  - `datum.plane`
  - `datum.axis`
  - `datum.frame`
  - `feature.sketch2d` primitive-profile outputs
  - `feature.surface` for primitive/profile-ref flows
- keep capability list accurate to implemented kinds

Exit gate:
- native server can build datum-only parts and mixed datum + simple-solid parts
- live-server tests cover those paths

Status:
- current live-tested native baseline includes `datum.plane`, `datum.axis`,
  `datum.frame`, `feature.sketch2d`, `feature.surface`, `feature.plane`,
  `feature.extrude`, `feature.revolve`, `feature.pipe`, `feature.loft`, and
  `feature.sweep`

### Phase N3: Feature-port waves

- port features from the OCCT.js backend in dependency order:
  1. sketch/profile ownership
  2. base solids (`extrude`, `revolve`, `loft`, `sweep`, `pipe`)
  3. selectors/semantic-topology metadata parity
  4. modifiers/direct-edit operations
  5. surfacing and advanced profile ops

Exit gate:
- native feature list materially overlaps OCCT.js beyond a single base-solid
  path
- feature support is published by capability payload, not inferred from docs

### Phase N4: Dual-backend parity

- add explicit OCCT.js-vs-native parity tests for:
  - capabilities payloads
  - build-result output keys and ids
  - semantic selection ids and owner metadata
  - runtime error contract for unsupported workflows

Exit gate:
- backend drift fails tests directly instead of being discovered downstream

## Package Ownership Finish Plan

### Phase P1: Transitional workspace surfaces

- all target packages expose explicit entrypoints, typechecks, and parity tests

Status:
- completed for `tf-core`, `tf-dsl`, `tf-export`, `tf-api`,
  `tf-service-client`, `tf-backend-ocjs`, and `tf-backend-native`

### Phase P2: Package verification

- add one repeatable repo command that verifies workspace package typechecks and
  parity/entrypoint tests together

Exit gate:
- package-surface validation is a single command, not a manual checklist

### Phase P3: Real source ownership

- move actual implementation modules under package-local trees:
  - `tf-core`
  - `tf-dsl`
  - `tf-export`
  - `tf-backend-ocjs`
  - `tf-backend-native`
- keep root `trueform` as compatibility facade only

Exit gate:
- package source no longer points back into `src/*` for the owned layer

### Phase P4: Publishable package model

- make package manifests complete and consumer-oriented
- keep root `trueform` as compatibility package for at least one transition
  cycle

Exit gate:
- package layout matches `specs/packaging-split-timeline.md`

## Immediate Next Slices

1. broaden live native parity coverage beyond a single smoke e2e
2. move backend implementation ownership under package-local source trees
3. add selector/semantic-topology parity checks for native-server outputs
4. extend native support beyond primitive/profile-ref feature flows
