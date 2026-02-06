import {
  Backend,
  ExecuteInput,
  KernelResult,
  KernelObject,
  KernelSelection,
  MeshData,
  MeshOptions,
} from "./backend.js";
import { resolveSelectorSet } from "./selectors.js";
import {
  AxisDirection,
  BooleanOp,
  Extrude,
  Fillet,
  Hole,
  Profile,
  ProfileRef,
  Revolve,
  Sketch2D,
} from "./dsl.js";

export type OcctModule = {
  // Placeholder for OpenCascade.js module type.
  // Real integration should thread through wasm objects here.
};

export type OcctBackendOptions = {
  occt: OcctModule;
};

export class OcctBackend implements Backend {
  private occt: OcctModule;
  private selectionSeq = 0;

  constructor(options: OcctBackendOptions) {
    this.occt = options.occt;
  }

  execute(input: ExecuteInput): KernelResult {
    const kind = (input.feature as { kind: string }).kind;
    switch (kind) {
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
        return this.execHole(
          input.feature as Hole,
          input.upstream,
          input.resolve
        );
      case "feature.fillet":
        return this.execFillet(
          input.feature as Fillet,
          input.upstream,
          input.resolve
        );
      case "feature.boolean":
        return this.execBoolean(
          input.feature as BooleanOp,
          input.upstream,
          input.resolve
        );
      case "feature.chamfer":
      case "pattern.linear":
      case "pattern.circular":
        throw new Error(
          `OCCT backend: ${kind} is not supported in v1`
        );
      default:
        throw new Error(`OCCT backend: unsupported feature ${kind}`);
    }
  }

  mesh(target: KernelObject, opts: MeshOptions = {}): MeshData {
    const shape = target.meta["shape"] as any;
    if (!shape) {
      throw new Error("OCCT backend: mesh target missing shape metadata");
    }
    this.ensureTriangulation(shape, opts);

    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const positions: number[] = [];
    const indices: number[] = [];
    const faceIds: number[] = [];
    let vertexOffset = 0;
    let faceIndex = 0;

    for (; explorer.More(); explorer.Next()) {
      const face = explorer.Current();
      const { triangulation, loc } = this.getTriangulation(face);
      if (!triangulation) {
        faceIndex += 1;
        continue;
      }

      const nbNodes = this.callNumber(triangulation, "NbNodes");
      for (let i = 1; i <= nbNodes; i += 1) {
        const pnt = this.call(triangulation, "Node", i);
        const transformed = this.applyLocation(pnt, loc);
        const coords = this.pointToArray(transformed);
        positions.push(coords[0], coords[1], coords[2]);
      }

      const nbTriangles = this.callNumber(triangulation, "NbTriangles");
      for (let i = 1; i <= nbTriangles; i += 1) {
        const tri = this.call(triangulation, "Triangle", i);
        const [n1, n2, n3] = this.triangleNodes(tri);
        indices.push(vertexOffset + n1 - 1, vertexOffset + n2 - 1, vertexOffset + n3 - 1);
        faceIds.push(faceIndex);
      }

      vertexOffset += nbNodes;
      faceIndex += 1;
    }

    const normals = this.computeNormals(positions, indices);
    const edgePositions =
      opts.includeEdges === false ? undefined : this.buildEdgeLines(shape, opts);
    return { positions, indices, normals, faceIds, edgePositions };
  }

