import type { KernelResult, KernelSelection } from "../backend.js";
import type { Hole, HoleEndCondition } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { axisVector, dot, expectNumber } from "./vector_math.js";

type HoleOpsDeps = {
  faceCenter: (face: any) => [number, number, number];
  planeBasisFromFace: (face: any) => PlaneBasis;
  offsetFromPlane: (
    offset: [any, any],
    xDir: [number, number, number],
    yDir: [number, number, number]
  ) => [number, number, number];
  patternCenters: (
    patternRef: string,
    position: [any, any],
    holePlane: PlaneBasis,
    upstream: KernelResult
  ) => Array<[number, number, number]>;
  addVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  resolveHoleEndCondition: (feature: Hole) => HoleEndCondition;
  resolveHoleDepth: (
    feature: Hole,
    owner: any,
    axisDir: [number, number, number],
    origin: [number, number, number],
    holeRadius: number,
    endCondition: HoleEndCondition
  ) => number;
  readShape: (shape: any) => any;
  makeCylinder: (
    radius: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) => any;
  makeCone: (
    radius1: number,
    radius2: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) => any;
  makeBoolean: (op: "cut", left: any, right: any) => any;
  splitByTools: (result: any, tools: any[]) => any;
  normalizeSolid: (shape: any) => any;
};

export function executeHoleFeature(params: {
  feature: Hole;
  upstream: KernelResult;
  context: {
    target: KernelSelection;
    face: any;
    owner: any;
    ownerKey: string;
  };
  deps: HoleOpsDeps;
}): {
  solid: any;
  outputKey: string;
  centers: Array<[number, number, number]>;
  axisDir: [number, number, number];
  radius: number;
  counterboreRadius: number | null;
  countersink: boolean;
} {
  const { feature, upstream, context, deps } = params;
  const { target, face, owner, ownerKey } = context;

  const diameter = expectNumber(feature.diameter, "feature.diameter");
  const radius = diameter / 2;
  if (radius <= 0) {
    throw new Error("OCCT backend: hole diameter must be positive");
  }

  const faceCenter = deps.faceCenter(face);
  const plane = deps.planeBasisFromFace(face);
  const position2 = feature.position ?? [0, 0];
  const positionOffset = deps.offsetFromPlane(position2, plane.xDir, plane.yDir);
  let axisDir = axisVector(feature.axis);
  const faceNormal = target.meta["normal"];
  if (typeof faceNormal === "string") {
    const normalDir = axisVector(faceNormal as any);
    if (dot(axisDir, normalDir) > 0.9) {
      axisDir = [-normalDir[0], -normalDir[1], -normalDir[2]];
    }
  }
  if (feature.counterbore && feature.countersink) {
    throw new Error("OCCT backend: hole cannot define both counterbore and countersink");
  }
  const wizardEndCondition = deps.resolveHoleEndCondition(feature);
  if (feature.wizard?.threaded === true) {
    throw new Error(
      "OCCT backend: hole wizard threaded profiles are not yet supported; use feature.thread"
    );
  }
  let counterboreRadius: number | null = null;
  let counterboreDepth = 0;
  if (feature.counterbore) {
    const cbDiameter = expectNumber(feature.counterbore.diameter, "feature.counterbore.diameter");
    const cbDepth = expectNumber(feature.counterbore.depth, "feature.counterbore.depth");
    counterboreRadius = cbDiameter / 2;
    counterboreDepth = cbDepth;
    if (counterboreRadius <= radius) {
      throw new Error("OCCT backend: counterbore diameter must be larger than hole diameter");
    }
    if (counterboreDepth <= 0) {
      throw new Error("OCCT backend: counterbore depth must be positive");
    }
  }
  let countersinkRadius: number | null = null;
  let countersinkDepth = 0;
  if (feature.countersink) {
    const csDiameter = expectNumber(feature.countersink.diameter, "feature.countersink.diameter");
    const csAngle = expectNumber(feature.countersink.angle, "feature.countersink.angle");
    countersinkRadius = csDiameter / 2;
    if (countersinkRadius <= radius) {
      throw new Error("OCCT backend: countersink diameter must be larger than hole diameter");
    }
    if (csAngle <= 0 || csAngle >= Math.PI) {
      throw new Error("OCCT backend: countersink angle must be between 0 and PI");
    }
    const tanHalf = Math.tan(csAngle / 2);
    if (tanHalf <= 0) {
      throw new Error("OCCT backend: countersink angle is too small");
    }
    countersinkDepth = (countersinkRadius - radius) / tanHalf;
    if (!Number.isFinite(countersinkDepth) || countersinkDepth <= 0) {
      throw new Error("OCCT backend: countersink depth must be positive");
    }
  }
  const centers = feature.pattern
    ? deps.patternCenters(feature.pattern.ref, position2, plane, upstream)
    : [deps.addVec(faceCenter, positionOffset)];

  let solid = owner;
  const applyCut = (current: any, tool: any) => {
    const base = current;
    const cut = deps.makeBoolean("cut", base, tool);
    let next = deps.readShape(cut);
    next = deps.splitByTools(next, [base, tool]);
    return deps.normalizeSolid(next);
  };
  for (const origin of centers) {
    const length = deps.resolveHoleDepth(feature, owner, axisDir, origin, radius, wizardEndCondition);
    if (!(length > 0)) {
      throw new Error("OCCT backend: hole depth must be positive");
    }
    if (counterboreDepth > 0 && counterboreDepth > length) {
      throw new Error("OCCT backend: counterbore depth exceeds hole depth");
    }
    if (countersinkDepth > 0 && countersinkDepth > length) {
      throw new Error("OCCT backend: countersink depth exceeds hole depth");
    }
    const tools = [deps.readShape(deps.makeCylinder(radius, length, axisDir, origin))];
    if (counterboreRadius !== null) {
      tools.push(deps.readShape(deps.makeCylinder(counterboreRadius, counterboreDepth, axisDir, origin)));
    }
    if (countersinkRadius !== null) {
      tools.push(
        deps.readShape(deps.makeCone(countersinkRadius, radius, countersinkDepth, axisDir, origin))
      );
    }
    for (const tool of tools) {
      solid = applyCut(solid, tool);
    }
  }

  const outputKey = feature.result ?? ownerKey;
  return {
    solid,
    outputKey,
    centers,
    axisDir,
    radius,
    counterboreRadius,
    countersink: countersinkRadius !== null,
  };
}
