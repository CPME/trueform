import type { PlaneBasis } from "./plane_basis.js";

export type TransformPrimitiveContext = {
  callWithFallback: (target: unknown, methods: string[], argSets: unknown[][]) => unknown;
  makeAx1: (origin: unknown, axis: unknown) => unknown;
  makeAx2WithXDir: (origin: unknown, normal: unknown, xDir: unknown) => unknown;
  makeDir: (x: number, y: number, z: number) => unknown;
  makePnt: (x: number, y: number, z: number) => unknown;
  makeVec: (x: number, y: number, z: number) => unknown;
  newOcct: (name: string, ...args: unknown[]) => unknown;
  readShape: (shape: unknown) => unknown;
  tryBuild: (builder: unknown) => void;
};

type TransformBuilderContext = Pick<
  TransformPrimitiveContext,
  "callWithFallback" | "newOcct" | "readShape" | "tryBuild"
>;

function applyTransform(
  ctx: TransformBuilderContext,
  shape: unknown,
  configure: (trsf: unknown) => void
): unknown {
  const trsf = ctx.newOcct("gp_Trsf");
  configure(trsf);
  const builder = ctx.newOcct("BRepBuilderAPI_Transform", shape, trsf, true);
  ctx.tryBuild(builder);
  return ctx.readShape(builder);
}

export function transformShapeTranslate(
  ctx: TransformPrimitiveContext,
  shape: unknown,
  delta: [number, number, number]
): unknown {
  return applyTransform(ctx, shape, (trsf) => {
    const vec = ctx.makeVec(delta[0], delta[1], delta[2]);
    ctx.callWithFallback(trsf, ["SetTranslation", "SetTranslation_1", "SetTranslationPart"], [[vec]]);
  });
}

export function transformShapeScale(
  ctx: TransformPrimitiveContext,
  shape: unknown,
  origin: [number, number, number],
  factor: number
): unknown {
  return applyTransform(ctx, shape, (trsf) => {
    const pnt = ctx.makePnt(origin[0], origin[1], origin[2]);
    ctx.callWithFallback(trsf, ["SetScale", "SetScale_1"], [[pnt, factor]]);
  });
}

export function transformShapeRotate(
  ctx: TransformPrimitiveContext,
  shape: unknown,
  origin: [number, number, number],
  axis: [number, number, number],
  angle: number
): unknown {
  return applyTransform(ctx, shape, (trsf) => {
    const pnt = ctx.makePnt(origin[0], origin[1], origin[2]);
    const dir = ctx.makeDir(axis[0], axis[1], axis[2]);
    const ax1 = ctx.makeAx1(pnt, dir);
    ctx.callWithFallback(trsf, ["SetRotation", "SetRotation_1"], [[ax1, angle]]);
  });
}

export function mirrorShape(
  ctx: Pick<
    TransformPrimitiveContext,
    "callWithFallback" | "makeAx2WithXDir" | "makeDir" | "makePnt" | "newOcct" | "readShape" | "tryBuild"
  >,
  shape: unknown,
  plane: PlaneBasis
): unknown {
  return applyTransform(ctx, shape, (trsf) => {
    const origin = ctx.makePnt(plane.origin[0], plane.origin[1], plane.origin[2]);
    const normal = ctx.makeDir(plane.normal[0], plane.normal[1], plane.normal[2]);
    const xDir = ctx.makeDir(plane.xDir[0], plane.xDir[1], plane.xDir[2]);
    const ax2 = ctx.makeAx2WithXDir(origin, normal, xDir);
    ctx.callWithFallback(trsf, ["SetMirror", "SetMirror_1", "SetMirror_2", "SetMirror_3"], [[ax2]]);
  });
}