  private execExtrude(feature: Extrude, upstream: KernelResult): KernelResult {
    if (feature.depth === "throughAll") {
      throw new Error("OCCT backend: throughAll not implemented yet");
    }
    if (typeof feature.depth !== "number") {
      throw new Error("OCCT backend: extrude depth must be normalized to number");
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
    const selections = this.collectSelections(solid, feature.id, feature.result);
    return { outputs, selections };
  }

  private execRevolve(feature: Revolve, upstream: KernelResult): KernelResult {
    const angle = feature.angle ?? "full";
    const angleRad =
      angle === "full"
        ? Math.PI * 2
        : typeof angle === "number"
          ? angle
          : (() => {
              throw new Error("OCCT backend: revolve angle must be normalized to number");
            })();
    const profile = this.resolveProfile(feature.profile, upstream);
    const face = this.buildProfileFace(profile);
    const axis = this.makeAxis(feature.axis, feature.origin);
    const revol = this.makeRevol(face, axis, angleRad);
    this.tryBuild(revol);
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
    const selections = this.collectSelections(solid, feature.id, feature.result);
    return { outputs, selections };
  }

  private execHole(
    feature: Hole,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const target = resolve(feature.onFace, upstream);
    if (target.kind !== "face") {
      throw new Error("OCCT backend: hole target must resolve to a face");
    }

    const ownerKey = this.resolveOwnerKey(target, upstream);
    const owner = this.resolveOwnerShape(target, upstream);
    if (!owner) {
      throw new Error("OCCT backend: hole target missing owner solid");
    }

    const diameter = expectNumber(feature.diameter, "feature.diameter");
    const radius = diameter / 2;
    if (radius <= 0) {
      throw new Error("OCCT backend: hole diameter must be positive");
    }

    const center = this.faceCenter(target.meta["shape"]);
    let axisDir = axisVector(feature.axis);
    const faceNormal = target.meta["normal"];
    if (typeof faceNormal === "string") {
      const normalDir = axisVector(faceNormal as AxisDirection);
      if (dot(axisDir, normalDir) > 0.9) {
        axisDir = [-normalDir[0], -normalDir[1], -normalDir[2]];
      }
    }
    const length =
      feature.depth === "throughAll"
        ? this.throughAllDepth(owner, axisDir)
        : expectNumber(feature.depth, "feature.depth");
    const origin: [number, number, number] = center;

    const cylinder = this.readShape(
      this.makeCylinder(radius, length, axisDir, origin)
    );
    const cut = this.makeBoolean("cut", owner, cylinder);
    let solid = this.readShape(cut);
    solid = this.splitByTools(solid, [owner, cylinder]);
    solid = this.normalizeSolid(solid);

    const outputs = new Map([
      [
        ownerKey,
        {
          id: `${feature.id}:solid`,
          kind: "solid" as const,
          meta: { shape: solid },
        },
      ],
    ]);
    const selections = this.collectSelections(solid, feature.id, ownerKey);
    return { outputs, selections };
  }

  private execBoolean(
    feature: BooleanOp,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const leftSel = resolve(feature.left, upstream);
    const rightSel = resolve(feature.right, upstream);
    const left = this.resolveOwnerShape(leftSel, upstream);
    const right = this.resolveOwnerShape(rightSel, upstream);
    if (!left || !right) {
      throw new Error("OCCT backend: boolean inputs must resolve to solids");
    }

    const op = feature.op;
    const result = this.makeBoolean(op, left, right);
    let solid = this.readShape(result);
    solid = this.splitByTools(solid, [left, right]);
    solid = this.normalizeSolid(solid);
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
    const selections = this.collectSelections(solid, feature.id, feature.result);
    return { outputs, selections };
  }

  private execFillet(
    feature: Fillet,
    upstream: KernelResult,
    _resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const targets = resolveSelectorSet(
      feature.edges,
      this.toResolutionContext(upstream)
    );
    if (targets.length === 0) {
      throw new Error("OCCT backend: fillet selector matched 0 edges");
    }
    for (const target of targets) {
      if (target.kind !== "edge") {
        throw new Error("OCCT backend: fillet selector must resolve to an edge");
      }
    }
    const ownerKey = this.resolveOwnerKey(targets[0] as KernelSelection, upstream);
    const owner = this.resolveOwnerShape(targets[0] as KernelSelection, upstream);
    if (!owner) {
      throw new Error("OCCT backend: fillet target missing owner solid");
    }

    const radius = expectNumber(feature.radius, "feature.radius");
    if (radius <= 0) {
      throw new Error("OCCT backend: fillet radius must be positive");
    }

    const fillet = this.makeFilletBuilder(owner);
    const add = (fn: string, ...args: unknown[]) => {
      const method = (fillet as Record<string, unknown>)[fn];
      if (typeof method === "function") {
        try {
          method.apply(fillet, args);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    };
    for (const target of targets) {
      const edge = this.toEdge(target.meta["shape"]);
      const added =
        add("Add_2", edge, radius) ||
        add("Add_2", radius, edge) ||
        add("Add_1", edge);
      if (!added) {
        throw new Error("OCCT backend: failed to add fillet edge");
      }
    }
    this.tryBuild(fillet);
    const solid = this.readShape(fillet);
    const outputs = new Map([
      [
        ownerKey,
        {
          id: `${feature.id}:solid`,
          kind: "solid" as const,
          meta: { shape: solid },
        },
      ],
    ]);
    const selections = this.collectSelections(solid, feature.id, ownerKey);
    return { outputs, selections };
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

  private collectSelections(
    shape: any,
    featureId: string,
    ownerKey: string
  ): KernelSelection[] {
    const occt = this.occt as any;
    const selections: KernelSelection[] = [];

    selections.push({
      id: this.nextSelectionId("solid"),
      kind: "solid",
      meta: {
        shape,
        owner: shape,
        ownerKey,
        createdBy: featureId,
        role: "body",
      },
    });

    const faceExplorer = new occt.TopExp_Explorer_1();
    faceExplorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; faceExplorer.More(); faceExplorer.Next()) {
      const face = faceExplorer.Current();
      selections.push({
        id: this.nextSelectionId("face"),
        kind: "face",
        meta: this.faceMetadata(face, shape, featureId, ownerKey),
      });
    }

    const edgeExplorer = new occt.TopExp_Explorer_1();
    edgeExplorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_EDGE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; edgeExplorer.More(); edgeExplorer.Next()) {
      const edge = edgeExplorer.Current();
      selections.push({
        id: this.nextSelectionId("edge"),
        kind: "edge",
        meta: this.edgeMetadata(edge, shape, featureId, ownerKey),
      });
    }

    return selections;
  }

  private nextSelectionId(prefix: string): string {
    this.selectionSeq += 1;
    return `${prefix}:${this.selectionSeq}`;
  }

  private faceMetadata(
    face: any,
    owner: any,
    featureId: string,
    ownerKey: string
  ): Record<string, unknown> {
    const { area, center, planar, normal } = this.faceProperties(face);
    const meta: Record<string, unknown> = {
      shape: face,
      owner,
      ownerKey,
      createdBy: featureId,
      planar,
      area,
      center,
      centerZ: center[2],
    };
    if (normal) {
      meta.normal = normal;
    }
    return meta;
  }

  private edgeMetadata(
    edge: any,
    owner: any,
    featureId: string,
    ownerKey: string
  ): Record<string, unknown> {
    const bounds = this.shapeBounds(edge);
    const center: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const centerZ = center[2];
    return {
      shape: edge,
      owner,
      ownerKey,
      createdBy: featureId,
      role: "edge",
      center,
      centerZ,
    };
  }

  private faceProperties(face: any): {
    area: number;
    center: [number, number, number];
    planar: boolean;
    normal?: AxisDirection;
  } {
    let area = 0;
    let center: [number, number, number] = [0, 0, 0];
    try {
      const props = this.newOcct("GProp_GProps");
      const faceHandle = this.toFace(face);
      const occt = this.occt as any;
      if (occt.BRepGProp?.SurfaceProperties_1) {
        occt.BRepGProp.SurfaceProperties_1(faceHandle, props, true, true);
        area = this.callNumber(props, "Mass");
        const centre = this.call(props, "CentreOfMass");
        center = this.pointToArray(centre);
      }
    } catch {
      // Fall back to bounding box below.
    }

    let planar = false;
    let normal: AxisDirection | undefined;
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const planeType = (this.occt as any).GeomAbs_SurfaceType?.GeomAbs_Plane;
      if (planeType && typeof type?.value === "number") {
        planar = type.value === planeType.value;
      }
      if (planar) {
        const plane = this.call(adaptor, "Plane");
        const axis = this.call(plane, "Axis");
        const dir = this.call(axis, "Direction");
        const [x, y, z] = this.dirToArray(dir);
        normal = axisDirectionFromVector([x, y, z]);
      }
    } catch {
      // If plane detection fails, we still return defaults.
    }

    if (area === 0) {
      const bounds = this.shapeBounds(face);
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

    return { area, center, planar, normal };
  }

  private faceCenter(face: any): [number, number, number] {
    const props = this.faceProperties(face);
    return props.center;
  }

  private resolveOwnerKey(selection: KernelSelection, upstream: KernelResult): string {
    const ownerKey = selection.meta["ownerKey"];
    if (typeof ownerKey === "string") return ownerKey;
    for (const [key, output] of upstream.outputs) {
      if (output.kind === "solid") return key;
    }
    return "body:main";
  }

  private resolveOwnerShape(selection: KernelSelection, upstream: KernelResult): any | null {
    const owner = selection.meta["owner"];
    if (owner) return owner;
    if (selection.kind === "solid") {
      const shape = selection.meta["shape"];
      if (shape) return shape;
    }
    const key = this.resolveOwnerKey(selection, upstream);
    const output = upstream.outputs.get(key);
    return output?.meta["shape"] ?? null;
  }

  private toResolutionContext(upstream: KernelResult) {
    const named = new Map<string, KernelSelection>();
    for (const [key, obj] of upstream.outputs) {
      if (obj.kind === "face" || obj.kind === "edge" || obj.kind === "solid") {
        named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
      }
    }
    return { selections: upstream.selections, named };
  }

  private shapeBounds(shape: any): { min: [number, number, number]; max: [number, number, number] } {
    const occt = this.occt as any;
    const box = this.newOcct("Bnd_Box");
    if (!occt.BRepBndLib?.Add) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }
    occt.BRepBndLib.Add(shape, box, true);
    const min = this.pointToArray(box.CornerMin());
    const max = this.pointToArray(box.CornerMax());
    return { min, max };
  }

  private throughAllDepth(shape: any, axisDir: [number, number, number]): number {
    const bounds = this.shapeBounds(shape);
    const lenX = bounds.max[0] - bounds.min[0];
    const lenY = bounds.max[1] - bounds.min[1];
    const lenZ = bounds.max[2] - bounds.min[2];
    const base =
      Math.abs(axisDir[0]) > 0.5
        ? lenX
        : Math.abs(axisDir[1]) > 0.5
          ? lenY
          : lenZ;
    const margin = Math.max(base * 0.2, 1);
    return base + margin;
  }

  private makeCylinder(
    radius: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) {
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(axisDir[0], axisDir[1], axisDir[2]);
    const ax2 = this.makeAx2(pnt, dir);
    const occt = this.occt as Record<string, any>;
    const ctorWithAxis = occt.BRepPrimAPI_MakeCylinder_3;
    if (typeof ctorWithAxis === "function") {
      return new ctorWithAxis(ax2, radius, height);
    }
    const candidates: Array<unknown[]> = [
      [ax2, radius, height],
      [radius, height],
    ];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepPrimAPI_MakeCylinder", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct cylinder");
  }

