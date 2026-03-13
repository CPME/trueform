import type { KernelResult, KernelSelection } from "../backend.js";
import type { Mirror, Selector } from "../ir.js";
import type { MirrorContext } from "./operation_contexts.js";
import { occtFeatureError } from "./feature_errors.js";
import { publishShapeResult } from "./shape_result.js";
import { mirrorShape } from "./transform_primitives.js";

export function execMirror(
  ctx: MirrorContext,
  feature: Mirror,
  upstream: KernelResult,
  resolve: (selector: Selector, upstream: KernelResult) => KernelSelection
): KernelResult {
  const target = resolve(feature.source, upstream);
  if (target.kind !== "solid" && target.kind !== "face" && target.kind !== "surface") {
    throw occtFeatureError(
      "occt_mirror_invalid_source",
      feature,
      "OCCT backend: mirror source must resolve to a solid, surface, or face"
    );
  }
  const shape = target.meta["shape"];
  if (!shape) {
    throw occtFeatureError(
      "occt_mirror_missing_shape",
      feature,
      "OCCT backend: mirror source missing shape metadata"
    );
  }

  const plane = ctx.resolvePlaneBasis(feature.plane, upstream, resolve);
  const mirrored = mirrorShape(ctx, shape, plane);
  const outputKind: "solid" | "face" | "surface" =
    target.kind === "solid" ? "solid" : target.kind === "surface" ? "surface" : "face";
  return publishShapeResult({
    shape: mirrored,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind,
    tags: feature.tags,
    opts: { rootKind: outputKind === "solid" ? "solid" : "face" },
    collectSelections: ctx.collectSelections,
  });
}
