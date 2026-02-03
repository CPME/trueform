import { Backend, ExecuteInput, KernelResult } from "./backend.js";
import { Extrude, Profile, ProfileRef, Revolve, Sketch2D } from "./ir.js";

export type OcctModule = {
  // Placeholder for OpenCascade.js module type.
  // Real integration should thread through wasm objects here.
};

export type OcctBackendOptions = {
  occt: OcctModule;
};

export class OcctBackend implements Backend {
  private occt: OcctModule;

  constructor(options: OcctBackendOptions) {
    this.occt = options.occt;
  }

  execute(input: ExecuteInput): KernelResult {
    switch (input.feature.kind) {
      case "datum.plane":
      case "datum.axis":
      case "datum.frame":
        return { outputs: new Map(), selections: [] };
      case "feature.sketch2d":
        return this.execSketch(input.feature as Sketch2D);
      case "feature.extrude":
        return this.execExtrude(input.feature as Extrude, input.upstream);
      case "feature.revolve":
        return this.execRevolve(input.feature as Revolve, input.upstream);
      case "feature.hole":
      case "feature.fillet":
      case "feature.chamfer":
      case "feature.boolean":
      case "pattern.linear":
      case "pattern.circular":
        break;
      default:
        break;
    }

    // Scaffold: replace with real OCCT calls per feature kind.
    return { outputs: new Map(), selections: [] };
  }

  private execExtrude(feature: Extrude, upstream: KernelResult): KernelResult {
    if (feature.depth === "throughAll") {
      throw new Error("OCCT backend: throughAll not implemented yet");
    }
    const depth = feature.depth;
    const profile = this.resolveProfile(feature.profile, upstream);
    const solid = this.buildSolidFromProfile(profile, depth);
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
    return { outputs, selections: [] };
  }

  private execRevolve(feature: Revolve, upstream: KernelResult): KernelResult {
    const angle = feature.angle ?? "full";
    const angleRad = angle === "full" ? Math.PI * 2 : angle;
    const profile = this.resolveProfile(feature.profile, upstream);
    const face = this.buildProfileFace(profile);
    const axis = this.makeAxis(feature.axis, feature.origin);
    const revol = this.makeRevol(face, axis, angleRad);
    const solid = this.readShape(revol);
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
    return { outputs, selections: [] };
  }

  private execSketch(feature: Sketch2D): KernelResult {
    const outputs = new Map<string, { id: string; kind: "profile"; meta: Record<string, unknown> }>();
    for (const entry of feature.profiles) {
      outputs.set(entry.name, {
        id: `${feature.id}:${entry.name}`,
        kind: "profile",
        meta: { profile: entry.profile },
      });
    }
    return { outputs, selections: [] };
  }

  private resolveProfile(profileRef: ProfileRef, upstream: KernelResult): Profile {
    if (profileRef.kind !== "profile.ref") return profileRef;
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
    return profile;
  }

  private buildSolidFromProfile(profile: Profile, depth: number) {
    const face = this.buildProfileFace(profile);
    const vec = this.makeVec(0, 0, depth);
    const prism = this.makePrism(face, vec);
    return this.readShape(prism);
  }

  private buildProfileFace(profile: Profile) {
    switch (profile.kind) {
      case "profile.rectangle":
        return this.makeRectangleFace(profile.width, profile.height, profile.center);
      case "profile.circle":
        return this.makeCircleFace(profile.radius, profile.center);
      default:
        throw new Error(`OCCT backend: unsupported profile ${(profile as Profile).kind}`);
    }
  }

  private makeRectangleFace(width: number, height: number, center?: [number, number, number]) {
    const cx = center?.[0] ?? 0;
    const cy = center?.[1] ?? 0;
    const cz = center?.[2] ?? 0;
    const hw = width / 2;
    const hh = height / 2;
    const p1 = this.makePnt(cx - hw, cy - hh, cz);
    const p2 = this.makePnt(cx + hw, cy - hh, cz);
    const p3 = this.makePnt(cx + hw, cy + hh, cz);
    const p4 = this.makePnt(cx - hw, cy + hh, cz);
    let poly = this.newOcct("BRepBuilderAPI_MakePolygon");
    if (typeof poly.Add === "function") {
      poly.Add(p1);
      poly.Add(p2);
      poly.Add(p3);
      poly.Add(p4);
      if (typeof poly.Close === "function") poly.Close();
    } else {
      poly = this.newOcct("BRepBuilderAPI_MakePolygon", p1, p2, p3, p4, true);
    }
    const wire = typeof poly.Wire === "function" ? poly.Wire() : poly.wire?.();
    const face = new (this.occt as any).BRepBuilderAPI_MakeFace_15(wire, true);
    return face.Face();
  }

