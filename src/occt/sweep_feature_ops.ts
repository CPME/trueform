import type { KernelResult } from "../backend.js";
import type { HexTubeSweep, PipeSweep } from "../ir.js";
import type { SweepFeatureContext } from "./operation_contexts.js";
import { expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";

type SweepResultKind = "solid" | "surface";

function publishSweepResult(
  ctx: SweepFeatureContext,
  feature: PipeSweep | HexTubeSweep,
  shape: unknown,
  outputKind: SweepResultKind
): KernelResult {
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

function resolveSweepPlane(
  ctx: SweepFeatureContext,
  feature: PipeSweep | HexTubeSweep
): { spine: unknown; plane: ReturnType<SweepFeatureContext["planeBasisFromNormal"]> } {
  const spine = ctx.buildPathWire(feature.path);
  const { start, tangent } = ctx.pathStartTangent(feature.path);
  const axis = normalizeVector(tangent);
  if (!isFiniteVec(axis)) {
    const label = feature.kind === "feature.pipeSweep" ? "pipe sweep" : "hex tube sweep";
    throw new Error(`OCCT backend: ${label} path tangent is degenerate`);
  }
  return { spine, plane: ctx.planeBasisFromNormal(start, axis) };
}

export function execPipeSweep(
  ctx: SweepFeatureContext,
  feature: PipeSweep
): KernelResult {
  const outerDia = expectNumber(feature.outerDiameter, "pipe sweep outerDiameter");
  const innerDia =
    feature.innerDiameter === undefined
      ? 0
      : expectNumber(feature.innerDiameter, "pipe sweep innerDiameter");
  const outerRadius = outerDia / 2;
  const innerRadius = innerDia / 2;
  if (outerRadius <= 0) {
    throw new Error("OCCT backend: pipe sweep outer diameter must be positive");
  }
  if (innerRadius < 0) {
    throw new Error("OCCT backend: pipe sweep inner diameter must be non-negative");
  }
  if (innerRadius > 0 && innerRadius >= outerRadius) {
    throw new Error(
      "OCCT backend: pipe sweep inner diameter must be smaller than outer diameter"
    );
  }

  const { spine, plane } = resolveSweepPlane(ctx, feature);
  const mode = feature.mode ?? "solid";
  if (mode === "surface") {
    const outerEdge = ctx.makeCircleEdge(plane.origin, outerRadius, plane.normal);
    const outerWire = ctx.makeWireFromEdges([outerEdge]);
    const shape = ctx.makePipeSolid(spine, outerWire, plane, {
      makeSolid: false,
      allowFallback: false,
    });
    return publishSweepResult(ctx, feature, shape, "surface");
  }

  let solid: unknown;
  try {
    const outerFace = ctx.makeRingFace(plane.origin, plane.normal, outerRadius, 0);
    const outerShape = ctx.makePipeSolid(spine, outerFace, plane, { makeSolid: true });
    if (innerRadius > 0) {
      const innerFace = ctx.makeRingFace(plane.origin, plane.normal, innerRadius, 0);
      const innerShape = ctx.makePipeSolid(spine, innerFace, plane, { makeSolid: true });
      solid = ctx.readShape(ctx.makeBoolean("cut", outerShape, innerShape));
      solid = ctx.splitByTools(solid, [outerShape, innerShape]);
    } else {
      solid = outerShape;
    }
  } catch {
    throw new Error(
      "OCCT backend: pipe sweep failed to create solid; increase bend radius or reduce diameter"
    );
  }

  const solidCount = ctx.countSolids(solid);
  if (solidCount !== 1) {
    throw new Error(
      `OCCT backend: pipe sweep must produce exactly one solid; got ${solidCount}`
    );
  }
  solid = ctx.normalizeSolid(solid);
  if (!ctx.isValidShape(solid)) {
    throw new Error(
      "OCCT backend: pipe sweep failed to create solid; increase bend radius or reduce diameter"
    );
  }
  return publishSweepResult(ctx, feature, solid, "solid");
}

export function execHexTubeSweep(
  ctx: SweepFeatureContext,
  feature: HexTubeSweep
): KernelResult {
  const outerAcross = expectNumber(
    feature.outerAcrossFlats,
    "hex tube sweep outerAcrossFlats"
  );
  const innerAcross =
    feature.innerAcrossFlats === undefined
      ? 0
      : expectNumber(feature.innerAcrossFlats, "hex tube sweep innerAcrossFlats");
  if (outerAcross <= 0) {
    throw new Error("OCCT backend: hex tube sweep outerAcrossFlats must be positive");
  }
  if (innerAcross < 0) {
    throw new Error("OCCT backend: hex tube sweep innerAcrossFlats must be non-negative");
  }
  if (innerAcross > 0 && innerAcross >= outerAcross) {
    throw new Error(
      "OCCT backend: hex tube sweep innerAcrossFlats must be smaller than outerAcrossFlats"
    );
  }

  const { spine, plane } = resolveSweepPlane(ctx, feature);
  const outerRadius = outerAcross / Math.sqrt(3);
  const innerRadius = innerAcross / Math.sqrt(3);
  const outerPoints = ctx.regularPolygonPoints(
    plane.origin,
    plane.xDir,
    plane.yDir,
    outerRadius,
    6
  );
  const mode = feature.mode ?? "solid";
  if (mode === "surface") {
    const outerWire = ctx.makePolygonWire(outerPoints);
    const shape = ctx.makePipeSolid(spine, outerWire, plane, {
      makeSolid: false,
      allowFallback: false,
    });
    return publishSweepResult(ctx, feature, shape, "surface");
  }

  const outerWire = ctx.makePolygonWire(outerPoints);
  const faceBuilder = ctx.makeFaceFromWire(outerWire) as {
    Add?: (wire: unknown) => void;
    add?: (wire: unknown) => void;
  };
  if (innerRadius > 0) {
    const innerPoints = ctx
      .regularPolygonPoints(plane.origin, plane.xDir, plane.yDir, innerRadius, 6)
      .reverse();
    const innerWire = ctx.makePolygonWire(innerPoints);
    if (typeof faceBuilder.Add === "function") {
      faceBuilder.Add(innerWire);
    } else if (typeof faceBuilder.add === "function") {
      faceBuilder.add(innerWire);
    } else {
      throw new Error("OCCT backend: face builder missing Add()");
    }
  }
  const face = ctx.readFace(faceBuilder);
  let solid = ctx.makePipeSolid(spine, face, plane, { makeSolid: true });
  solid = ctx.normalizeSolid(solid);
  return publishSweepResult(ctx, feature, solid, "solid");
}
