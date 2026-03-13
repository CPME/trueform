import type { ExecuteInput, KernelResult, KernelSelection } from "../backend.js";
import type {
  Extrude,
  Loft,
  Pipe,
  Plane,
  Revolve,
  Surface,
} from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import type { SelectionCollectionOptions, SelectionLedgerPlan } from "./operation_contexts.js";
import type { ResolvedProfile } from "./profile_resolution.js";
import { publishShapeResult } from "./shape_result.js";
import { axisVector, expectNumber } from "./vector_math.js";

type CollectSelections = (
  shape: unknown,
  featureId: string,
  ownerKey: string,
  featureTags?: string[],
  opts?: SelectionCollectionOptions
) => KernelSelection[];

export type ModelingFeatureContext = {
  collectSelections: CollectSelections;
  resolveProfile: (profileRef: Extrude["profile"] | Surface["profile"] | Revolve["profile"] | Loft["profiles"][number], upstream: KernelResult) => ResolvedProfile;
  buildProfileFace: (profile: ResolvedProfile) => unknown;
  buildProfileWire: (profile: ResolvedProfile) => { wire: unknown; closed: boolean };
  resolveExtrudeAxis: (
    axis: Extrude["axis"],
    profile: ResolvedProfile,
    upstream: KernelResult
  ) => [number, number, number];
  makeVec: (x: number, y: number, z: number) => unknown;
  makePrism: (faceOrWire: unknown, vec: unknown) => unknown;
  readShape: (builder: unknown) => unknown;
  makePrismSelectionLedgerPlan: (
    axis: [number, number, number],
    ctx: { prism: unknown; wire?: unknown; wireSegmentSlots?: string[] }
  ) => SelectionLedgerPlan;
  resolvePlaneBasis: (
    planeRef: Plane["plane"],
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ) => PlaneBasis;
  scaleVec: (v: [number, number, number], s: number) => [number, number, number];
  addVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  subVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  makePolygonWire: (points: [number, number, number][]) => unknown;
  makeFaceFromWire: (wire: unknown) => unknown;
  makeAxis: (dir: Revolve["axis"], origin?: Revolve["origin"]) => unknown;
  makeRevol: (faceOrWire: unknown, axis: unknown, angleRad: number) => unknown;
  tryBuild: (builder: unknown) => void;
  makeRevolveSelectionLedgerPlan: (
    angleRad: number,
    ctx: { revol: unknown; wire: unknown; wireSegmentSlots: string[] }
  ) => SelectionLedgerPlan;
  makeLoftBuilder: (isSolid: boolean) => unknown;
  addLoftWire: (builder: unknown, wire: unknown) => void;
  callWithFallback: (target: unknown, methods: string[], argSets: unknown[][]) => unknown;
  makeCylinder: (
    radius: number,
    height: number,
    axis: [number, number, number],
    center: [number, number, number]
  ) => unknown;
  makeBoolean: (op: "cut", left: unknown, right: unknown) => unknown;
  splitByTools: (shape: unknown, tools: unknown[]) => unknown;
  normalizeSolid: (shape: unknown) => unknown;
};

export function execExtrude(
  ctx: ModelingFeatureContext,
  feature: Extrude,
  upstream: KernelResult
): KernelResult {
  if (feature.depth === "throughAll") {
    throw new Error("OCCT backend: throughAll not implemented yet");
  }
  if (typeof feature.depth !== "number") {
    throw new Error("OCCT backend: extrude depth must be normalized to number");
  }
  const profile = ctx.resolveProfile(feature.profile, upstream);
  const mode = feature.mode ?? "solid";
  if (mode === "solid" && profile.profile.kind === "profile.sketch" && profile.profile.open) {
    throw new Error("OCCT backend: extrude solid requires a closed sketch profile");
  }
  const depth = feature.depth;
  const axis = ctx.resolveExtrudeAxis(feature.axis, profile, upstream);
  const vec = ctx.makeVec(axis[0] * depth, axis[1] * depth, axis[2] * depth);

  if (mode === "surface") {
    const section = ctx.buildProfileWire(profile);
    const prism = ctx.makePrism(section.wire, vec);
    const shape = ctx.readShape(prism);
    return publishShapeResult({
      shape,
      featureId: feature.id,
      ownerKey: feature.result,
      resultKey: feature.result,
      outputKind: "surface",
      tags: feature.tags,
      opts: { rootKind: "face" },
      collectSelections: ctx.collectSelections,
    });
  }

  const face = ctx.buildProfileFace(profile);
  const prism = ctx.makePrism(face, vec);
  const solid = ctx.readShape(prism);
  return publishShapeResult({
    shape: solid,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "solid",
    tags: feature.tags,
    opts: {
      ledgerPlan: ctx.makePrismSelectionLedgerPlan(axis, {
        prism,
        wire: profile.wire,
        wireSegmentSlots: profile.wireSegmentSlots,
      }),
    },
    collectSelections: ctx.collectSelections,
  });
}

