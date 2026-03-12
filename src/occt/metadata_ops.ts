import { axisDirectionFromVector, normalizeVector } from "./vector_math.js";
import type { AxisDirection } from "../ir.js";
import type { MetadataContext } from "./operation_contexts.js";

export function faceMetadata(
  ctx: MetadataContext,
  face: any,
  owner: any,
  featureId: string,
  ownerKey: string,
  featureTags?: string[]
): Record<string, unknown> {
  const { area, center, planar, normal, normalVec, surfaceType } = faceProperties(ctx, face);
  const meta: Record<string, unknown> = {
    shape: face,
    owner,
    ownerKey,
    createdBy: featureId,
    planar,
    area,
    center,
    centerZ: center[2],
    featureTags,
  };
  if (normal) {
    meta.normal = normal;
  }
  if (normalVec) {
    meta.normalVec = normalVec;
  }
  if (surfaceType) {
    meta.surfaceType = surfaceType;
  }
  if (surfaceType === "cylinder") {
    const cylinder = cylinderFromFace(ctx, face);
    if (cylinder && Number.isFinite(cylinder.radius) && cylinder.radius > 0) {
      meta.radius = cylinder.radius;
    }
  }
  if (planar) {
    try {
      const plane = ctx.planeBasisFromFace(face);
      meta.planeOrigin = plane.origin;
      meta.planeXDir = plane.xDir;
      meta.planeYDir = plane.yDir;
      meta.planeNormal = plane.normal;
    } catch {
      // Preserve existing face metadata even when plane extraction is unavailable.
    }
  }
  return meta;
}

export function edgeMetadata(
  ctx: MetadataContext,
  edge: any,
  owner: any,
  featureId: string,
  ownerKey: string,
  featureTags?: string[]
): Record<string, unknown> {
  const bounds = ctx.shapeBounds(edge);
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const centerZ = center[2];
  const endpoints = ctx.edgeEndpoints(edge);
  let length: number | undefined;
  try {
    const props = ctx.newOcct("GProp_GProps");
    const edgeHandle = ctx.toEdge(edge);
    const occt = ctx.occt as any;
    if (occt.BRepGProp?.LinearProperties_1) {
      occt.BRepGProp.LinearProperties_1(edgeHandle, props, true);
      const measured = ctx.callNumber(props, "Mass");
      if (Number.isFinite(measured) && measured > 0) {
        length = measured;
      }
    }
  } catch {
    // Keep metadata lean if edge length extraction fails.
  }

  let radius: number | undefined;
  let curveType: string | undefined;
  let curveCenter: [number, number, number] | undefined;
  try {
    const adaptor = ctx.newOcct("BRepAdaptor_Curve", ctx.toEdge(edge));
    const type = ctx.call(adaptor, "GetType") as { value?: number } | undefined;
    const types = (ctx.occt as any).GeomAbs_CurveType;
    if (types && typeof type?.value === "number") {
      const value = type.value;
      const matches = (entry: { value?: number } | undefined) =>
        typeof entry?.value === "number" && entry.value === value;
      if (matches(types.GeomAbs_Line)) curveType = "line";
      else if (matches(types.GeomAbs_Circle)) curveType = "circle";
      else if (matches(types.GeomAbs_Ellipse)) curveType = "ellipse";
      else if (matches(types.GeomAbs_Hyperbola)) curveType = "hyperbola";
      else if (matches(types.GeomAbs_Parabola)) curveType = "parabola";
      else if (matches(types.GeomAbs_BezierCurve)) curveType = "bezier";
      else if (matches(types.GeomAbs_BSplineCurve)) curveType = "bspline";
      else curveType = "other";
    }
    if (curveType === "circle") {
      const circle = ctx.callWithFallback(adaptor, ["Circle", "Circle_1"], [[]]);
      const measuredRadius = circle ? ctx.callWithFallback(circle, ["Radius", "Radius_1"], [[]]) : null;
      if (typeof measuredRadius === "number" && Number.isFinite(measuredRadius) && measuredRadius > 0) {
        radius = measuredRadius;
      }
      const location = circle ? ctx.callWithFallback(circle, ["Location", "Location_1"], [[]]) : null;
      if (location) {
        const point = ctx.pointToArray(location);
        if (point.every((value: any) => Number.isFinite(value))) {
          curveCenter = point;
        }
      }
    }
  } catch {
    // Circular radius metadata is optional.
  }

  const meta: Record<string, unknown> = {
    shape: edge,
    owner,
    ownerKey,
    createdBy: featureId,
    role: "edge",
    center,
    centerZ,
    featureTags,
  };
  if (endpoints) {
    meta.startPoint = endpoints.start;
    meta.endPoint = endpoints.end;
    meta.midPoint = [
      (endpoints.start[0] + endpoints.end[0]) / 2,
      (endpoints.start[1] + endpoints.end[1]) / 2,
      (endpoints.start[2] + endpoints.end[2]) / 2,
    ];
    meta.closedEdge =
      Math.hypot(
        endpoints.start[0] - endpoints.end[0],
        endpoints.start[1] - endpoints.end[1],
        endpoints.start[2] - endpoints.end[2]
      ) <= 1e-6;
  }
  if (length !== undefined) meta.length = length;
  if (radius !== undefined) meta.radius = radius;
  if (curveCenter) meta.curveCenter = curveCenter;
  if (curveType) meta.curveType = curveType;
  return meta;
}

