import type { ExecuteInput, KernelResult } from "../backend.js";
import { resolveSelectorSet } from "../selectors.js";
import type { AxisDirection, Unwrap } from "../ir.js";
import {
  clamp,
  cross,
  dot,
  isFiniteVec,
  normalizeVector,
  rotateAroundAxis,
  vecLength,
} from "./vector_math.js";
import type { UnwrapContext } from "./operation_contexts.js";

type UnwrapPointProjector = (
  point: [number, number, number]
) => [number, number, number] | null;

type UnwrapPatch = {
  shape: any;
  meta: Record<string, unknown>;
  sourceFace?: any;
  projectPoint?: UnwrapPointProjector;
};

type UnwrapAdjacencyEdge = {
  a: number;
  b: number;
  start: [number, number, number];
  end: [number, number, number];
};

type Unwrap2DTransform = {
  angle: number;
  tx: number;
  ty: number;
};

export function execUnwrap(
  ctx: UnwrapContext,
  feature: Unwrap,
  upstream: KernelResult,
  _resolve: ExecuteInput["resolve"]
): KernelResult {
  const mode = feature.mode ?? "strict";
  const targets = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (targets.length === 0) {
    throw new Error("OCCT backend: unwrap source selector matched 0 entities");
  }

  const faces: any[] = [];
  const precomputedPatches: UnwrapPatch[] = [];
  const seenByHash = new Map<number, any[]>();
  const addFace = (candidate: any) => {
    const face = ctx.toFace(candidate);
    const hash = ctx.shapeHash(face);
    const bucket = seenByHash.get(hash);
    if (bucket?.some((entry) => ctx.shapesSame(entry, face))) {
      return;
    }
    if (bucket) bucket.push(face);
    else seenByHash.set(hash, [face]);
    faces.push(face);
  };

  for (const target of targets) {
    if (target.kind === "face") {
      const shape = target.meta["shape"];
      if (!shape) {
        throw new Error("OCCT backend: unwrap source face missing shape");
      }
      addFace(shape);
      continue;
    }
    if (target.kind === "surface") {
      const shape = target.meta["shape"];
      if (!shape) {
        throw new Error("OCCT backend: unwrap source surface missing shape");
      }
      const surfaceFaces = ctx.listFaces(shape);
      if (mode === "strict" && surfaceFaces.length !== 1) {
        throw new Error(
          "OCCT backend: unwrap_input_unsupported_topology: strict mode supports only single-face surface unwrap; use mode experimental for multi-face surfaces"
        );
      }
      for (const face of surfaceFaces) {
        addFace(face);
      }
      continue;
    }
    if (target.kind === "solid") {
      const shape = target.meta["shape"];
      if (!shape) {
        throw new Error("OCCT backend: unwrap source solid missing shape");
      }
      precomputedPatches.push(...extractSheetPatchesFromSolid(ctx, shape, mode));
      continue;
    }
    throw new Error("OCCT backend: unwrap source must resolve to face/surface/solid selections");
  }

  if (faces.length === 0 && precomputedPatches.length === 0) {
    throw new Error("OCCT backend: unwrap source resolved no faces");
  }
  if (mode === "strict") {
    if (precomputedPatches.length > 0 && faces.length > 0) {
      throw new Error(
        "OCCT backend: unwrap_input_unsupported_topology: strict mode does not support mixed solid and face/surface unwrap sources"
      );
    }
    if (precomputedPatches.length === 0 && faces.length !== 1) {
      throw new Error(
        "OCCT backend: unwrap_input_unsupported_topology: strict mode supports only single-face unwrap for face/surface sources"
      );
    }
    if (precomputedPatches.length > 1) {
      throw new Error(
        "OCCT backend: unwrap_input_unsupported_topology: strict mode expects one solid source output"
      );
    }
  }

  const facePatches = faces.map((face) => unwrapFacePatch(ctx, face));
  const patches = precomputedPatches.concat(facePatches);
  const components = layoutConnectedUnwrapFacePatches(ctx, patches);
  const packed = packUnwrapPatches(ctx, components);
  const outputShape = packed.length === 1 ? packed[0] : ctx.makeCompoundFromShapes(packed);
  if (!ctx.isValidShape(outputShape)) {
    throw new Error("OCCT backend: unwrap produced invalid result");
  }

  const unwrapMeta =
    patches.length === 1
      ? patches[0]?.meta
      : {
          kind: "multi",
          faceCount: patches.length,
          faces: patches.map((patch) => patch.meta),
        };

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:face`,
        kind: "face" as const,
        meta: {
          shape: outputShape,
          unwrap: unwrapMeta,
        },
      },
    ],
  ]);
  const selections = ctx.collectSelections(outputShape, feature.id, feature.result, feature.tags, {
    rootKind: "face",
  });
  return { outputs, selections };
}

function unwrapFacePatch(ctx: UnwrapContext, face: any): UnwrapPatch {
  const properties = ctx.faceProperties(face);
  if (properties.planar) {
    const basis = ctx.planeBasisFromFace(face);
    let flattened = face;

    const origin = basis.origin;
    if (vecLength(origin) > 1e-9) {
      flattened = ctx.transformShapeTranslate(flattened, [-origin[0], -origin[1], -origin[2]]);
    }

    const targetNormal: [number, number, number] = [0, 0, 1];
    const sourceNormal = normalizeVector(basis.normal);
    let sourceX = normalizeVector(basis.xDir);
    const rawAxis = cross(sourceNormal, targetNormal);
    const axisLen = vecLength(rawAxis);
    const alignDot = clamp(dot(sourceNormal, targetNormal), -1, 1);
    let alignAxis: [number, number, number] = [0, 0, 1];
    let alignAngle = 0;
    if (axisLen > 1e-9) {
      alignAxis = normalizeVector(rawAxis);
      alignAngle = Math.atan2(axisLen, alignDot);
    } else if (alignDot < 0) {
      const fallback: [number, number, number] =
        Math.abs(sourceNormal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      alignAxis = normalizeVector(cross(sourceNormal, fallback));
      if (!isFiniteVec(alignAxis)) {
        alignAxis = [1, 0, 0];
      }
      alignAngle = Math.PI;
    }

    if (Math.abs(alignAngle) > 1e-12) {
      flattened = ctx.transformShapeRotate(flattened, [0, 0, 0], alignAxis, alignAngle);
      sourceX = rotateAroundAxis(sourceX, alignAxis, alignAngle);
    }

    const xProj: [number, number, number] = [sourceX[0], sourceX[1], 0];
    const xProjLen = vecLength(xProj);
    let spin = 0;
    if (xProjLen > 1e-9) {
      const xUnit: [number, number, number] = [xProj[0] / xProjLen, xProj[1] / xProjLen, 0];
      spin = Math.atan2(-xUnit[1], clamp(xUnit[0], -1, 1));
      if (Math.abs(spin) > 1e-12) {
        flattened = ctx.transformShapeRotate(flattened, [0, 0, 0], [0, 0, 1], spin);
      }
    }

    if (!ctx.isValidShape(flattened)) {
      throw new Error("OCCT backend: unwrap produced invalid result");
    }
    const flatProps = ctx.faceProperties(flattened);
    const projectPoint: UnwrapPointProjector = (point) => {
      if (!point.every((value) => Number.isFinite(value))) return null;
      const translated: [number, number, number] = [
        point[0] - origin[0],
        point[1] - origin[1],
        point[2] - origin[2],
      ];
      const aligned =
        Math.abs(alignAngle) > 1e-12 ? rotateAroundAxis(translated, alignAxis, alignAngle) : translated;
      const spun = Math.abs(spin) > 1e-12 ? rotateAroundAxis(aligned, [0, 0, 1], spin) : aligned;
      if (!spun.every((value) => Number.isFinite(value))) return null;
      return [spun[0], spun[1], 0];
    };
    return {
      sourceFace: face,
      projectPoint,
      shape: flattened,
      meta: {
        kind: "planar",
        sourceSurfaceType: properties.surfaceType ?? "plane",
        sourceArea: properties.area,
        flatArea: flatProps.area,
      },
    };
  }

  if (properties.surfaceType === "cylinder") {
    const cylinder = ctx.cylinderFromFace(face);
    const uv = ctx.surfaceUvExtents(face);
    if (!cylinder || !uv) {
      throw new Error("OCCT backend: unwrap cylindrical source missing geometry metadata");
    }
    const radius = cylinder.radius;
    if (!(Number.isFinite(radius) && radius > 1e-9)) {
      throw new Error("OCCT backend: unwrap cylindrical source has invalid radius");
    }
    const angleSpan = Math.abs(uv.uMax - uv.uMin);
    const vSpan = Math.abs(uv.vMax - uv.vMin);
    const width = radius * angleSpan;
    const height = vSpan;
    if (!(width > 1e-9) || !(height > 1e-9)) {
      throw new Error("OCCT backend: unwrap cylindrical source has degenerate span");
    }

    const corners: [number, number, number][] = [
      [0, 0, 0],
      [width, 0, 0],
      [width, height, 0],
      [0, height, 0],
    ];
    const wire = ctx.makePolygonWire(corners);
    const faceBuilder = ctx.makeFaceFromWire(wire);
    const flattened = ctx.readShape(faceBuilder);
    if (!ctx.isValidShape(flattened)) {
      throw new Error("OCCT backend: unwrap produced invalid result");
    }
    const axis = normalizeVector(cylinder.axis);
    const xRef = ctx.cylinderReferenceXDirection(cylinder);
    const yRef = normalizeVector(cross(axis, xRef));
    const axisValid = isFiniteVec(axis);
    const xRefValid = isFiniteVec(xRef);
    const yRefValid = isFiniteVec(yRef);
    const projectPoint: UnwrapPointProjector = (point) => {
      if (!axisValid || !xRefValid || !yRefValid) return null;
      if (!point.every((value) => Number.isFinite(value))) return null;
      const rel = ctx.subVec(point, cylinder.origin);
      const axial = dot(rel, axis);
      const radial = ctx.subVec(rel, ctx.scaleVec(axis, axial));
      const radialLen = vecLength(radial);
      if (!(radialLen > 1e-9)) return null;
      const cosAngle = dot(radial, xRef) / radialLen;
      const sinAngle = dot(radial, yRef) / radialLen;
      let u = Math.atan2(sinAngle, cosAngle);
      u = closestPeriodicParameter(u, uv.uMin, uv.uMax);
      const x = radius * (u - uv.uMin);
      const y = axial - uv.vMin;
      if (!(Number.isFinite(x) && Number.isFinite(y))) return null;
      return [x, y, 0];
    };
    return {
      sourceFace: face,
      projectPoint,
      shape: flattened,
      meta: {
        kind: "cylindrical",
        radius,
        angleSpan,
        axialSpan: height,
        width,
        height,
        sourceSurfaceType: properties.surfaceType ?? "cylinder",
      },
    };
  }

  throw new Error("OCCT backend: unwrap currently supports planar or cylindrical faces only");
}

function extractSheetPatchesFromSolid(
  ctx: UnwrapContext,
  solid: any,
  mode: "strict" | "experimental" = "strict"
): UnwrapPatch[] {
  const bounds = ctx.shapeBounds(solid);
  const dims = [
    Math.abs(bounds.max[0] - bounds.min[0]),
    Math.abs(bounds.max[1] - bounds.min[1]),
    Math.abs(bounds.max[2] - bounds.min[2]),
  ].sort((a, b) => a - b);
  const minDim = dims[0] ?? 0;
  const maxDim = dims[dims.length - 1] ?? 0;
  if (!(maxDim > 1e-6)) {
    throw new Error("OCCT backend: unwrap solid source has degenerate bounds");
  }
  const thinRatio = minDim / maxDim;

  const faces = ctx.listFaces(solid);
  if (faces.length === 0) {
    throw new Error("OCCT backend: unwrap solid source has no faces");
  }

  const cylinderNet = extractSolidCylinderNetFromSolid(ctx, solid, faces);
  if (cylinderNet) return [cylinderNet];

  if (thinRatio > 0.35) {
    const boxNet = extractAxisAlignedBoxNetFromSolid(ctx, solid, faces);
    if (boxNet) return [boxNet];
    if (mode === "experimental") {
      const polyhedral = extractPlanarPolyhedralPatchesFromSolid(ctx, solid, faces);
      if (polyhedral) {
        return polyhedral.map((patch) => ({
          ...patch,
          meta: {
            ...patch.meta,
            solidExtraction: {
              source: "solid",
              method: "planarPolyhedron",
              thinRatio,
            },
          },
        }));
      }
    }
    throw new Error(
      `OCCT backend: unwrap_input_unsupported_topology: ${
        mode === "strict"
          ? "strict mode supports thin sheets, axis-aligned boxes, and full cylinders; use mode experimental for broader solid unwrap"
          : "solid source is unsupported for experimental unwrap (non-thin and non-planar-polyhedral)"
      }`
    );
  }

  type PlanarEntry = {
    face: any;
    area: number;
    center: [number, number, number];
    normal: [number, number, number];
  };
  const planar: PlanarEntry[] = [];
  for (const face of faces) {
    const props = ctx.faceProperties(face);
    if (!props.planar) continue;
    const normal = props.normalVec
      ? normalizeVector(props.normalVec)
      : normalizeVector(ctx.planeBasisFromFace(face).normal);
    if (!isFiniteVec(normal)) continue;
    planar.push({
      face,
      area: Math.max(props.area, 0),
      center: props.center,
      normal,
    });
  }

  let bestPlanar: { a: PlanarEntry; b: PlanarEntry; thickness: number; score: number } | null = null;
  for (let i = 0; i < planar.length; i += 1) {
    const a = planar[i];
    if (!a) continue;
    for (let j = i + 1; j < planar.length; j += 1) {
      const b = planar[j];
      if (!b) continue;
      const align = Math.abs(dot(a.normal, b.normal));
      if (align < 0.98) continue;
      const maxArea = Math.max(a.area, b.area, 1e-9);
      const areaRatio = Math.min(a.area, b.area) / maxArea;
      if (areaRatio < 0.6) continue;
      const delta = ctx.subVec(b.center, a.center);
      const thickness = Math.abs(dot(delta, a.normal));
      if (!(thickness > 1e-6)) continue;
      const score = Math.min(a.area, b.area) / thickness;
      if (!bestPlanar || score > bestPlanar.score) {
        bestPlanar = { a, b, thickness, score };
      }
    }
  }
  if (bestPlanar) {
    const primary = bestPlanar.a.area >= bestPlanar.b.area ? bestPlanar.a.face : bestPlanar.b.face;
    const patch = unwrapFacePatch(ctx, primary);
    patch.meta = {
      ...patch.meta,
      sheetExtraction: {
        source: "solid",
        method: "pairedPlanarFaces",
        thickness: bestPlanar.thickness,
        thinRatio,
      },
    };
    return [patch];
  }

  type CylEntry = {
    face: any;
    radius: number;
    axis: [number, number, number];
    uv: { uMin: number; uMax: number; vMin: number; vMax: number };
  };
  const cylinders: CylEntry[] = [];
  for (const face of faces) {
    const cyl = ctx.cylinderFromFace(face);
    const uv = ctx.surfaceUvExtents(face);
    if (!cyl || !uv) continue;
    const axis = normalizeVector(cyl.axis);
    if (!isFiniteVec(axis)) continue;
    cylinders.push({
      face,
      radius: cyl.radius,
      axis,
      uv,
    });
  }

  let bestCyl:
    | {
        a: CylEntry;
        b: CylEntry;
        thickness: number;
        angleSpan: number;
        axialSpan: number;
        score: number;
      }
    | null = null;
  for (let i = 0; i < cylinders.length; i += 1) {
    const a = cylinders[i];
    if (!a) continue;
    for (let j = i + 1; j < cylinders.length; j += 1) {
      const b = cylinders[j];
      if (!b) continue;
      if (Math.abs(dot(a.axis, b.axis)) < 0.995) continue;
      const angleA = Math.abs(a.uv.uMax - a.uv.uMin);
      const angleB = Math.abs(b.uv.uMax - b.uv.uMin);
      const axialA = Math.abs(a.uv.vMax - a.uv.vMin);
      const axialB = Math.abs(b.uv.vMax - b.uv.vMin);
      const avgAngle = (angleA + angleB) / 2;
      const avgAxial = (axialA + axialB) / 2;
      if (Math.abs(angleA - angleB) > Math.max(1e-3, avgAngle * 0.01)) continue;
      if (Math.abs(axialA - axialB) > Math.max(1e-3, avgAxial * 0.01)) continue;
      const thickness = Math.abs(a.radius - b.radius);
      if (!(thickness > 1e-6)) continue;
      const score = avgAngle * avgAxial;
      if (!bestCyl || score > bestCyl.score) {
        bestCyl = {
          a,
          b,
          thickness,
          angleSpan: avgAngle,
          axialSpan: avgAxial,
          score,
        };
      }
    }
  }
  if (bestCyl) {
    const radius = (bestCyl.a.radius + bestCyl.b.radius) / 2;
    const width = radius * bestCyl.angleSpan;
    const height = bestCyl.axialSpan;
    if (!(width > 1e-6) || !(height > 1e-6)) {
      throw new Error("OCCT backend: extracted cylindrical sheet has degenerate span");
    }
    const corners: [number, number, number][] = [
      [0, 0, 0],
      [width, 0, 0],
      [width, height, 0],
      [0, height, 0],
    ];
    const wire = ctx.makePolygonWire(corners);
    const faceBuilder = ctx.makeFaceFromWire(wire);
    const shape = ctx.readShape(faceBuilder);
    return [
      {
        shape,
        meta: {
          kind: "cylindrical",
          radius,
          angleSpan: bestCyl.angleSpan,
          axialSpan: height,
          width,
          height,
          sourceSurfaceType: "cylinder",
          sheetExtraction: {
            source: "solid",
            method: "pairedCylinders",
            thickness: bestCyl.thickness,
            thinRatio,
          },
        },
      },
    ];
  }

  throw new Error(
    `OCCT backend: unwrap_input_unsupported_topology: ${
      mode === "strict"
        ? "strict mode requires thin-sheet solids (or explicit supported templates)"
        : "solid source is not recognized as thin sheet"
    }`
  );
}

function extractSolidCylinderNetFromSolid(ctx: UnwrapContext, solid: any, faces?: any[]): UnwrapPatch | null {
  const sourceFaces = faces ?? ctx.listFaces(solid);
  const cylindricalFaces: any[] = [];
  const planarFaces: Array<{
    face: any;
    area: number;
    center: [number, number, number];
    normal: [number, number, number];
  }> = [];
  for (const face of sourceFaces) {
    const props = ctx.faceProperties(face);
    if (props.surfaceType === "cylinder") {
      cylindricalFaces.push(face);
      continue;
    }
    if (!props.planar) return null;
    const normal = props.normalVec
      ? normalizeVector(props.normalVec)
      : normalizeVector(ctx.planeBasisFromFace(face).normal);
    if (!isFiniteVec(normal)) return null;
    planarFaces.push({
      face,
      area: props.area,
      center: props.center,
      normal,
    });
  }
  if (cylindricalFaces.length !== 1 || planarFaces.length !== 2) return null;
  const sideFace = cylindricalFaces[0];
  const cylinder = ctx.cylinderFromFace(sideFace);
  const uv = ctx.surfaceUvExtents(sideFace);
  if (!cylinder || !uv) return null;
  const axis = normalizeVector(cylinder.axis);
  if (!isFiniteVec(axis)) return null;
  const vSpan = Math.abs(uv.vMax - uv.vMin);
  if (!(vSpan > 1e-6 && cylinder.radius > 1e-6)) return null;
  const fullTurn = Math.PI * 2;
  const angleSpan = Math.abs(uv.uMax - uv.uMin);
  const isFull = Math.abs(angleSpan - fullTurn) <= Math.max(1e-3, fullTurn * 0.01);
  if (!isFull) return null;

  const capA = planarFaces[0];
  const capB = planarFaces[1];
  if (!capA || !capB) return null;
  const alignA = Math.abs(dot(capA.normal, axis));
  const alignB = Math.abs(dot(capB.normal, axis));
  if (alignA < 0.98 || alignB < 0.98) return null;
  const capArea = Math.PI * cylinder.radius * cylinder.radius;
  const areaTol = Math.max(capArea * 0.05, 1e-3);
  if (Math.abs(capA.area - capArea) > areaTol || Math.abs(capB.area - capArea) > areaTol) return null;
  const projA = dot(capA.center, axis);
  const projB = dot(capB.center, axis);
  const height = Math.abs(projA - projB);
  if (!(height > 1e-6)) return null;

  const width = fullTurn * cylinder.radius;
  const rectangleCorners: [number, number, number][] = [
    [0, 0, 0],
    [width, 0, 0],
    [width, height, 0],
    [0, height, 0],
  ];
  const rectWire = ctx.makePolygonWire(rectangleCorners);
  const rectFace = ctx.readShape(ctx.makeFaceFromWire(rectWire));
  const topCap = ctx.makeCircleFace(cylinder.radius, [width / 2, height + cylinder.radius, 0]);
  const bottomCap = ctx.makeCircleFace(cylinder.radius, [width / 2, -cylinder.radius, 0]);
  const shape = ctx.makeCompoundFromShapes([rectFace, topCap, bottomCap]);
  if (!ctx.isValidShape(shape, "face")) return null;
  return {
    shape,
    meta: {
      kind: "multi",
      faceCount: 3,
      faces: [
        {
          kind: "cylindrical",
          radius: cylinder.radius,
          width,
          height,
          angleSpan: fullTurn,
          sourceSurfaceType: "cylinder",
        },
        {
          kind: "planar",
          sourceSurfaceType: "plane",
          radius: cylinder.radius,
        },
        {
          kind: "planar",
          sourceSurfaceType: "plane",
          radius: cylinder.radius,
        },
      ],
      solidExtraction: {
        source: "solid",
        method: "solidCylinderNet",
        radius: cylinder.radius,
        height,
        capCount: 2,
      },
    },
  };
}

function extractAxisAlignedBoxNetFromSolid(ctx: UnwrapContext, solid: any, faces?: any[]): UnwrapPatch | null {
  const sourceFaces = faces ?? ctx.listFaces(solid);
  if (sourceFaces.length !== 6) return null;

  const bounds = ctx.shapeBounds(solid);
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const byDir = new Map<AxisDirection, any>();
  for (const face of sourceFaces) {
    const props = ctx.faceProperties(face);
    if (!props.planar) return null;
    const normal = props.normalVec
      ? normalizeVector(props.normalVec)
      : normalizeVector(ctx.planeBasisFromFace(face).normal);
    const abs: [number, number, number] = [Math.abs(normal[0]), Math.abs(normal[1]), Math.abs(normal[2])];
    const dominant = Math.max(abs[0], abs[1], abs[2]);
    if (!(dominant > 0.98)) return null;
    const dir = (() => {
      if (dominant === abs[0]) return props.center[0] >= center[0] ? "+X" : "-X";
      if (dominant === abs[1]) return props.center[1] >= center[1] ? "+Y" : "-Y";
      return props.center[2] >= center[2] ? "+Z" : "-Z";
    })();
    if (!dir) return null;
    if (byDir.has(dir)) return null;
    byDir.set(dir, face);
  }
  const dirs: AxisDirection[] = ["+X", "-X", "+Y", "-Y", "+Z", "-Z"];
  if (!dirs.every((dir) => byDir.has(dir))) return null;

  const dx = Math.abs(bounds.max[0] - bounds.min[0]);
  const dy = Math.abs(bounds.max[1] - bounds.min[1]);
  const dz = Math.abs(bounds.max[2] - bounds.min[2]);
  if (!(dx > 1e-6 && dy > 1e-6 && dz > 1e-6)) return null;

  const makeRect = (x0: number, y0: number, w: number, h: number): any => {
    const corners: [number, number, number][] = [
      [x0, y0, 0],
      [x0 + w, y0, 0],
      [x0 + w, y0 + h, 0],
      [x0, y0 + h, 0],
    ];
    const wire = ctx.makePolygonWire(corners);
    const faceBuilder = ctx.makeFaceFromWire(wire);
    return ctx.readShape(faceBuilder);
  };

  const faceSpecs: Array<{ dir: AxisDirection; x0: number; y0: number; w: number; h: number }> = [
    { dir: "+Z", x0: 0, y0: 0, w: dx, h: dy },
    { dir: "+X", x0: dx, y0: 0, w: dz, h: dy },
    { dir: "-X", x0: -dz, y0: 0, w: dz, h: dy },
    { dir: "+Y", x0: 0, y0: dy, w: dx, h: dz },
    { dir: "-Y", x0: 0, y0: -dz, w: dx, h: dz },
    { dir: "-Z", x0: 0, y0: dy + dz, w: dx, h: dy },
  ];
  const shapes: any[] = [];
  const faceMeta: Record<string, unknown>[] = [];
  for (const spec of faceSpecs) {
    const sourceFace = byDir.get(spec.dir);
    if (!sourceFace) return null;
    const shape = makeRect(spec.x0, spec.y0, spec.w, spec.h);
    if (!ctx.isValidShape(shape, "face")) return null;
    shapes.push(shape);
    faceMeta.push({
      kind: "planar",
      sourceDirection: spec.dir,
      width: spec.w,
      height: spec.h,
      sourceSurfaceType: "plane",
    });
  }

  const compound = ctx.makeCompoundFromShapes(shapes);
  return {
    shape: compound,
    meta: {
      kind: "multi",
      faceCount: faceMeta.length,
      faces: faceMeta,
      solidExtraction: {
        source: "solid",
        method: "axisAlignedBoxNet",
      },
    },
  };
}

function extractPlanarPolyhedralPatchesFromSolid(
  ctx: UnwrapContext,
  solid: any,
  faces?: any[]
): UnwrapPatch[] | null {
  const sourceFaces = faces ?? ctx.listFaces(solid);
  if (sourceFaces.length < 4) return null;
  const patches: UnwrapPatch[] = [];
  for (const face of sourceFaces) {
    const props = ctx.faceProperties(face);
    if (!props.planar) return null;
    const patch = unwrapFacePatch(ctx, face);
    patches.push({
      ...patch,
      meta: {
        ...patch.meta,
        kind: "planar",
      },
    });
  }
  return patches;
}

function layoutConnectedUnwrapFacePatches(ctx: UnwrapContext, patches: UnwrapPatch[]): any[] {
  if (patches.length <= 1) return patches.map((patch) => patch.shape);
  const edges = buildUnwrapAdjacencyEdges(ctx, patches);
  if (edges.length === 0) return patches.map((patch) => patch.shape);

  const edgesByPatch = new Map<number, UnwrapAdjacencyEdge[]>();
  for (const edge of edges) {
    const listA = edgesByPatch.get(edge.a) ?? [];
    listA.push(edge);
    edgesByPatch.set(edge.a, listA);
    const listB = edgesByPatch.get(edge.b) ?? [];
    listB.push(edge);
    edgesByPatch.set(edge.b, listB);
  }

  const transforms = new Map<number, Unwrap2DTransform>();
  const transformedByIndex = new Map<number, any>();
  const visited = new Set<number>();
  const components: number[][] = [];
  const rootOrder = patches
    .map((patch, index) => ({
      index,
      key: unwrapPatchSortKey(ctx, patch),
    }))
    .sort((a, b) => compareUnwrapSortKeys(a.key, b.key))
    .map((entry) => entry.index);
  for (const i of rootOrder) {
    if (visited.has(i)) continue;
    const component: number[] = [];
    const componentPlaced = new Set<number>([i]);
    const root: Unwrap2DTransform = { angle: 0, tx: 0, ty: 0 };
    transforms.set(i, root);
    transformedByIndex.set(i, patches[i]?.shape);
    const queue = [i];
    visited.add(i);
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      component.push(current);
      const currentPatch = patches[current];
      const currentTransform = transforms.get(current) ?? root;
      const projectorA = currentPatch?.projectPoint;
      if (!projectorA) continue;
      const neighbors = (edgesByPatch.get(current) ?? [])
        .slice()
        .sort((a, b) => compareUnwrapAdjacencyEdges(a, b));
      const overlapFallback = new Map<number, { fit: Unwrap2DTransform; shape: any }>();
      for (const edge of neighbors) {
        const neighbor = edge.a === current ? edge.b : edge.a;
        if (visited.has(neighbor)) continue;
        const neighborPatch = patches[neighbor];
        const projectorB = neighborPatch?.projectPoint;
        if (!projectorB) continue;
        const a0 = projectorA(edge.start);
        const a1 = projectorA(edge.end);
        const b0 = projectorB(edge.start);
        const b1 = projectorB(edge.end);
        if (!a0 || !a1 || !b0 || !b1) continue;
        const target0 = applyUnwrapTransform2D(currentTransform, a0);
        const target1 = applyUnwrapTransform2D(currentTransform, a1);
        const fit = fitUnwrapEdgeTransform2D(b0, b1, target0, target1);
        if (!fit) continue;
        const candidateShape = transformShapeInUnwrapPlane(ctx, neighborPatch.shape, fit);
        const componentShapes = Array.from(componentPlaced)
          .map((index) => transformedByIndex.get(index))
          .filter(Boolean);
        if (unwrapPlacementOverlaps(ctx, candidateShape, componentShapes)) {
          if (!overlapFallback.has(neighbor)) {
            overlapFallback.set(neighbor, { fit, shape: candidateShape });
          }
          continue;
        }
        transforms.set(neighbor, fit);
        transformedByIndex.set(neighbor, candidateShape);
        componentPlaced.add(neighbor);
        visited.add(neighbor);
        queue.push(neighbor);
      }
      for (const [neighbor, fallback] of overlapFallback) {
        if (visited.has(neighbor)) continue;
        transforms.set(neighbor, fallback.fit);
        transformedByIndex.set(neighbor, fallback.shape);
        componentPlaced.add(neighbor);
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }

  const transformed = patches.map((patch, index) => {
    const transform = transforms.get(index);
    if (!transform) return patch.shape;
    return transformShapeInUnwrapPlane(ctx, patch.shape, transform);
  });

  return components
    .map((indices) => {
      const shapes = indices.map((index) => transformed[index]).filter(Boolean);
      if (shapes.length === 0) return null;
      if (shapes.length === 1) return shapes[0];
      return finalizeUnwrapComponentShapes(ctx, shapes);
    })
    .filter((shape): shape is any => shape !== null);
}

function buildUnwrapAdjacencyEdges(ctx: UnwrapContext, patches: UnwrapPatch[]): UnwrapAdjacencyEdge[] {
  const entries: Array<{ index: number; face: any }> = [];
  for (let i = 0; i < patches.length; i += 1) {
    const patch = patches[i];
    if (!patch?.sourceFace || !patch.projectPoint) continue;
    entries.push({ index: i, face: ctx.toFace(patch.sourceFace) });
  }
  if (entries.length < 2) return [];

  const compound = ctx.makeCompoundFromShapes(entries.map((entry) => entry.face));
  const adjacency = ctx.buildEdgeAdjacency(compound);
  if (!adjacency) return [];

  const byFaceHash = new Map<number, Array<{ index: number; face: any }>>();
  for (const entry of entries) {
    const hash = ctx.shapeHash(entry.face);
    const bucket = byFaceHash.get(hash) ?? [];
    bucket.push(entry);
    byFaceHash.set(hash, bucket);
  }
  const lookupIndex = (face: any): number | null => {
    const hash = ctx.shapeHash(face);
    const bucket = byFaceHash.get(hash);
    if (!bucket) return null;
    for (const entry of bucket) {
      if (ctx.shapesSame(entry.face, face)) return entry.index;
    }
    return null;
  };

  const edges: UnwrapAdjacencyEdge[] = [];
  const seenPair = new Set<string>();
  for (const bucket of adjacency.values()) {
    for (const item of bucket) {
      if (!item || item.faces.length !== 2) continue;
      const a = lookupIndex(item.faces[0]);
      const b = lookupIndex(item.faces[1]);
      if (a === null || b === null || a === b) continue;
      const endpoints = ctx.edgeEndpoints(item.edge);
      if (!endpoints) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const edgeHash = ctx.shapeHash(item.edge);
      const key = `${lo}:${hi}:${edgeHash}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      edges.push({
        a: lo,
        b: hi,
        start: endpoints.start,
        end: endpoints.end,
      });
    }
  }
  edges.sort((a, b) => compareUnwrapAdjacencyEdges(a, b));
  return edges;
}