export function execPlane(
  ctx: ModelingFeatureContext,
  feature: Plane,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"]
): KernelResult {
  const width = expectNumber(feature.width, "plane width");
  const height = expectNumber(feature.height, "plane height");
  if (!(width > 0)) {
    throw new Error("OCCT backend: plane width must be greater than zero");
  }
  if (!(height > 0)) {
    throw new Error("OCCT backend: plane height must be greater than zero");
  }

  const basis = feature.plane
    ? ctx.resolvePlaneBasis(feature.plane, upstream, resolve)
    : {
        origin: [0, 0, 0] as [number, number, number],
        xDir: [1, 0, 0] as [number, number, number],
        yDir: [0, 1, 0] as [number, number, number],
        normal: [0, 0, 1] as [number, number, number],
      };
  const originOffset = feature.origin ?? [0, 0, 0];
  const center: [number, number, number] = [
    basis.origin[0] + expectNumber(originOffset[0], "plane origin[0]"),
    basis.origin[1] + expectNumber(originOffset[1], "plane origin[1]"),
    basis.origin[2] + expectNumber(originOffset[2], "plane origin[2]"),
  ];

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const xOffset = ctx.scaleVec(basis.xDir, halfWidth);
  const yOffset = ctx.scaleVec(basis.yDir, halfHeight);
  const corners: [number, number, number][] = [
    ctx.addVec(ctx.addVec(center, xOffset), yOffset),
    ctx.addVec(ctx.subVec(center, xOffset), yOffset),
    ctx.subVec(ctx.subVec(center, xOffset), yOffset),
    ctx.subVec(ctx.addVec(center, xOffset), yOffset),
  ];

  const shape = ctx.readShape(ctx.makeFaceFromWire(ctx.makePolygonWire(corners)));
  return publishShapeResult({
    shape,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "face",
    tags: feature.tags,
    opts: { rootKind: "face" },
    collectSelections: ctx.collectSelections,
  });
}

export function execSurface(
  ctx: ModelingFeatureContext,
  feature: Surface,
  upstream: KernelResult
): KernelResult {
  const face = ctx.buildProfileFace(ctx.resolveProfile(feature.profile, upstream));
  return publishShapeResult({
    shape: face,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "face",
    tags: feature.tags,
    opts: { rootKind: "face" },
    collectSelections: ctx.collectSelections,
  });
}

export function execRevolve(
  ctx: ModelingFeatureContext,
  feature: Revolve,
  upstream: KernelResult
): KernelResult {
  const angle = feature.angle ?? "full";
  const angleRad =
    angle === "full"
      ? Math.PI * 2
      : typeof angle === "number"
        ? angle
        : (() => {
            throw new Error("OCCT backend: revolve angle must be normalized to number");
          })();
  const profile = ctx.resolveProfile(feature.profile, upstream);
  const axis = ctx.makeAxis(feature.axis, feature.origin);
  const ledgerPlan =
    profile.wire && profile.wireSegmentSlots
      ? ctx.makeRevolveSelectionLedgerPlan(angleRad, {
          revol: null,
          wire: profile.wire,
          wireSegmentSlots: profile.wireSegmentSlots,
        })
      : undefined;
  const mode = feature.mode ?? "solid";
  if (mode === "surface") {
    const section = ctx.buildProfileWire(profile);
    const revol = ctx.makeRevol(section.wire, axis, angleRad);
    ctx.tryBuild(revol);
    const shape = ctx.readShape(revol);
    return publishShapeResult({
      shape,
      featureId: feature.id,
      ownerKey: feature.result,
      resultKey: feature.result,
      outputKind: "surface",
      tags: feature.tags,
      opts: {
        rootKind: "face",
        ledgerPlan:
          profile.wire && profile.wireSegmentSlots
            ? ctx.makeRevolveSelectionLedgerPlan(angleRad, {
                revol,
                wire: profile.wire,
                wireSegmentSlots: profile.wireSegmentSlots,
              })
            : undefined,
      },
      collectSelections: ctx.collectSelections,
    });
  }

  const revol = ctx.makeRevol(ctx.buildProfileFace(profile), axis, angleRad);
  ctx.tryBuild(revol);
  const solid = ctx.readShape(revol);
  return publishShapeResult({
    shape: solid,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "solid",
    tags: feature.tags,
    opts: {
      ledgerPlan:
        profile.wire && profile.wireSegmentSlots
          ? ctx.makeRevolveSelectionLedgerPlan(angleRad, {
              revol,
              wire: profile.wire,
              wireSegmentSlots: profile.wireSegmentSlots,
            })
          : undefined,
    },
    collectSelections: ctx.collectSelections,
  });
}