export function faceProperties(ctx: MetadataContext, face: any): {
  area: number;
  center: [number, number, number];
  planar: boolean;
  normal?: AxisDirection;
  normalVec?: [number, number, number];
  surfaceType?: string;
} {
  let area = 0;
  let center: [number, number, number] = [0, 0, 0];
  try {
    const props = ctx.newOcct("GProp_GProps");
    const faceHandle = ctx.toFace(face);
    const occt = ctx.occt as any;
    if (occt.BRepGProp?.SurfaceProperties_1) {
      occt.BRepGProp.SurfaceProperties_1(faceHandle, props, true, true);
      area = ctx.callNumber(props, "Mass");
      const centre = ctx.call(props, "CentreOfMass");
      center = ctx.pointToArray(centre);
    }
  } catch {
    // Fall back to bounding box below.
  }

  let planar = false;
  let normal: AxisDirection | undefined;
  let normalVec: [number, number, number] | undefined;
  let surfaceType: string | undefined;
  try {
    const faceHandle = ctx.toFace(face);
    const adaptor = ctx.newOcct("BRepAdaptor_Surface", faceHandle, true);
    const type = ctx.call(adaptor, "GetType") as { value?: number } | undefined;
    const types = (ctx.occt as any).GeomAbs_SurfaceType;
    if (types && typeof type?.value === "number") {
      const value = type.value;
      const matches = (entry: { value?: number } | undefined) =>
        typeof entry?.value === "number" && entry.value === value;
      if (matches(types.GeomAbs_Plane)) surfaceType = "plane";
      else if (matches(types.GeomAbs_Cylinder)) surfaceType = "cylinder";
      else if (matches(types.GeomAbs_Cone)) surfaceType = "cone";
      else if (matches(types.GeomAbs_Sphere)) surfaceType = "sphere";
      else if (matches(types.GeomAbs_Torus)) surfaceType = "torus";
      else if (matches(types.GeomAbs_BSplineSurface)) surfaceType = "bspline";
      else if (matches(types.GeomAbs_BezierSurface)) surfaceType = "bezier";
      else if (matches(types.GeomAbs_SurfaceOfExtrusion)) surfaceType = "extrusion";
      else if (matches(types.GeomAbs_SurfaceOfRevolution)) surfaceType = "revolution";
      else if (matches(types.GeomAbs_OffsetSurface)) surfaceType = "offset";
      else surfaceType = "other";
      planar = surfaceType === "plane";
    }
    if (planar) {
      const plane = ctx.call(adaptor, "Plane");
      const axis = ctx.call(plane, "Axis");
      const dir = ctx.call(axis, "Direction");
      const [x, y, z] = ctx.dirToArray(dir);
      normalVec = normalizeVector([x, y, z]);
      normal = axisDirectionFromVector([x, y, z]);
    }
  } catch {
    // If plane detection fails, we still return defaults.
  }

  if (area === 0) {
    const bounds = ctx.shapeBounds(face);
    const dx = bounds.max[0] - bounds.min[0];
    const dy = bounds.max[1] - bounds.min[1];
    const dz = bounds.max[2] - bounds.min[2];
    area = planar
      ? normal === "+Z" || normal === "-Z"
        ? dx * dy
        : normal === "+X" || normal === "-X"
          ? dy * dz
          : dx * dz
      : dx * dy;
    center = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
  }

  return { area, center, planar, normal, normalVec, surfaceType };
}