  private makeFilletBuilder(shape: any) {
    const occt = this.occt as any;
    const filletShape = occt.ChFi3d_FilletShape?.ChFi3d_Rational;
    const candidates: Array<unknown[]> = filletShape ? [[shape, filletShape], [shape]] : [[shape]];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepFilletAPI_MakeFillet", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct fillet builder");
  }

  private makeBoolean(
    op: "union" | "subtract" | "intersect" | "cut",
    left: any,
    right: any
  ) {
    const map: Record<string, string> = {
      union: "BRepAlgoAPI_Fuse",
      subtract: "BRepAlgoAPI_Cut",
      cut: "BRepAlgoAPI_Cut",
      intersect: "BRepAlgoAPI_Common",
    };
    const ctor = map[op];
    if (!ctor) {
      throw new Error(`OCCT backend: unsupported boolean op ${op}`);
    }
    const progress = this.makeProgressRange();
    const occt = this.occt as Record<string, any>;
    const ctorWithProgress = occt[`${ctor}_3`];
    if (typeof ctorWithProgress === "function" && progress) {
      try {
        const builder = new ctorWithProgress(left, right, progress);
        this.tryBuild(builder);
        return builder;
      } catch {
        // fall back to generic constructor search
      }
    }

    const candidates: Array<unknown[]> = [
      [left, right, progress],
      [left, right],
    ];
    for (const args of candidates) {
      try {
        const builder = this.newOcct(ctor, ...args);
        this.tryBuild(builder);
        return builder;
      } catch {
        continue;
      }
    }
    throw new Error(`OCCT backend: failed to construct ${ctor}`);
  }

  private splitByTools(result: any, tools: any[]): any {
    const occt = this.occt as Record<string, any>;
    if (!occt.BOPAlgo_Splitter_1) return result;
    const progress = this.makeProgressRange();
    if (!progress) return result;
    let splitter: any;
    try {
      splitter = this.newOcct("BOPAlgo_Splitter");
    } catch {
      return result;
    }
    const call = (name: string, ...args: unknown[]) => {
      const method = splitter?.[name];
      if (typeof method !== "function") return false;
      try {
        method.apply(splitter, args);
        return true;
      } catch {
        return false;
      }
    };
    call("SetNonDestructive", true);
    const glueOff = occt.BOPAlgo_GlueEnum?.BOPAlgo_GlueOff;
    if (glueOff) call("SetGlue", glueOff);
    call("AddArgument", result);
    for (const tool of tools) {
      if (!tool) continue;
      call("AddTool", tool);
    }
    try {
      splitter.Perform(progress);
    } catch {
      return result;
    }
    try {
      return this.readShape(splitter);
    } catch {
      return result;
    }
  }

  private normalizeSolid(shape: any): any {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_SOLID,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const solids: any[] = [];
    for (; explorer.More(); explorer.Next()) {
      solids.push(explorer.Current());
    }
    if (solids.length === 0) return shape;
    if (solids.length === 1) return solids[0];
    if (!occt.GProp_GProps_1 || !occt.BRepGProp?.VolumeProperties_1) {
      return solids[0];
    }
    let best = solids[0];
    let bestVolume = -Infinity;
    for (const solid of solids) {
      const volume = this.solidVolume(solid);
      if (volume > bestVolume) {
        bestVolume = volume;
        best = solid;
      }
    }
    return best;
  }

  private solidVolume(solid: any): number {
    const occt = this.occt as any;
    if (!occt.GProp_GProps_1 || !occt.BRepGProp?.VolumeProperties_1) {
      return -Infinity;
    }
    try {
      const props = new occt.GProp_GProps_1();
      occt.BRepGProp.VolumeProperties_1(solid, props, true, true, true);
      const mass = typeof props.Mass === "function" ? props.Mass() : undefined;
      return typeof mass === "number" && !Number.isNaN(mass) ? mass : -Infinity;
    } catch {
      return -Infinity;
    }
  }

  private tryBuild(builder: any) {
    if (!builder || typeof builder.Build !== "function") return;
    const progress = this.makeProgressRange();
    try {
      builder.Build(progress);
      return;
    } catch {
      // fall through
    }
    try {
      builder.Build();
    } catch {
      // ignore build failures; some builders auto-build
    }
  }

  private toFace(face: any) {
    const occt = this.occt as any;
    if (occt.TopoDS?.Face_1) {
      return occt.TopoDS.Face_1(face);
    }
    return face;
  }

  private toEdge(edge: any) {
    const occt = this.occt as any;
    if (occt.TopoDS?.Edge_1) {
      return occt.TopoDS.Edge_1(edge);
    }
    return edge;
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
        return this.makeRectangleFace(
          expectNumber(profile.width, "profile.width"),
          expectNumber(profile.height, "profile.height"),
          profile.center
        );
      case "profile.circle":
        return this.makeCircleFace(
          expectNumber(profile.radius, "profile.radius"),
          profile.center
        );
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
    dir: AxisDirection,
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

  private ensureTriangulation(shape: any, opts: MeshOptions) {
    const linear = opts.linearDeflection ?? 0.5;
    const angular = opts.angularDeflection ?? 0.5;
    const relative = opts.relative ?? false;
    const progress = this.makeProgressRange();
    const argsList: Array<unknown[]> = [
      ["BRepMesh_IncrementalMesh_2", [shape, linear, relative, angular, progress]],
      [
        "BRepMesh_IncrementalMesh_2",
        [shape, linear, relative, angular, this.makeProgressRange()],
      ],
    ];
    for (const [name, args] of argsList) {
      try {
        this.newOcct(name as string, ...(args as unknown[]));
        return;
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to triangulate shape");
  }

  private makeProgressRange() {
    try {
      return this.newOcct("Message_ProgressRange_1");
    } catch {
      return null;
    }
  }

  private getTriangulation(face: any): { triangulation: any; loc: any } {
    const occt = this.occt as any;
    const loc = this.newOcct("TopLoc_Location_1");
    const tool = occt.BRep_Tool;
    const topo = occt.TopoDS;
    if (!tool?.Triangulation) {
      throw new Error("OCCT backend: BRep_Tool.Triangulation not available");
    }
    if (!topo?.Face_1) {
      throw new Error("OCCT backend: TopoDS.Face_1 not available");
    }
    const faceHandle = topo.Face_1(face);
    const triHandle = tool.Triangulation(faceHandle, loc, 0);
    if (triHandle?.IsNull && triHandle.IsNull()) {
      return { triangulation: null, loc };
    }
    const triangulation = triHandle?.get ? triHandle.get() : triHandle;
    return { triangulation, loc };
  }

  private applyLocation(pnt: any, loc: any) {
    if (!loc || typeof loc.Transformation !== "function") return pnt;
    const trsf = loc.Transformation();
    if (!trsf || typeof pnt.Transformed !== "function") return pnt;
    return pnt.Transformed(trsf);
  }

  private pointToArray(pnt: any): [number, number, number] {
    if (typeof pnt.X === "function") {
      return [pnt.X(), pnt.Y(), pnt.Z()];
    }
    if (typeof pnt.x === "function") {
      return [pnt.x(), pnt.y(), pnt.z()];
    }
    if (typeof pnt.Coord === "function") {
      const out = { value: [] as number[] };
      pnt.Coord(out);
      const coords = out.value;
      return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
    }
    throw new Error("OCCT backend: unsupported point type");
  }

  private dirToArray(dir: any): [number, number, number] {
    if (typeof dir.X === "function") {
      return [dir.X(), dir.Y(), dir.Z()];
    }
    if (typeof dir.x === "function") {
      return [dir.x(), dir.y(), dir.z()];
    }
    if (typeof dir.Coord === "function") {
      const out = { value: [] as number[] };
      dir.Coord(out);
      const coords = out.value;
      return [coords[0] ?? 0, coords[1] ?? 0, coords[2] ?? 0];
    }
    throw new Error("OCCT backend: unsupported direction type");
  }

  private computeNormals(positions: number[], indices: number[]): number[] {
    if (positions.length === 0 || indices.length === 0) return [];
    const normals = new Array(positions.length).fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const iaIndex = indices[i];
      const ibIndex = indices[i + 1];
      const icIndex = indices[i + 2];
      if (iaIndex === undefined || ibIndex === undefined || icIndex === undefined) {
        continue;
      }
      const ia = iaIndex * 3;
      const ib = ibIndex * 3;
      const ic = icIndex * 3;
      const ax = positions[ia] ?? 0;
      const ay = positions[ia + 1] ?? 0;
      const az = positions[ia + 2] ?? 0;
      const bx = positions[ib] ?? 0;
      const by = positions[ib + 1] ?? 0;
      const bz = positions[ib + 2] ?? 0;
      const cx = positions[ic] ?? 0;
      const cy = positions[ic + 1] ?? 0;
      const cz = positions[ic + 2] ?? 0;
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      normals[ia] += nx;
      normals[ia + 1] += ny;
      normals[ia + 2] += nz;
      normals[ib] += nx;
      normals[ib + 1] += ny;
      normals[ib + 2] += nz;
      normals[ic] += nx;
      normals[ic + 1] += ny;
      normals[ic + 2] += nz;
    }

    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i];
      const ny = normals[i + 1];
      const nz = normals[i + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-12) {
        normals[i] = nx / len;
        normals[i + 1] = ny / len;
        normals[i + 2] = nz / len;
      } else {
        normals[i] = 0;
        normals[i + 1] = 0;
        normals[i + 2] = 0;
      }
    }
    return normals;
  }

  private triangleNodes(tri: any): [number, number, number] {
    if (typeof tri.Value === "function") {
      return [tri.Value(1), tri.Value(2), tri.Value(3)];
    }
    if (typeof tri.Get === "function") {
      const a = { value: 0 };
      const b = { value: 0 };
      const c = { value: 0 };
      tri.Get(a, b, c);
      return [a.value, b.value, c.value];
    }
    throw new Error("OCCT backend: unsupported triangle type");
  }

  private call(target: any, name: string, ...args: unknown[]) {
    const fn = target?.[name];
    if (typeof fn !== "function") {
      throw new Error(`OCCT backend: missing ${name}()`);
    }
    return fn.call(target, ...args);
  }

  private callNumber(target: any, name: string): number {
    const value = this.call(target, name);
    if (typeof value !== "number") {
      throw new Error(`OCCT backend: ${name}() did not return number`);
    }
    return value;
  }

  private buildEdgeLines(shape: any, opts: MeshOptions): number[] {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_EDGE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const positions: number[] = [];
    for (; explorer.More(); explorer.Next()) {
      const edgeShape = explorer.Current();
      const edge = this.toEdge(edgeShape);
      const points = this.sampleEdgePoints(edge, opts);
      if (points.length < 2) continue;
      for (let i = 0; i + 1 < points.length; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    return positions;
  }

  private sampleEdgePoints(edge: any, opts: MeshOptions): Array<[number, number, number]> {
    try {
      const adaptor = this.newOcct("BRepAdaptor_Curve", edge);
      const first = this.callNumber(adaptor, "FirstParameter");
      const last = this.callNumber(adaptor, "LastParameter");
      if (!Number.isFinite(first) || !Number.isFinite(last)) return [];

      const bounds = this.shapeBounds(edge);
      const dx = bounds.max[0] - bounds.min[0];
      const dy = bounds.max[1] - bounds.min[1];
      const dz = bounds.max[2] - bounds.min[2];
      const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const step = opts.edgeSegmentLength && opts.edgeSegmentLength > 0 ? opts.edgeSegmentLength : 1;
      const maxSegments = Math.max(1, opts.edgeMaxSegments ?? 64);
      const span = Math.abs(last - first);
      const byDiag = Math.ceil((diag || step) / step);
      const bySpan = Math.ceil(span || 1);
      const segments = Math.min(maxSegments, Math.max(1, byDiag, bySpan));

      const points: Array<[number, number, number]> = [];
      for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const u = first + (last - first) * t;
        const pnt = this.call(adaptor, "Value", u);
        points.push(this.pointToArray(pnt));
      }
      return points;
    } catch {
      return [];
    }
  }
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`OCCT backend: ${label} must be a number`);
  }
  return value;
}

function axisVector(dir: AxisDirection): [number, number, number] {
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

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function axisDirectionFromVector(vec: [number, number, number]): AxisDirection | undefined {
  const [x, y, z] = vec;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const max = Math.max(ax, ay, az);
  if (max < 0.5) return undefined;
  if (max === ax) return x >= 0 ? "+X" : "-X";
  if (max === ay) return y >= 0 ? "+Y" : "-Y";
  return z >= 0 ? "+Z" : "-Z";
}