function applyUnwrapTransform2D(
  transform: Unwrap2DTransform,
  point: [number, number, number]
): [number, number, number] {
  const cos = Math.cos(transform.angle);
  const sin = Math.sin(transform.angle);
  const x = cos * point[0] - sin * point[1] + transform.tx;
  const y = sin * point[0] + cos * point[1] + transform.ty;
  return [x, y, point[2]];
}

function fitUnwrapEdgeTransform2D(
  sourceStart: [number, number, number],
  sourceEnd: [number, number, number],
  targetStart: [number, number, number],
  targetEnd: [number, number, number]
): Unwrap2DTransform | null {
  const targetVec: [number, number] = [targetEnd[0] - targetStart[0], targetEnd[1] - targetStart[1]];
  const targetLen = Math.hypot(targetVec[0], targetVec[1]);
  if (!(targetLen > 1e-9)) return null;
  const candidates: Array<[[number, number, number], [number, number, number]]> = [
    [sourceStart, sourceEnd],
    [sourceEnd, sourceStart],
  ];
  let best: Unwrap2DTransform | null = null;
  let bestErr = Infinity;
  for (const candidate of candidates) {
    const s0 = candidate[0];
    const s1 = candidate[1];
    const sourceVec: [number, number] = [s1[0] - s0[0], s1[1] - s0[1]];
    const sourceLen = Math.hypot(sourceVec[0], sourceVec[1]);
    if (!(sourceLen > 1e-9)) continue;
    const angle = Math.atan2(
      sourceVec[0] * targetVec[1] - sourceVec[1] * targetVec[0],
      sourceVec[0] * targetVec[0] + sourceVec[1] * targetVec[1]
    );
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotS0x = cos * s0[0] - sin * s0[1];
    const rotS0y = sin * s0[0] + cos * s0[1];
    const tx = targetStart[0] - rotS0x;
    const ty = targetStart[1] - rotS0y;
    const mappedS1x = cos * s1[0] - sin * s1[1] + tx;
    const mappedS1y = sin * s1[0] + cos * s1[1] + ty;
    const err = Math.hypot(mappedS1x - targetEnd[0], mappedS1y - targetEnd[1]);
    if (err < bestErr) {
      bestErr = err;
      best = { angle, tx, ty };
    }
  }
  if (!best) return null;
  const tolerance = Math.max(targetLen, 1) * 1e-5;
  if (!(bestErr <= tolerance)) return null;
  return best;
}

