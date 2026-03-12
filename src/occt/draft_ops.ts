import type { KernelResult, KernelSelection } from "../backend.js";
import type { Draft, Selector } from "../ir.js";
import { resolveSelectorSet } from "../selectors.js";
import type { DraftContext } from "./operation_contexts.js";
import { occtFeatureError } from "./feature_errors.js";
import { publishShapeResult } from "./shape_result.js";
import { expectNumber } from "./vector_math.js";

export function execDraft(
  ctx: DraftContext,
  feature: Draft,
  upstream: KernelResult,
  resolve: (selector: Selector, upstream: KernelResult) => KernelSelection
): KernelResult {
  const source = resolve(feature.source, upstream);
  if (source.kind !== "solid") {
    throw occtFeatureError(
      "occt_draft_invalid_source",
      feature,
      "OCCT backend: draft source must resolve to a solid"
    );
  }
  const ownerKey = ctx.resolveOwnerKey(source, upstream);
  const owner = ctx.resolveOwnerShape(source, upstream);
  if (!owner) {
    throw occtFeatureError(
      "occt_draft_missing_owner",
      feature,
      "OCCT backend: draft source missing owner solid"
    );
  }

  const faceTargets = resolveSelectorSet(feature.faces, ctx.toResolutionContext(upstream));
  if (faceTargets.length === 0) {
    throw occtFeatureError(
      "occt_draft_no_faces",
      feature,
      "OCCT backend: draft selector matched 0 faces"
    );
  }
  for (const target of faceTargets) {
    if (target.kind !== "face") {
      throw occtFeatureError(
        "occt_draft_invalid_face_selector",
        feature,
        "OCCT backend: draft selector must resolve to faces"
      );
    }
    const faceOwnerKey =
      typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : undefined;
    if (faceOwnerKey && faceOwnerKey !== ownerKey) {
      throw occtFeatureError(
        "occt_draft_foreign_face",
        feature,
        "OCCT backend: draft faces must belong to the same source solid"
      );
    }
  }

  const angle = expectNumber(feature.angle, "feature.angle");
  if (Math.abs(angle) < 1e-8 || Math.abs(angle) >= Math.PI / 2) {
    throw occtFeatureError(
      "occt_draft_invalid_angle",
      feature,
      "OCCT backend: draft angle must be non-zero and less than PI/2 in magnitude"
    );
  }

  const pullDirection = ctx.resolveAxisSpec(feature.pullDirection, upstream, "draft pull direction");
  const neutralBasis = ctx.resolvePlaneBasis(feature.neutralPlane, upstream, resolve);
  const neutralPlane = ctx.makePln(neutralBasis.origin, neutralBasis.normal);
  const pullDir = ctx.makeDir(pullDirection[0], pullDirection[1], pullDirection[2]);
  const draft = ctx.makeDraftBuilder(owner);

  for (const target of faceTargets) {
    const face = ctx.toFace(target.meta["shape"]);
    const added = (() => {
      try {
        ctx.callWithFallback(
          draft,
          ["Add", "Add_1"],
          [
            [face, pullDir, angle, neutralPlane, true],
            [face, pullDir, angle, neutralPlane, false],
            [face, pullDir, angle, neutralPlane],
          ]
        );
        return true;
      } catch {
        return false;
      }
    })();
    if (!added) {
      throw occtFeatureError(
        "occt_draft_add_face_failed",
        feature,
        "OCCT backend: failed to add draft face"
      );
    }
  }

  ctx.tryBuild(draft);
  const solid = ctx.readShape(draft);
  return publishShapeResult({
    shape: solid,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "solid",
    tags: feature.tags,
    opts: {
      ledgerPlan: ctx.makeDraftSelectionLedgerPlan(upstream, owner, faceTargets as KernelSelection[], draft),
    },
    collectSelections: ctx.collectSelections,
  });
}
