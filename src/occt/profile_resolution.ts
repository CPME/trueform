import type { KernelResult } from "../backend.js";
import type { Profile, ProfileRef } from "../ir.js";
import { expectNumber } from "./vector_math.js";

export type ResolvedProfile = {
  profile: Profile;
  face?: any;
  wire?: any;
  wireClosed?: boolean;
  planeNormal?: [number, number, number];
  wireSegmentSlots?: string[];
};

export type ProfileBuildDeps = {
  makeRectangleFace: (width: number, height: number, center: any) => any;
  makeCircleFace: (radius: number, center: any) => any;
  makeRegularPolygonFace: (
    sides: number,
    radius: number,
    center: any,
    rotation?: number
  ) => any;
  makeRectangleWire: (width: number, height: number, center: any) => any;
  makeCircleWire: (radius: number, center: any) => any;
  makeRegularPolygonWire: (
    sides: number,
    radius: number,
    center: any,
    rotation?: number
  ) => any;
};

export function resolveProfile(profileRef: ProfileRef, upstream: KernelResult): ResolvedProfile {
  if (profileRef.kind !== "profile.ref") {
    return { profile: profileRef };
  }
  const output = upstream.outputs.get(profileRef.name);
  if (!output) {
    throw new Error(`OCCT backend: missing profile output ${profileRef.name}`);
  }
  if (output.kind !== "profile") {
    throw new Error(
      `OCCT backend: output ${profileRef.name} is not a profile (got ${output.kind})`
    );
  }
  const profile = output.meta["profile"] as Profile | undefined;
  if (!profile) {
    throw new Error(`OCCT backend: profile output ${profileRef.name} missing data`);
  }
  const face = output.meta["face"];
  const wire = output.meta["wire"];
  const wireClosed = output.meta["wireClosed"];
  const planeNormal = output.meta["planeNormal"];
  const wireSegmentSlots = output.meta["wireSegmentSlots"];
  return {
    profile,
    face,
    wire,
    wireClosed: typeof wireClosed === "boolean" ? wireClosed : undefined,
    planeNormal:
      Array.isArray(planeNormal) && planeNormal.length === 3
        ? (planeNormal as [number, number, number])
        : undefined,
    wireSegmentSlots: Array.isArray(wireSegmentSlots)
      ? wireSegmentSlots.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        )
      : undefined,
  };
}

export function buildProfileFace(profile: ResolvedProfile, deps: ProfileBuildDeps): any {
  if (profile.face) return profile.face;
  switch (profile.profile.kind) {
    case "profile.rectangle":
      return deps.makeRectangleFace(
        expectNumber(profile.profile.width, "profile.width"),
        expectNumber(profile.profile.height, "profile.height"),
        profile.profile.center
      );
    case "profile.circle":
      return deps.makeCircleFace(
        expectNumber(profile.profile.radius, "profile.radius"),
        profile.profile.center
      );
    case "profile.poly":
      return deps.makeRegularPolygonFace(
        expectNumber(profile.profile.sides, "profile.sides"),
        expectNumber(profile.profile.radius, "profile.radius"),
        profile.profile.center,
        profile.profile.rotation === undefined
          ? undefined
          : expectNumber(profile.profile.rotation, "profile.rotation")
      );
    case "profile.sketch":
      throw new Error("OCCT backend: sketch profile missing prebuilt face");
    default:
      throw new Error(`OCCT backend: unsupported profile ${(profile.profile as Profile).kind}`);
  }
}

export function buildProfileWire(
  profile: ResolvedProfile,
  deps: ProfileBuildDeps
): { wire: any; closed: boolean } {
  if (profile.wire) {
    return {
      wire: profile.wire,
      closed: profile.wireClosed !== undefined ? profile.wireClosed : true,
    };
  }
  switch (profile.profile.kind) {
    case "profile.rectangle":
      return {
        wire: deps.makeRectangleWire(
          expectNumber(profile.profile.width, "profile.width"),
          expectNumber(profile.profile.height, "profile.height"),
          profile.profile.center
        ),
        closed: true,
      };
    case "profile.circle":
      return {
        wire: deps.makeCircleWire(
          expectNumber(profile.profile.radius, "profile.radius"),
          profile.profile.center
        ),
        closed: true,
      };
    case "profile.poly":
      return {
        wire: deps.makeRegularPolygonWire(
          expectNumber(profile.profile.sides, "profile.sides"),
          expectNumber(profile.profile.radius, "profile.radius"),
          profile.profile.center,
          profile.profile.rotation === undefined
            ? undefined
            : expectNumber(profile.profile.rotation, "profile.rotation")
        ),
        closed: true,
      };
    case "profile.sketch":
      throw new Error("OCCT backend: sketch profile missing prebuilt wire");
    default:
      throw new Error(`OCCT backend: unsupported profile ${(profile.profile as Profile).kind}`);
  }
}
