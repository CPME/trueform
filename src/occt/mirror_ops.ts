import type { KernelResult, KernelSelection } from "../backend.js";
import type { Mirror, Selector } from "../ir.js";
import type { MirrorContext } from "./operation_contexts.js";
import { occtFeatureError } from "./feature_errors.js";
import { publishShapeResult } from "./shape_result.js";

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
  const origin = ctx.makePnt(plane.origin[0], plane.origin[1], plane.origin[2]);
  const normal = ctx.makeDir(plane.normal[0], plane.normal[1], plane.normal[2]);
  const xDir = ctx.makeDir(plane.xDir[0], plane.xDir[1], plane.xDir[2]);
  const ax2 = ctx.makeAx2WithXDir(origin, normal, xDir);
  const trsf = ctx.newOcct("gp_Trsf");
  ctx.callWithFallback(trsf, ["SetMirror", "SetMirror_1", "SetMirror_2", "SetMirror_3"], [[ax2]]);
  const builder = ctx.newOcct("BRepBuilderAPI_Transform", shape, trsf, true);
  ctx.tryBuild(builder);
  const mirrored = ctx.readShape(builder);
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
