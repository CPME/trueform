import type { KernelResult } from "../backend.js";
import type { Shell } from "../ir.js";
import type { ShellContext } from "./operation_contexts.js";
import { expectNumber } from "./vector_math.js";

export function execShell(
  ctx: ShellContext,
  feature: Shell,
  upstream: KernelResult
): KernelResult {
  const target = ctx.resolve(feature.source, upstream);
  if (target.kind !== "solid") {
    throw new Error("OCCT backend: shell source must resolve to a solid");
  }
  const shape = target.meta["shape"];
  if (!shape) {
    throw new Error("OCCT backend: shell source missing shape");
  }
  const thickness = expectNumber(feature.thickness, "feature.thickness");
  if (thickness <= 0) {
    throw new Error("OCCT backend: shell thickness must be positive");
  }
  const direction = feature.direction ?? "inside";
  const sign = direction === "outside" ? 1 : -1;
  const openFaces = feature.openFaces ?? [];
  const removeFaces: unknown[] = [];
  for (const selector of openFaces) {
    const faceTarget = ctx.resolve(selector, upstream);
    if (faceTarget.kind !== "face") {
      throw new Error("OCCT backend: shell open face must resolve to a face");
    }
    const faceShape = faceTarget.meta["shape"];
    if (!faceShape) {
      throw new Error("OCCT backend: shell open face missing shape");
    }
    removeFaces.push(faceShape);
  }

  const finalizeSolid = (inputShape: unknown) => {
    let solidShape = ctx.normalizeSolid(inputShape);
    if (!ctx.shapeHasSolid(solidShape)) {
      const stitched = ctx.makeSolidFromShells(solidShape);
      if (stitched) {
        solidShape = ctx.normalizeSolid(stitched);
      }
    }
    return solidShape;
  };

  let solid = finalizeSolid(ctx.makeThickSolid(shape, removeFaces, thickness * sign, 1e-6));
  if (!ctx.isValidShape(solid)) {
    const retry = finalizeSolid(
      ctx.makeThickSolid(shape, removeFaces, thickness * sign, 1e-6, {
        intersection: true,
        selfIntersection: true,
        removeInternalEdges: true,
      })
    );
    if (ctx.isValidShape(retry)) {
      solid = retry;
    }
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:solid`,
        kind: "solid" as const,
        meta: { shape: solid },
      },
    ],
  ]);
  const selections = ctx.collectSelections(solid, feature.id, feature.result, feature.tags, {
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(upstream, shape, []),
  });
  return { outputs, selections };
}
