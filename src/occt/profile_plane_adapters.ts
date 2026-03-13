import type { ExecuteInput, KernelResult } from "../backend.js";
import type { PlaneRef, Sketch2D } from "../ir.js";
import {
  buildProfileFace,
  buildProfileWire,
  type ProfileBuildDeps,
  type ResolvedProfile,
} from "./profile_resolution.js";
import {
  planeBasisFromFace,
  resolvePlaneBasis,
  resolveSketchPlane,
  type PlaneBasis,
  type PlaneBasisFaceDeps,
} from "./plane_basis.js";

export type ProfilePlaneAdapterDeps = {
  datumKey: (id: string) => string;
  occt: any;
  toFace: (target: any) => any;
  newOcct: (name: string, ...args: any[]) => any;
  call: (target: any, name: string, ...args: any[]) => any;
  pointToArray: (point: any) => [number, number, number];
  dirToArray: (dir: any) => [number, number, number];
  makeRectangleFace: ProfileBuildDeps["makeRectangleFace"];
  makeCircleFace: ProfileBuildDeps["makeCircleFace"];
  makeRegularPolygonFace: ProfileBuildDeps["makeRegularPolygonFace"];
  makeRectangleWire: ProfileBuildDeps["makeRectangleWire"];
  makeCircleWire: ProfileBuildDeps["makeCircleWire"];
  makeRegularPolygonWire: ProfileBuildDeps["makeRegularPolygonWire"];
};

export function buildProfileFaceWithDeps(
  profile: ResolvedProfile,
  deps: ProfilePlaneAdapterDeps
): any {
  return buildProfileFace(profile, toProfileBuildDeps(deps));
}

export function buildProfileWireWithDeps(
  profile: ResolvedProfile,
  deps: ProfilePlaneAdapterDeps
): { wire: any; closed: boolean } {
  return buildProfileWire(profile, toProfileBuildDeps(deps));
}

export function resolveSketchPlaneWithDeps(
  feature: Sketch2D,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"],
  deps: ProfilePlaneAdapterDeps
): PlaneBasis {
  return resolveSketchPlane({
    feature,
    upstream,
    resolve,
    deps: toPlaneResolveDeps(deps),
  });
}

export function resolvePlaneBasisWithDeps(
  planeRef: PlaneRef,
  upstream: KernelResult,
  resolve: ExecuteInput["resolve"],
  deps: ProfilePlaneAdapterDeps
): PlaneBasis {
  return resolvePlaneBasis({
    planeRef,
    upstream,
    resolve,
    deps: toPlaneResolveDeps(deps),
  });
}

export function planeBasisFromFaceWithDeps(
  face: any,
  deps: ProfilePlaneAdapterDeps
): PlaneBasis {
  return planeBasisFromFace({
    face,
    deps: toPlaneBasisFaceDeps(deps),
  });
}

function toProfileBuildDeps(deps: ProfilePlaneAdapterDeps): ProfileBuildDeps {
  return {
    makeRectangleFace: deps.makeRectangleFace,
    makeCircleFace: deps.makeCircleFace,
    makeRegularPolygonFace: deps.makeRegularPolygonFace,
    makeRectangleWire: deps.makeRectangleWire,
    makeCircleWire: deps.makeCircleWire,
    makeRegularPolygonWire: deps.makeRegularPolygonWire,
  };
}

function toPlaneResolveDeps(deps: ProfilePlaneAdapterDeps) {
  return {
    datumKey: deps.datumKey,
    planeBasisFromFace: (face: any) => planeBasisFromFaceWithDeps(face, deps),
  };
}

function toPlaneBasisFaceDeps(deps: ProfilePlaneAdapterDeps): PlaneBasisFaceDeps {
  return {
    occt: deps.occt,
    toFace: deps.toFace,
    newOcct: deps.newOcct,
    call: deps.call,
    pointToArray: deps.pointToArray,
    dirToArray: deps.dirToArray,
  };
}