function transformShapeInUnwrapPlane(ctx: UnwrapContext, shape: any, transform: Unwrap2DTransform): any {
  let out = shape;
  if (Math.abs(transform.angle) > 1e-12) {
    out = ctx.transformShapeRotate(out, [0, 0, 0], [0, 0, 1], transform.angle);
  }
  if (Math.abs(transform.tx) > 1e-12 || Math.abs(transform.ty) > 1e-12) {
    out = ctx.transformShapeTranslate(out, [transform.tx, transform.ty, 0]);
  }
  return out;
}

function unwrapPlacementOverlaps(ctx: UnwrapContext, shape: any, existing: any[]): boolean {
  if (existing.length === 0) return false;
  const bounds = ctx.shapeBounds(shape);
  const tol = 1e-5;
  for (const candidate of existing) {
    const other = ctx.shapeBounds(candidate);
    const overlapX = Math.min(bounds.max[0], other.max[0]) - Math.max(bounds.min[0], other.min[0]);
    if (overlapX <= tol) continue;
    const overlapY = Math.min(bounds.max[1], other.max[1]) - Math.max(bounds.min[1], other.min[1]);
    if (overlapY <= tol) continue;
    return true;
  }
  return false;
}

function finalizeUnwrapComponentShapes(ctx: UnwrapContext, shapes: any[]): any {
  const compound = ctx.makeCompoundFromShapes(shapes);
  if (!unwrapShapesCoplanarXY(ctx, shapes)) return compound;
  const sewed = ctx.sewShapeFaces(compound, 1e-6);
  if (!sewed) return compound;
  if (ctx.shapeHasSolid(sewed)) return compound;
  if (ctx.countFaces(sewed) < 1) return compound;
  return sewed;
}

