import type { KernelResult, KernelSelection } from "../backend.js";
import type { Selector, Sweep } from "../ir.js";
import type { SweepContext } from "./operation_contexts.js";

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

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape },
      },
    ],
  ]);
  const selections = ctx.collectSelections(shape, feature.id, feature.result, feature.tags, {
    rootKind: outputKind === "solid" ? "solid" : "face",
  });
  return { outputs, selections };
}