  private makeCircleFace(radius: number, center?: [number, number, number]) {
    const cx = center?.[0] ?? 0;
    const cy = center?.[1] ?? 0;
    const cz = center?.[2] ?? 0;
    const pnt = this.makePnt(cx, cy, cz);
    const dir = this.makeDir(0, 0, 1);
    const ax2 = this.makeAx2(pnt, dir);
    const circle = this.makeCirc(ax2, radius);
    const edge = new (this.occt as any).BRepBuilderAPI_MakeEdge_8(circle);
    const wire = new (this.occt as any).BRepBuilderAPI_MakeWire_2(edge.Edge());
    const face = new (this.occt as any).BRepBuilderAPI_MakeFace_15(wire.Wire(), true);
    return face.Face();
  }

  private readShape(builder: any) {
    if (builder.Shape) return builder.Shape();
    if (builder.shape) return builder.shape();
    throw new Error("OCCT backend: builder has no Shape()");
  }

  private makePrism(face: any, vec: any) {
    try {
      return this.newOcct("BRepPrimAPI_MakePrism", face, vec, false, true);
    } catch {
      return this.newOcct("BRepPrimAPI_MakePrism", face, vec);
    }
  }

  private makeRevol(face: any, axis: any, angleRad: number) {
    const candidates: Array<unknown[]> = [
      [face, axis, angleRad],
      [face, axis, angleRad, true],
      [face, axis],
    ];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepPrimAPI_MakeRevol", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct BRepPrimAPI_MakeRevol");
  }

  private newOcct(name: string, ...args: unknown[]) {
    const occt = this.occt as Record<string, any>;
    const candidates = [name];
    for (let i = 1; i <= 25; i += 1) candidates.push(`${name}_${i}`);
    for (const key of candidates) {
      const Ctor = occt[key];
      if (!Ctor) continue;
      try {
        return new Ctor(...args);
      } catch {
        continue;
      }
    }
    throw new Error(`OCCT backend: no constructor for ${name}`);
  }

  private makePnt(x: number, y: number, z: number) {
    const occt = this.occt as any;
    if (occt.gp_Pnt_3) return new occt.gp_Pnt_3(x, y, z);
    throw new Error("OCCT backend: gp_Pnt_3 constructor not available");
  }

  private makeDir(x: number, y: number, z: number) {
    const xyz = this.makeXYZ(x, y, z);
    const occt = this.occt as any;
    if (occt.gp_Dir_3) return new occt.gp_Dir_3(xyz);
    throw new Error("OCCT backend: gp_Dir_3 constructor not available");
  }

  private makeVec(x: number, y: number, z: number) {
    const xyz = this.makeXYZ(x, y, z);
    const occt = this.occt as any;
    if (occt.gp_Vec_3) return new occt.gp_Vec_3(xyz);
    throw new Error("OCCT backend: gp_Vec_3 constructor not available");
  }

  private makeXYZ(x: number, y: number, z: number) {
    const occt = this.occt as any;
    if (occt.gp_XYZ_2) return new occt.gp_XYZ_2(x, y, z);
    throw new Error("OCCT backend: gp_XYZ_2 constructor not available");
  }

  private makeAx2(pnt: any, dir: any) {
    const occt = this.occt as any;
    if (occt.gp_Ax2_3) return new occt.gp_Ax2_3(pnt, dir);
    throw new Error("OCCT backend: gp_Ax2_3 constructor not available");
  }

  private makeAx1(pnt: any, dir: any) {
    const occt = this.occt as any;
    if (occt.gp_Ax1_2) return new occt.gp_Ax1_2(pnt, dir);
    if (occt.gp_Ax1_3) return new occt.gp_Ax1_3(pnt, dir);
    throw new Error("OCCT backend: gp_Ax1 constructor not available");
  }

  private makeAxis(
    dir: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z",
    origin?: [number, number, number]
  ) {
    const [x, y, z] = axisVector(dir);
    const pnt = this.makePnt(origin?.[0] ?? 0, origin?.[1] ?? 0, origin?.[2] ?? 0);
    const axisDir = this.makeDir(x, y, z);
    return this.makeAx1(pnt, axisDir);
  }

  private makeCirc(ax2: any, radius: number) {
    const occt = this.occt as any;
    if (occt.gp_Circ_2) return new occt.gp_Circ_2(ax2, radius);
    throw new Error("OCCT backend: gp_Circ_2 constructor not available");
  }
}

function axisVector(dir: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z"): [number, number, number] {
  switch (dir) {
    case "+X":
      return [1, 0, 0];
    case "-X":
      return [-1, 0, 0];
    case "+Y":
      return [0, 1, 0];
    case "-Y":
      return [0, -1, 0];
    case "+Z":
      return [0, 0, 1];
    case "-Z":
      return [0, 0, -1];
  }
  throw new Error(`OCCT backend: invalid axis direction ${dir}`);
}
