import type { KernelResult } from "../backend.js";
import type { Rib, Web } from "../ir.js";
import type { ThinProfileContext } from "./operation_contexts.js";
import { cross, expectNumber, isFiniteVec, normalizeVector } from "./vector_math.js";

function execThinProfileFeature(
  kind: "rib" | "web",
  ctx: ThinProfileContext,
  feature: Rib | Web,
  upstream: KernelResult
): KernelResult {
  const profile = ctx.resolveProfile(feature.profile, upstream);
  if (profile.profile.kind !== "profile.sketch") {
    throw new Error(`OCCT backend: ${kind} requires a profile.sketch reference`);
  }
  if (profile.profile.open !== true) {
    throw new Error(`OCCT backend: ${kind} requires an open sketch profile`);
  }
  const { wire, closed } = ctx.buildProfileWire(profile);
  if (closed) {
    throw new Error(`OCCT backend: ${kind} profile must be open`);
  }

  const depth = expectNumber(feature.depth, `${kind} depth`);
  if (!(depth > 0)) {
    throw new Error(`OCCT backend: ${kind} depth must be positive`);
  }
  const thickness = expectNumber(feature.thickness, `${kind} thickness`);
  if (!(thickness > 0)) {
    throw new Error(`OCCT backend: ${kind} thickness must be positive`);
  }

  const axis = ctx.resolveExtrudeAxis(
    feature.axis ?? ({ kind: "axis.sketch.normal" } as const),
    profile,
    upstream
  );
  const side = feature.side ?? "symmetric";
  const edges = ctx.collectEdgesFromShape(wire);
  if (edges.length !== 1) {
    throw new Error(
      `OCCT backend: ${kind} currently supports a single sketch line segment profile`
    );
  }
  const endpoints = ctx.edgeEndpoints(edges[0]);
  if (!endpoints) {
    throw new Error(`OCCT backend: ${kind} profile edge has invalid endpoints`);
  }
  const lineDir = normalizeVector(ctx.subVec(endpoints.end, endpoints.start));
  if (!isFiniteVec(lineDir)) {
    throw new Error(`OCCT backend: ${kind} profile edge is degenerate`);
  }
  const offsetDir = normalizeVector(cross(lineDir, axis));
  if (!isFiniteVec(offsetDir)) {
    throw new Error(`OCCT backend: ${kind} axis cannot be parallel to profile line`);
  }

  const low = side === "symmetric" ? -thickness / 2 : 0;
  const high = side === "symmetric" ? thickness / 2 : thickness;
  const p0 = ctx.addVec(endpoints.start, ctx.scaleVec(offsetDir, low));
  const p1 = ctx.addVec(endpoints.end, ctx.scaleVec(offsetDir, low));
  const p2 = ctx.addVec(endpoints.end, ctx.scaleVec(offsetDir, high));
  const p3 = ctx.addVec(endpoints.start, ctx.scaleVec(offsetDir, high));
  const section = ctx.makePolygonWire([p0, p1, p2, p3]);
  const sectionFace = ctx.readShape(ctx.makeFaceFromWire(section));
  const sectionCenter: [number, number, number] = [
    (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
    (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
    (p0[2] + p1[2] + p2[2] + p3[2]) / 4,
  ];

  const span = ctx.resolveThinFeatureAxisSpan(axis, sectionCenter, depth, upstream);
  if (!span) {
    throw new Error(`OCCT backend: ${kind} requires upstream support solids to bound depth`);
  }
  const spanDepth = span.high - span.low;
  if (!(spanDepth > 1e-6)) {
    throw new Error(`OCCT backend: ${kind} depth range collapsed`);
  }

  const sectionStart =
    Math.abs(span.low) > 1e-9
      ? ctx.transformShapeTranslate(sectionFace, ctx.scaleVec(axis, span.low))
      : sectionFace;
  let solid = ctx.readShape(
    ctx.makePrism(
      sectionStart,
      ctx.makeVec(axis[0] * spanDepth, axis[1] * spanDepth, axis[2] * spanDepth)
    )
  );
  solid = ctx.normalizeSolid(solid);
  if (!ctx.shapeHasSolid(solid)) {
    const stitched = ctx.makeSolidFromShells(solid);
    if (stitched) {
      solid = ctx.normalizeSolid(stitched);
    }
  }
  if (!ctx.shapeHasSolid(solid) || !ctx.isValidShape(solid)) {
    throw new Error(`OCCT backend: ${kind} produced an invalid solid`);
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

export function execRib(
  ctx: ThinProfileContext,
  feature: Rib,
  upstream: KernelResult
): KernelResult {
  return execThinProfileFeature("rib", ctx, feature, upstream);
}

export function execWeb(
  ctx: ThinProfileContext,
  feature: Web,
  upstream: KernelResult
): KernelResult {
  return execThinProfileFeature("web", ctx, feature, upstream);
}
