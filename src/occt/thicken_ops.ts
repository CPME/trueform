import type { ExecuteInput, KernelResult } from "../backend.js";
import type { Thicken } from "../ir.js";
import type { ThickenContext } from "./operation_contexts.js";
import { dot, expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";

export function execThicken(
  ctx: ThickenContext,
  feature: Thicken,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"]
): KernelResult {
  const target = resolve(feature.surface, upstream);
  if (target.kind !== "face" && target.kind !== "surface") {
    throw new Error("OCCT backend: thicken target must resolve to a face or surface");
  }
  const shape = target.meta["shape"];
  if (!shape) {
    throw new Error("OCCT backend: thicken target missing shape");
  }
  const thickness = expectNumber(feature.thickness, "feature.thickness");
  if (thickness <= 0) {
    throw new Error("OCCT backend: thicken thickness must be positive");
  }
  const direction = feature.direction ?? "normal";
  const sign = direction === "reverse" ? -1 : 1;

  const planar =
    target.kind === "surface"
      ? false
      : typeof target.meta["planar"] === "boolean"
        ? (target.meta["planar"] as boolean)
        : ctx.faceProperties(shape).planar;

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

  let solid: unknown;
  const offset = thickness * sign;
  if (planar) {
    let normalVec = target.meta["normalVec"] as [number, number, number] | undefined;
    if (!normalVec) {
      try {
        normalVec = ctx.planeBasisFromFace(shape).normal;
      } catch {
        normalVec = undefined;
      }
    }
    if (!normalVec) {
      throw new Error("OCCT backend: thicken requires a planar face");
    }
    const vec = ctx.makeVec(normalVec[0] * offset, normalVec[1] * offset, normalVec[2] * offset);
    const prism = ctx.makePrism(shape, vec);
    solid = ctx.readShape(prism);
  } else {
    let analytic: unknown | null = null;
    const face = target.kind === "face" ? shape : ctx.firstFace(shape);
    if (face) {
      analytic = tryThickenCylindricalFace(ctx, face, offset);
    }
    solid = analytic ?? ctx.makeThickSolid(shape, [], offset, 1e-6);
  }
  solid = finalizeSolid(solid);
  if (!ctx.isValidShape(solid)) {
    const retry = finalizeSolid(
      ctx.makeThickSolid(shape, [], thickness * sign, 1e-6, {
        intersection: true,
        selfIntersection: true,
        removeInternalEdges: true,
      })
    );
    if (ctx.isValidShape(retry)) {
      solid = retry;
    }
  }
  if (!ctx.isValidShape(solid)) {
    const sewed = ctx.sewShapeFaces(solid);
    if (sewed) {
      const stitched = ctx.makeSolidFromShells(sewed);
      if (stitched && ctx.isValidShape(stitched)) {
        solid = ctx.normalizeSolid(stitched);
      }
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
  const selections = ctx.collectSelections(solid, feature.id, feature.result, feature.tags);
  return { outputs, selections };
}

function tryThickenCylindricalFace(
  ctx: ThickenContext,
  face: unknown,
  offset: number
): unknown | null {
  if (!Number.isFinite(offset) || offset === 0) return null;
  const cylinder = ctx.cylinderFromFace(face);
  if (!cylinder) return null;
  const axis = normalizeVector(cylinder.axis);
  if (!isFiniteVec(axis)) return null;
  const extents = ctx.cylinderVExtents(face, cylinder);
  if (!extents) return null;
  const min = Math.min(extents.min, extents.max);
  const max = Math.max(extents.min, extents.max);
  const height = max - min;
  if (!(height > 1e-6)) return null;
  const baseProj = dot(cylinder.origin, axis);
  const base = ctx.addVec(cylinder.origin, ctx.scaleVec(axis, min - baseProj));
  const r0 = cylinder.radius;
  const r1 = r0 + offset;
  const outer = Math.max(r0, r1);
  const inner = Math.min(r0, r1);
  if (!(outer > 0)) return null;
  const outerShape = ctx.readShape(ctx.makeCylinder(outer, height, axis, base));
  if (!(inner > 0)) {
    return outerShape;
  }
  const innerShape = ctx.readShape(ctx.makeCylinder(inner, height, axis, base));
  const cut = ctx.makeBoolean("cut", outerShape, innerShape);
  const result = ctx.readShape(cut);
  if (!ctx.isValidShape(result)) return null;
  return result;
}