export function execLoft(
  ctx: ModelingFeatureContext,
  feature: Loft,
  upstream: KernelResult
): KernelResult {
  const profiles = feature.profiles ?? [];
  if (profiles.length < 2) {
    throw new Error("OCCT backend: loft requires at least two profiles");
  }
  const resolved = profiles.map((profileRef) => ctx.resolveProfile(profileRef, upstream));
  const sections = resolved.map((profile) => ctx.buildProfileWire(profile));
  const allClosed = sections.every((section) => section.closed);
  let isSolid = allClosed;
  const mode = feature.mode;
  if (mode === "surface") {
    isSolid = false;
  } else if (mode === "solid") {
    if (!allClosed) {
      throw new Error("OCCT backend: loft solid requires closed profiles");
    }
    isSolid = true;
  }
  const loft = ctx.makeLoftBuilder(isSolid);
  for (const section of sections) {
    ctx.addLoftWire(loft, section.wire);
  }
  if (
    typeof (loft as any).CheckCompatibility === "function" ||
    typeof (loft as any).CheckCompatibility_1 === "function"
  ) {
    try {
      ctx.callWithFallback(loft, ["CheckCompatibility", "CheckCompatibility_1"], [[true], [false]]);
    } catch {
      // ignore compatibility check failures; build will surface real issues
    }
  }
  ctx.tryBuild(loft);
  const shape = ctx.readShape(loft);
  return publishShapeResult({
    shape,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: isSolid ? "solid" : "surface",
    tags: feature.tags,
    opts: { rootKind: isSolid ? "solid" : "face" },
    collectSelections: ctx.collectSelections,
  });
}

export function execPipe(
  ctx: ModelingFeatureContext,
  feature: Pipe
): KernelResult {
  const axisDir = axisVector(feature.axis);
  const length = expectNumber(feature.length, "feature.length");
  if (length <= 0) {
    throw new Error("OCCT backend: pipe length must be positive");
  }
  const outerDia = expectNumber(feature.outerDiameter, "feature.outerDiameter");
  const innerDia =
    feature.innerDiameter === undefined
      ? 0
      : expectNumber(feature.innerDiameter, "feature.innerDiameter");
  const outerRadius = outerDia / 2;
  const innerRadius = innerDia / 2;
  if (outerRadius <= 0) {
    throw new Error("OCCT backend: pipe outer diameter must be positive");
  }
  if (innerRadius < 0) {
    throw new Error("OCCT backend: pipe inner diameter must be non-negative");
  }
  if (innerRadius > 0 && innerRadius >= outerRadius) {
    throw new Error("OCCT backend: pipe inner diameter must be smaller than outer diameter");
  }

  const origin = feature.origin ?? [0, 0, 0];
  const originVec: [number, number, number] = [
    expectNumber(origin[0] ?? 0, "feature.origin[0]"),
    expectNumber(origin[1] ?? 0, "feature.origin[1]"),
    expectNumber(origin[2] ?? 0, "feature.origin[2]"),
  ];
  const outerShape = ctx.readShape(ctx.makeCylinder(outerRadius, length, axisDir, originVec));

  let solid = outerShape;
  if (innerRadius > 0) {
    const innerShape = ctx.readShape(ctx.makeCylinder(innerRadius, length, axisDir, originVec));
    solid = ctx.readShape(ctx.makeBoolean("cut", outerShape, innerShape));
    solid = ctx.splitByTools(solid, [outerShape, innerShape]);
    solid = ctx.normalizeSolid(solid);
  }

  return publishShapeResult({
    shape: solid,
    featureId: feature.id,
    ownerKey: feature.result,
    resultKey: feature.result,
    outputKind: "solid",
    tags: feature.tags,
    collectSelections: ctx.collectSelections,
  });
}