export function faceCenter(ctx: MetadataContext, face: any): [number, number, number] {
  return faceProperties(ctx, face).center;
}

export function cylinderFromFace(
  ctx: MetadataContext,
  face: any
): {
  origin: [number, number, number];
  axis: [number, number, number];
  xDir?: [number, number, number];
  yDir?: [number, number, number];
  radius: number;
} | null {
  try {
    const faceHandle = ctx.toFace(face);
    const adaptor = ctx.newOcct("BRepAdaptor_Surface", faceHandle, true);
    const type = ctx.call(adaptor, "GetType") as { value?: number } | undefined;
    const types = (ctx.occt as any).GeomAbs_SurfaceType;
    if (!types || typeof type?.value !== "number") return null;
    const cylinderType = types.GeomAbs_Cylinder;
    if (!cylinderType || cylinderType.value !== type.value) return null;
    const cylinder = ctx.callWithFallback(adaptor, ["Cylinder", "Cylinder_1"], [[]]);
    if (!cylinder) return null;
    const axis = ctx.callWithFallback(cylinder, ["Axis", "Axis_1", "Axis_2"], [[]]);
    const dir = axis ? ctx.callWithFallback(axis, ["Direction", "Direction_1"], [[]]) : null;
    const loc = axis ? ctx.callWithFallback(axis, ["Location", "Location_1"], [[]]) : null;
    const position = ctx.callWithFallback(cylinder, ["Position", "Position_1", "Position_2"], [[]]);
    let xDir: [number, number, number] | undefined;
    let yDir: [number, number, number] | undefined;
    if (position) {
      const x = ctx.callWithFallback(position, ["XDirection", "XDirection_1"], [[]]);
      const y = ctx.callWithFallback(position, ["YDirection", "YDirection_1"], [[]]);
      if (x) xDir = ctx.dirToArray(x);
      if (y) yDir = ctx.dirToArray(y);
    }
    const radius = ctx.callWithFallback(cylinder, ["Radius", "Radius_1"], [[]]);
    if (!dir || !loc || typeof radius !== "number") return null;
    return {
      origin: ctx.pointToArray(loc),
      axis: ctx.dirToArray(dir),
      xDir,
      yDir,
      radius,
    };
  } catch {
    return null;
  }
}

export function annotateEdgeAdjacencyMetadata(
  ctx: MetadataContext,
  shape: any,
  edgeEntries: any[],
  faceBindings: any[]
): void {
  if (edgeEntries.length === 0 || faceBindings.length === 0) return;
  const adjacency = ctx.buildEdgeAdjacency(shape);
  if (!adjacency) return;

  const byFaceHash = new Map<number, any[]>();
  for (const binding of faceBindings) {
    const hash = ctx.shapeHash(binding.shape);
    const bucket = byFaceHash.get(hash) ?? [];
    bucket.push(binding);
    byFaceHash.set(hash, bucket);
  }

  const lookupBinding = (face: any): any | null => {
    const hash = ctx.shapeHash(face);
    const bucket = byFaceHash.get(hash);
    if (!bucket) return null;
    for (const binding of bucket) {
      if (ctx.shapesSame(binding.shape, face)) return binding;
    }
    return null;
  };

  for (const entry of edgeEntries) {
    const adjacent = ctx.adjacentFaces(adjacency, entry.shape);
    if (adjacent.length === 0) continue;
    const adjacentFaceIds = new Set<string>();
    const adjacentFaceSlots = new Set<string>();
    const adjacentFaceRoles = new Set<string>();
    for (const face of adjacent) {
      const binding = lookupBinding(face);
      if (!binding) continue;
      adjacentFaceIds.add(binding.id);
      if (binding.slot) adjacentFaceSlots.add(binding.slot);
      if (binding.role) adjacentFaceRoles.add(binding.role);
    }
    if (adjacentFaceIds.size > 0) {
      entry.meta.adjacentFaceIds = Array.from(adjacentFaceIds).sort();
    }
    if (adjacentFaceSlots.size > 0) {
      entry.meta.adjacentFaceSlots = Array.from(adjacentFaceSlots).sort();
    }
    if (adjacentFaceRoles.size > 0) {
      entry.meta.adjacentFaceRoles = Array.from(adjacentFaceRoles).sort();
    }
  }
}
