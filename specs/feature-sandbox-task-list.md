# Feature Sandbox Task List

Status: active narrow backlog
Updated: 2026-03-13
Owner: geometry/core

Purpose: track the remaining sandbox follow-up work that is not already better
owned by the broader parity plan.

Related:
- `specs/geometric-parity-plan.md` - overall parity milestones and promotion flow
- `specs/feature-staging.md` - staging policy and current feature maturity

## Shipped Scope Summary

The requested sandbox scope is already present for:

- sketch
- extrude
- revolve
- sweep
- loft
- fillet
- chamfer
- boolean
- pattern (linear/circular layout and source-solid replication)
- mirror
- shell
- draft
- reference geometry (datum plane/axis/frame plus selector-based references)

The original `feature.draft` implementation track is complete; remaining work is
follow-up hardening only.

## Outstanding Work

1. Extend pattern source support beyond solids.
- Add surface and face replication semantics only if the selector contract can
  stay deterministic.

2. Add negative-path draft tests.
- Cover invalid selector kinds, extreme angles, and mismatched source owners.

3. Add negative-path feature-pattern tests.
- Cover missing result source, invalid source kind, and zero or negative counts.

## Rule

If a task changes feature maturity or parity state, track the promotion outcome
in `specs/geometric-parity-plan.md` and `specs/feature-staging.md` rather than
expanding this file into another broad tracker.
