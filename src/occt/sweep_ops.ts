import type { KernelResult, KernelSelection } from "../backend.js";
import type { Selector, Sweep } from "../ir.js";
import type { SweepContext } from "./operation_contexts.js";
import { publishShapeResult } from "./shape_result.js";

export function execSweep(
  ctx: SweepContext,
  feature: Sweep,
  upstream: KernelResult,
  resolve: (selector: Selector, upstream: KernelResult) => KernelSelection
): KernelResult {
  const profile = ctx.resolveProfile(feature.profile, upstream);
  const { wire, closed } = ctx.buildProfileWire(profile);
  const spine = ctx.buildPathWire(feature.path);
  const frame = feature.frame
    ? ctx.resolvePlaneBasis(feature.frame, upstream, resolve)
    : undefined;
  const frenet = feature.orientation === "frenet" ? true : undefined;

  const mode = feature.mode;
  const makeSolid = mode === "solid" ? true : mode === "surface" ? false : closed;
  if (makeSolid && !closed) {
    throw new Error("OCCT backend: sweep solid requires a closed profile");
  }

  let shape: unknown;
  let outputKind: "solid" | "surface";
  if (makeSolid) {
    const face = ctx.buildProfileFace(profile);
    shape = frame
      ? ctx.makePipeSolid(spine, face, frame, { makeSolid: true, frenet })
      : ctx.makePipeSolid(spine, face, { makeSolid: true, frenet });
    outputKind = "solid";
  } else {
    shape = frame
      ? ctx.makePipeSolid(spine, wire, frame, {
          makeSolid: false,
          frenet,
        })
      : ctx.makePipeSolid(spine, wire, { makeSolid: false, frenet });
    outputKind = "surface";
  }

  return publishShapeResult({
    shape,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind,
    tags: feature.tags,
    opts: { rootKind: outputKind === "solid" ? "solid" : "face" },
    collectSelections: ctx.collectSelections,
  });
}