function unwrapShapesCoplanarXY(ctx: UnwrapContext, shapes: any[]): boolean {
  if (shapes.length <= 1) return true;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const shape of shapes) {
    const bounds = ctx.shapeBounds(shape);
    minZ = Math.min(minZ, bounds.min[2]);
    maxZ = Math.max(maxZ, bounds.max[2]);
  }
  if (!(Number.isFinite(minZ) && Number.isFinite(maxZ))) return false;
  return Math.abs(maxZ - minZ) <= 1e-5;
}

function unwrapPatchSortKey(ctx: UnwrapContext, patch: UnwrapPatch): [number, number, number, number] {
  if (patch.sourceFace) {
    const props = ctx.faceProperties(patch.sourceFace);
    return [props.center[0], props.center[1], props.center[2], props.area];
  }
  const bounds = ctx.shapeBounds(patch.shape);
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const area = ctx.faceProperties(ctx.firstFace(patch.shape) ?? patch.shape).area;
  return [center[0], center[1], center[2], area];
}

function compareUnwrapSortKeys(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  for (let i = 0; i < a.length; i += 1) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function compareUnwrapAdjacencyEdges(a: UnwrapAdjacencyEdge, b: UnwrapAdjacencyEdge): number {
  if (a.a !== b.a) return a.a - b.a;
  if (a.b !== b.b) return a.b - b.b;
  const keyA = [...a.start, ...a.end];
  const keyB = [...b.start, ...b.end];
  for (let i = 0; i < keyA.length; i += 1) {
    const delta = (keyA[i] ?? 0) - (keyB[i] ?? 0);
    if (Math.abs(delta) > 1e-9) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function closestPeriodicParameter(value: number, min: number, max: number): number {
  const period = Math.PI * 2;
  const center = (min + max) / 2;
  const shifted = value + Math.round((center - value) / period) * period;
  if (shifted < min) return shifted + period;
  if (shifted > max) return shifted - period;
  return shifted;
}

function packUnwrapPatches(ctx: UnwrapContext, shapes: any[]): any[] {
  if (shapes.length <= 1) return shapes;
  const packed: any[] = [];
  let cursorX = 0;
  let maxHeight = 0;
  let gap = 1;
  for (const shape of shapes) {
    const bounds = ctx.shapeBounds(shape);
    const width = Math.max(bounds.max[0] - bounds.min[0], 1e-6);
    const height = Math.max(bounds.max[1] - bounds.min[1], 1e-6);
    const moved = ctx.transformShapeTranslate(shape, [cursorX - bounds.min[0], -bounds.min[1], 0]);
    packed.push(moved);
    maxHeight = Math.max(maxHeight, height);
    gap = Math.max(gap, maxHeight * 0.05, 0.5);
    cursorX += width + gap;
  }
  return packed;
}
