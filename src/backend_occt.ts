import {
  Backend,
  BackendCapabilities,
  ExecuteInput,
  KernelResult,
  KernelObject,
  KernelSelection,
  MeshData,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
} from "./backend.js";
import { resolveSelectorSet } from "./selectors.js";
import { BackendError } from "./errors.js";
import { TF_STAGED_FEATURES } from "./feature_staging.js";
import {
  AxisDirection,
  AxisSpec,
  DatumAxis,
  DatumFrame,
  DatumPlane,
  ID,
  BooleanOp,
  Extrude,
  ExtrudeAxis,
  Fillet,
  Hole,
  Loft,
  Sweep,
  Shell,
  Pipe,
  PipeSweep,
  Plane,
  HexTubeSweep,
  PlaneRef,
  Path3D,
  PathSegment,
  PatternCircular,
  PatternLinear,
  Point2D,
  Point3D,
  Profile,
  ProfileRef,
  Revolve,
  Selector,
  Sketch2D,
  SketchEntity,
  Surface,
  Mirror,
  Draft,
  Thicken,
  Thread,
} from "./ir.js";

export type OcctModule = {
  // Placeholder for OpenCascade.js module type.
  // Real integration should thread through wasm objects here.
};

export type OcctBackendOptions = {
  occt: OcctModule;
};

type ResolvedProfile = {
  profile: Profile;
  face?: any;
  wire?: any;
  wireClosed?: boolean;
};

type PlaneBasis = {
  origin: [number, number, number];
  xDir: [number, number, number];
  yDir: [number, number, number];
  normal: [number, number, number];
};

type EdgeSegment = {
  edge: any;
  start: [number, number, number];
  end: [number, number, number];
  closed?: boolean;
};

export class OcctBackend implements Backend {
  private occt: OcctModule;
  private selectionSeq = 0;

  constructor(options: OcctBackendOptions) {
    this.occt = options.occt;
  }

  capabilities(): BackendCapabilities {
    return {
      name: "opencascade.js",
      featureKinds: [
        "datum.plane",
        "datum.axis",
        "datum.frame",
        "feature.sketch2d",
        "feature.extrude",
        "feature.plane",
        "feature.surface",
        "feature.revolve",
        "feature.loft",
        "feature.sweep",
        "feature.shell",
        "feature.pipe",
        "feature.pipeSweep",
        "feature.hexTubeSweep",
        "feature.mirror",
        "feature.draft",
        "feature.thicken",
        "feature.thread",
        "feature.hole",
        "feature.fillet",
        "feature.chamfer",
        "feature.boolean",
        "pattern.linear",
        "pattern.circular",
      ],
      featureStages: TF_STAGED_FEATURES,
      mesh: true,
      exports: { step: true, stl: true },
      assertions: ["assert.brepValid", "assert.minEdgeLength"],
    };
  }

  execute(input: ExecuteInput): KernelResult {
    if (input.upstream.outputs.size === 0 && input.upstream.selections.length === 0) {
      // Runtime service reuses a backend instance; reset ids per build so selection ids stay stable.
      this.selectionSeq = 0;
    }
    const kind = (input.feature as { kind: string }).kind;
    switch (kind) {
      case "datum.plane":
        return this.execDatumPlane(input.feature as any, input.upstream);
      case "datum.axis":
        return this.execDatumAxis(input.feature as any, input.upstream);
      case "datum.frame":
        return this.execDatumFrame(
          input.feature as any,
          input.upstream,
          input.resolve
        );
      case "feature.sketch2d":
        return this.execSketch(
          input.feature as Sketch2D,
          input.upstream,
          input.resolve
        );
      case "feature.extrude":
        return this.execExtrude(input.feature as Extrude, input.upstream);
      case "feature.plane":
        return this.execPlane(
          input.feature as Plane,
          input.upstream,
          input.resolve
        );
      case "feature.surface":
        return this.execSurface(input.feature as Surface, input.upstream);
      case "feature.revolve":
        return this.execRevolve(input.feature as Revolve, input.upstream);
      case "feature.loft":
        return this.execLoft(input.feature as Loft, input.upstream);
      case "feature.sweep":
        return this.execSweep(
          input.feature as Sweep,
          input.upstream,
          input.resolve
        );
      case "feature.shell":
        return this.execShell(
          input.feature as Shell,
          input.upstream,
          input.resolve
        );
      case "feature.pipe":
        return this.execPipe(input.feature as Pipe, input.upstream);
      case "feature.pipeSweep":
        return this.execPipeSweep(input.feature as PipeSweep, input.upstream);
      case "feature.hexTubeSweep":
        return this.execHexTubeSweep(input.feature as HexTubeSweep, input.upstream);
      case "feature.mirror":
        return this.execMirror(
          input.feature as Mirror,
          input.upstream,
          input.resolve
        );
      case "feature.draft":
        return this.execDraft(
          input.feature as Draft,
          input.upstream,
          input.resolve
        );
      case "feature.thicken":
        return this.execThicken(
          input.feature as Thicken,
          input.upstream,
          input.resolve
        );
      case "feature.thread":
        return this.execThread(input.feature as Thread, input.upstream);
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
      case "feature.chamfer":
        return this.execChamfer(
          input.feature as any,
          input.upstream,
          input.resolve
        );
      case "feature.boolean":
        return this.execBoolean(
          input.feature as BooleanOp,
          input.upstream,
          input.resolve
        );
      case "pattern.linear":
      case "pattern.circular":
        return this.execPattern(
          input.feature as any,
          input.upstream,
          input.resolve
        );
      default:
        throw new BackendError(
          "backend_unsupported_feature",
          `OCCT backend: unsupported feature ${kind}`
        );
    }
  }

  checkValid(target: KernelObject): boolean {
    const shape = target.meta["shape"] as any;
    if (!shape) {
      throw new BackendError("backend_missing_shape", "OCCT backend: missing shape");
    }
    const occt = this.occt as any;
    if (!occt.BRepCheck_Analyzer) {
      throw new BackendError(
        "backend_missing_capability",
        "OCCT backend: BRepCheck_Analyzer not available"
      );
    }
    const analyzer = new occt.BRepCheck_Analyzer(shape, true, true);
    if (typeof analyzer.IsValid_2 === "function") {
      return analyzer.IsValid_2() === true;
    }
    if (typeof analyzer.IsValid_1 === "function") {
      return analyzer.IsValid_1(shape) === true;
    }
    return false;
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
      const orientation = this.faceOrientationValue(face);
      const reversed =
        orientation !== null &&
        orientation === occt.TopAbs_Orientation?.TopAbs_REVERSED?.value;

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
        if (reversed) {
          indices.push(
            vertexOffset + n1 - 1,
            vertexOffset + n3 - 1,
            vertexOffset + n2 - 1
          );
        } else {
          indices.push(
            vertexOffset + n1 - 1,
            vertexOffset + n2 - 1,
            vertexOffset + n3 - 1
          );
        }
        faceIds.push(faceIndex);
      }

      vertexOffset += nbNodes;
      faceIndex += 1;
    }

    const normals = this.computeNormals(positions, indices);
    const edgeData =
      opts.includeEdges === false ? null : this.buildEdgeLines(shape, opts);
    return {
      positions,
      indices,
      normals,
      faceIds,
      edgePositions: edgeData?.positions,
      edgeIndices: edgeData?.edgeIndices,
    };
  }

  exportStep(target: KernelObject, opts: StepExportOptions = {}): Uint8Array {
    const shape = target.meta["shape"] as any;
    if (!shape) {
      throw new Error("OCCT backend: step export target missing shape metadata");
    }

    const occt = this.occt as any;
    const fs = occt?.FS;
    if (!fs || typeof fs.readFile !== "function" || typeof fs.unlink !== "function") {
      throw new Error("OCCT backend: occt.FS not available for STEP export");
    }

    this.configureStepExport(occt, opts);

    const writer = this.newOcct("STEPControl_Writer");
    const modelType = this.resolveStepModelType(occt, target.kind);
    const progress = this.makeProgressRange();
    if (!progress) {
      throw new Error("OCCT backend: progress range unavailable for STEP export");
    }
    const transferStatus = this.callWithFallback(
      writer,
      ["Transfer", "Transfer_1", "Transfer_2"],
      [
        [shape, modelType, true, progress],
        [shape, modelType, false, progress],
      ]
    );
    this.assertStepStatus(occt, transferStatus, "STEP transfer");

    const tmpPath = this.makeStepPath(fs);
    const writeStatus = this.callWithFallback(
      writer,
      ["Write", "Write_1", "Write_2"],
      [[tmpPath, this.makeProgressRange()], [tmpPath]]
    );
    this.assertStepStatus(occt, writeStatus, "STEP write");

    const data = fs.readFile(tmpPath);
    try {
      fs.unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (typeof data === "string") return new TextEncoder().encode(data);
    return new Uint8Array(data);
  }

  exportStl(target: KernelObject, opts: StlExportOptions = {}): Uint8Array {
    const shape = target.meta["shape"] as any;
    if (!shape) {
      throw new Error("OCCT backend: STL export target missing shape metadata");
    }

    const occt = this.occt as any;
    const fs = occt?.FS;
    if (!fs || typeof fs.readFile !== "function" || typeof fs.unlink !== "function") {
      throw new Error("OCCT backend: occt.FS not available for STL export");
    }

    this.ensureTriangulation(shape, {
      linearDeflection: opts.linearDeflection,
      angularDeflection: opts.angularDeflection,
      relative: opts.relative,
      includeEdges: false,
    });

    const writer = this.newOcct("StlAPI_Writer");
    if (opts.format === "ascii") {
      try {
        this.callWithFallback(writer, ["SetASCIIMode", "SetASCIIMode_1"], [[true], [1]]);
      } catch {
        // ignore if ASCII mode toggle is unavailable
      }
    } else if (opts.format === "binary") {
      try {
        this.callWithFallback(writer, ["SetASCIIMode", "SetASCIIMode_1"], [[false], [0]]);
      } catch {
        // ignore if binary mode toggle is unavailable
      }
    }

    const tmpPath = this.makeStlPath(fs);
    this.callWithFallback(
      writer,
      ["Write", "Write_1", "Write_2"],
      [[shape, tmpPath, this.makeProgressRange()], [shape, tmpPath]]
    );

    const data = fs.readFile(tmpPath);
    try {
      fs.unlink(tmpPath);
    } catch {
      // ignore cleanup errors
    }
    if (data instanceof Uint8Array) return data;
    if (Array.isArray(data)) return Uint8Array.from(data);
    if (typeof data === "string") return new TextEncoder().encode(data);
    return new Uint8Array(data);
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
    const mode = feature.mode ?? "solid";
    if (
      mode === "solid" &&
      profile.profile.kind === "profile.sketch" &&
      profile.profile.open
    ) {
      throw new Error("OCCT backend: extrude solid requires a closed sketch profile");
    }
    const axis = this.resolveExtrudeAxis(feature.axis, profile, upstream);
    const [ax, ay, az] = axis;
    const vec: [number, number, number] = [
      (ax ?? 0) * depth,
      (ay ?? 0) * depth,
      (az ?? 0) * depth,
    ];
    if (mode === "surface") {
      const section = this.buildProfileWire(profile);
      const prism = this.makePrism(
        section.wire,
        this.makeVec(vec[0], vec[1], vec[2])
      );
      const shape = this.readShape(prism);
      const outputs = new Map([
        [
          feature.result,
          {
            id: `${feature.id}:surface`,
            kind: "surface" as const,
            meta: { shape },
          },
        ],
      ]);
      const selections = this.collectSelections(
        shape,
        feature.id,
        feature.result,
        feature.tags,
        { rootKind: "face" }
      );
      return { outputs, selections };
    }

    const solid = this.buildSolidFromProfile(profile, vec);
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execPlane(
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
      ? this.resolvePlaneBasis(feature.plane, upstream, resolve)
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
    const xOffset = this.scaleVec(basis.xDir, halfWidth);
    const yOffset = this.scaleVec(basis.yDir, halfHeight);
    const corners: [number, number, number][] = [
      this.addVec(this.addVec(center, xOffset), yOffset),
      this.addVec(this.subVec(center, xOffset), yOffset),
      this.subVec(this.subVec(center, xOffset), yOffset),
      this.subVec(this.addVec(center, xOffset), yOffset),
    ];

    const wire = this.makePolygonWire(corners);
    const faceBuilder = this.makeFaceFromWire(wire);
    const shape = this.readShape(faceBuilder);
    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:face`,
          kind: "face" as const,
          meta: { shape },
        },
      ],
    ]);
    const selections = this.collectSelections(
      shape,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: "face" }
    );
    return { outputs, selections };
  }

  private execSurface(feature: Surface, upstream: KernelResult): KernelResult {
    const profile = this.resolveProfile(feature.profile, upstream);
    const face = this.buildProfileFace(profile);
    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:face`,
          kind: "face" as const,
          meta: { shape: face },
        },
      ],
    ]);
    const selections = this.collectSelections(
      face,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: "face" }
    );
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
    const axis = this.makeAxis(feature.axis, feature.origin);
    const mode = feature.mode ?? "solid";
    if (mode === "surface") {
      const section = this.buildProfileWire(profile);
      const revol = this.makeRevol(section.wire, axis, angleRad);
      this.tryBuild(revol);
      const shape = this.readShape(revol);
      const outputs = new Map([
        [
          feature.result,
          {
            id: `${feature.id}:surface`,
            kind: "surface" as const,
            meta: { shape },
          },
        ],
      ]);
      const selections = this.collectSelections(
        shape,
        feature.id,
        feature.result,
        feature.tags,
        { rootKind: "face" }
      );
      return { outputs, selections };
    }

    const face = this.buildProfileFace(profile);
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execLoft(feature: Loft, upstream: KernelResult): KernelResult {
    const profiles = feature.profiles ?? [];
    if (profiles.length < 2) {
      throw new Error("OCCT backend: loft requires at least two profiles");
    }
    const resolved = profiles.map((profileRef) =>
      this.resolveProfile(profileRef, upstream)
    );
    const sections = resolved.map((profile) => this.buildProfileWire(profile));
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
    } else {
      // Default: auto-select by closed/open profiles.
      isSolid = allClosed;
    }
    const loft = this.makeLoftBuilder(isSolid);

    for (const section of sections) {
      this.addLoftWire(loft, section.wire);
    }
    if (
      typeof (loft as any).CheckCompatibility === "function" ||
      typeof (loft as any).CheckCompatibility_1 === "function"
    ) {
      try {
        this.callWithFallback(
          loft,
          ["CheckCompatibility", "CheckCompatibility_1"],
          [[true], [false]]
        );
      } catch {
        // ignore compatibility check failures; build will surface real issues
      }
    }
    this.tryBuild(loft);
    const shape = this.readShape(loft);
    const outputKind: "solid" | "surface" = isSolid ? "solid" : "surface";
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
    const selections = this.collectSelections(
      shape,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: isSolid ? "solid" : "face" }
    );
    return { outputs, selections };
  }

  private execSweep(
    feature: Sweep,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const profile = this.resolveProfile(feature.profile, upstream);
    const { wire, closed } = this.buildProfileWire(profile);
    const spine = this.buildPathWire(feature.path);
    const frame = feature.frame
      ? this.resolvePlaneBasis(feature.frame, upstream, resolve)
      : undefined;
    const frenet = feature.orientation === "frenet" ? true : undefined;

    const mode = feature.mode;
    const makeSolid = mode === "solid" ? true : mode === "surface" ? false : closed;
    if (makeSolid && !closed) {
      throw new Error("OCCT backend: sweep solid requires a closed profile");
    }

    let shape: any;
    let outputKind: "solid" | "surface";
    if (makeSolid) {
      const face = this.buildProfileFace(profile);
      shape = frame
        ? this.makePipeSolid(spine, face, frame, {
            makeSolid: true,
            frenet,
          })
        : this.makePipeSolid(spine, face, { makeSolid: true, frenet });
      outputKind = "solid";
    } else {
      shape = frame
        ? this.makePipeSolid(spine, wire, frame, {
            makeSolid: false,
            frenet,
          })
        : this.makePipeSolid(spine, wire, { makeSolid: false, frenet });
      outputKind = "surface";
    }

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
    const selections = this.collectSelections(
      shape,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: outputKind === "solid" ? "solid" : "face" }
    );
    return { outputs, selections };
  }

  private execPipe(feature: Pipe, upstream: KernelResult): KernelResult {
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
    const [ox, oy, oz] = origin;
    const originVec: [number, number, number] = [
      expectNumber(ox ?? 0, "feature.origin[0]"),
      expectNumber(oy ?? 0, "feature.origin[1]"),
      expectNumber(oz ?? 0, "feature.origin[2]"),
    ];
    const outerShape = this.readShape(
      this.makeCylinder(outerRadius, length, axisDir, originVec)
    );

    let solid = outerShape;
    if (innerRadius > 0) {
      const innerShape = this.readShape(
        this.makeCylinder(innerRadius, length, axisDir, originVec)
      );
      const cut = this.makeBoolean("cut", outerShape, innerShape);
      solid = this.readShape(cut);
      solid = this.splitByTools(solid, [outerShape, innerShape]);
      solid = this.normalizeSolid(solid);
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execDatumPlane(feature: DatumPlane, upstream: KernelResult): KernelResult {
    const normal = this.resolveAxisSpec(feature.normal, upstream, "datum plane normal");
    const origin = feature.origin ?? [0, 0, 0];
    const originVec: [number, number, number] = [
      expectNumber(origin[0], "datum plane origin[0]"),
      expectNumber(origin[1], "datum plane origin[1]"),
      expectNumber(origin[2], "datum plane origin[2]"),
    ];
    const xHint = feature.xAxis
      ? this.resolveAxisSpec(feature.xAxis, upstream, "datum plane xAxis")
      : undefined;
    const basis = this.basisFromNormal(normal, xHint, originVec);
    const outputs = new Map([
      [
        this.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "plane", ...basis },
        },
      ],
    ]);
    return { outputs, selections: [] };
  }

  private execDatumAxis(feature: DatumAxis, upstream: KernelResult): KernelResult {
    const direction = this.resolveAxisSpec(feature.direction, upstream, "datum axis direction");
    const origin = feature.origin ?? [0, 0, 0];
    const originVec: [number, number, number] = [
      expectNumber(origin[0], "datum axis origin[0]"),
      expectNumber(origin[1], "datum axis origin[1]"),
      expectNumber(origin[2], "datum axis origin[2]"),
    ];
    const outputs = new Map([
      [
        this.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "axis", origin: originVec, direction },
        },
      ],
    ]);
    return { outputs, selections: [] };
  }

  private execDatumFrame(
    feature: DatumFrame,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const target = resolve(feature.on, upstream);
    if (target.kind !== "face") {
      throw new Error("OCCT backend: datum frame must resolve to a face");
    }
    const face = target.meta["shape"];
    if (!face) {
      throw new Error("OCCT backend: datum frame missing face shape");
    }
    const basis = this.planeBasisFromFace(face);
    const outputs = new Map([
      [
        this.datumKey(feature.id),
        {
          id: `${feature.id}:datum`,
          kind: "datum" as const,
          meta: { type: "frame", ...basis },
        },
      ],
    ]);
    return { outputs, selections: [] };
  }

  private execPipeSweep(feature: PipeSweep, upstream: KernelResult): KernelResult {
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

    const mode = feature.mode ?? "solid";
    if (mode === "surface") {
      const spine = this.buildPathWire(feature.path);
      const { start, tangent } = this.pathStartTangent(feature.path);
      const axis = normalizeVector(tangent);
      if (!isFiniteVec(axis)) {
        throw new Error("OCCT backend: pipe sweep path tangent is degenerate");
      }
      const plane = this.planeBasisFromNormal(start, axis);
      const outerEdge = this.makeCircleEdge(plane.origin, outerRadius, plane.normal);
      const outerWire = this.makeWireFromEdges([outerEdge]);
      const shape = this.makePipeSolid(spine, outerWire, plane, {
        makeSolid: false,
        allowFallback: false,
      });
      const outputs = new Map([
        [
          feature.result,
          {
            id: `${feature.id}:surface`,
            kind: "surface" as const,
            meta: { shape },
          },
        ],
      ]);
      const selections = this.collectSelections(
        shape,
        feature.id,
        feature.result,
        feature.tags,
        { rootKind: "face" }
      );
      return { outputs, selections };
    }

    const segments = this.pathSegments(feature.path);
    if (segments.length === 0) {
      throw new Error("OCCT backend: pipe sweep path has no segments");
    }

    let solid: any | null = null;
    for (const segment of segments) {
      const delta = this.subVec(segment.end, segment.start);
      const length = vecLength(delta);
      if (length <= 0) continue;
      const axis = normalizeVector(delta);
      if (!isFiniteVec(axis)) continue;

      let segmentSolid = this.readShape(
        this.makeCylinder(outerRadius, length, axis, segment.start)
      );
      if (innerRadius > 0) {
        const inner = this.readShape(
          this.makeCylinder(innerRadius, length, axis, segment.start)
        );
        const cut = this.makeBoolean("cut", segmentSolid, inner);
        segmentSolid = this.readShape(cut);
        segmentSolid = this.splitByTools(segmentSolid, [segmentSolid, inner]);
        segmentSolid = this.normalizeSolid(segmentSolid);
      }

      if (!solid) {
        solid = segmentSolid;
      } else {
        const union = this.makeBoolean("union", solid, segmentSolid);
        solid = this.readShape(union);
        solid = this.normalizeSolid(solid);
      }
    }
    if (!solid) {
      throw new Error("OCCT backend: pipe sweep failed to create solid");
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execHexTubeSweep(feature: HexTubeSweep, upstream: KernelResult): KernelResult {
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

    const spine = this.buildPathWire(feature.path);
    const { start, tangent } = this.pathStartTangent(feature.path);
    const axis = normalizeVector(tangent);
    if (!isFiniteVec(axis)) {
      throw new Error("OCCT backend: hex tube sweep path tangent is degenerate");
    }
    const plane = this.planeBasisFromNormal(start, axis);

    const outerRadius = outerAcross / Math.sqrt(3);
    const innerRadius = innerAcross / Math.sqrt(3);
    const outerPoints = this.regularPolygonPoints(
      plane.origin,
      plane.xDir,
      plane.yDir,
      outerRadius,
      6
    );
    const mode = feature.mode ?? "solid";
    if (mode === "surface") {
      const outerWire = this.makePolygonWire(outerPoints);
      const shape = this.makePipeSolid(spine, outerWire, plane, {
        makeSolid: false,
        allowFallback: false,
      });
      const outputs = new Map([
        [
          feature.result,
          {
            id: `${feature.id}:surface`,
            kind: "surface" as const,
            meta: { shape },
          },
        ],
      ]);
      const selections = this.collectSelections(
        shape,
        feature.id,
        feature.result,
        feature.tags,
        { rootKind: "face" }
      );
      return { outputs, selections };
    }

    const outerWire = this.makePolygonWire(outerPoints);
    const faceBuilder = this.makeFaceFromWire(outerWire);
    if (innerRadius > 0) {
      const innerPoints = this
        .regularPolygonPoints(
          plane.origin,
          plane.xDir,
          plane.yDir,
          innerRadius,
          6
        )
        .reverse();
      const innerWire = this.makePolygonWire(innerPoints);
      if (typeof faceBuilder.Add === "function") {
        faceBuilder.Add(innerWire);
      } else if (typeof faceBuilder.add === "function") {
        faceBuilder.add(innerWire);
      } else {
        throw new Error("OCCT backend: face builder missing Add()");
      }
    }
    const face = this.readFace(faceBuilder);

    let solid = this.makePipeSolid(spine, face, plane, { makeSolid: true });
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execMirror(
    feature: Mirror,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const target = resolve(feature.source, upstream);
    if (target.kind !== "solid" && target.kind !== "face" && target.kind !== "surface") {
      throw new Error(
        "OCCT backend: mirror source must resolve to a solid, surface, or face"
      );
    }
    const shape = target.meta["shape"];
    if (!shape) {
      throw new Error("OCCT backend: mirror source missing shape metadata");
    }

    const plane = this.resolvePlaneBasis(feature.plane, upstream, resolve);
    const origin = this.makePnt(plane.origin[0], plane.origin[1], plane.origin[2]);
    const normal = this.makeDir(plane.normal[0], plane.normal[1], plane.normal[2]);
    const xDir = this.makeDir(plane.xDir[0], plane.xDir[1], plane.xDir[2]);
    const ax2 = this.makeAx2WithXDir(origin, normal, xDir);
    const trsf = this.newOcct("gp_Trsf");
    this.callWithFallback(
      trsf,
      ["SetMirror", "SetMirror_1", "SetMirror_2", "SetMirror_3"],
      [[ax2], [this.makeAx1(origin, normal)], [origin]]
    );

    const builder = this.newOcct("BRepBuilderAPI_Transform", shape, trsf, true);
    this.tryBuild(builder);
    const mirrored = this.readShape(builder);
    const outputKind: "solid" | "face" | "surface" =
      target.kind === "solid" ? "solid" : target.kind === "surface" ? "surface" : "face";
    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: mirrored },
        },
      ],
    ]);
    const selections = this.collectSelections(
      mirrored,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: outputKind === "solid" ? "solid" : "face" }
    );
    return { outputs, selections };
  }

  private execThicken(
    feature: Thicken,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const target = resolve(feature.surface, upstream);
    if (target.kind !== "face" && target.kind !== "surface") {
      throw new Error(
        "OCCT backend: thicken target must resolve to a face or surface"
      );
    }
    const shape = target.meta["shape"];
    if (!shape) {
      throw new Error("OCCT backend: thicken target missing shape");
    }
    const thickness = expectNumber(feature.thickness, "feature.thickness");
    if (thickness <= 0) {
      throw new Error("OCCT backend: thicken thickness must be positive");
    }
    const direction = feature.direction ?? "normal";
    const sign = direction === "reverse" ? -1 : 1;

    const planar =
      target.kind === "surface"
        ? false
        : typeof target.meta["planar"] === "boolean"
          ? (target.meta["planar"] as boolean)
          : this.faceProperties(shape).planar;
    const finalizeSolid = (shape: any) => {
      let solidShape = this.normalizeSolid(shape);
      if (!this.shapeHasSolid(solidShape)) {
        const stitched = this.makeSolidFromShells(solidShape);
        if (stitched) {
          solidShape = this.normalizeSolid(stitched);
        }
      }
      return solidShape;
    };

    let solid: any;
    const offset = thickness * sign;
    if (planar) {
      let normalVec = target.meta["normalVec"] as [number, number, number] | undefined;
      if (!normalVec) {
        try {
        normalVec = this.planeBasisFromFace(shape).normal;
        } catch {
          normalVec = undefined;
        }
      }
      if (!normalVec) {
        throw new Error("OCCT backend: thicken requires a planar face");
      }
      const vec = this.makeVec(
        normalVec[0] * offset,
        normalVec[1] * offset,
        normalVec[2] * offset
      );
      const prism = this.makePrism(shape, vec);
      solid = this.readShape(prism);
    } else {
      let analytic: any | null = null;
      const face = target.kind === "face" ? shape : this.firstFace(shape);
      if (face) {
        analytic = this.tryThickenCylindricalFace(face, offset);
      }
      solid = analytic ?? this.makeThickSolid(shape, [], offset, 1e-6);
    }
    solid = finalizeSolid(solid);
    if (!this.isValidShape(solid)) {
      const retry = finalizeSolid(
        this.makeThickSolid(shape, [], thickness * sign, 1e-6, {
          intersection: true,
          selfIntersection: true,
          removeInternalEdges: true,
        })
      );
      if (this.isValidShape(retry)) {
        solid = retry;
      }
    }
    if (!this.isValidShape(solid)) {
      const sewed = this.sewShapeFaces(solid);
      if (sewed) {
        const stitched = this.makeSolidFromShells(sewed);
        if (stitched && this.isValidShape(stitched)) {
          solid = this.normalizeSolid(stitched);
        }
      }
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execDraft(
    feature: Draft,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const source = resolve(feature.source, upstream);
    if (source.kind !== "solid") {
      throw new Error("OCCT backend: draft source must resolve to a solid");
    }
    const ownerKey = this.resolveOwnerKey(source, upstream);
    const owner = this.resolveOwnerShape(source, upstream);
    if (!owner) {
      throw new Error("OCCT backend: draft source missing owner solid");
    }

    const faceTargets = resolveSelectorSet(
      feature.faces,
      this.toResolutionContext(upstream)
    );
    if (faceTargets.length === 0) {
      throw new Error("OCCT backend: draft selector matched 0 faces");
    }
    for (const target of faceTargets) {
      if (target.kind !== "face") {
        throw new Error("OCCT backend: draft selector must resolve to faces");
      }
      const faceOwnerKey =
        typeof target.meta["ownerKey"] === "string"
          ? (target.meta["ownerKey"] as string)
          : undefined;
      if (faceOwnerKey && faceOwnerKey !== ownerKey) {
        throw new Error(
          "OCCT backend: draft faces must belong to the same source solid"
        );
      }
    }

    const angle = expectNumber(feature.angle, "feature.angle");
    if (Math.abs(angle) < 1e-8 || Math.abs(angle) >= Math.PI / 2) {
      throw new Error(
        "OCCT backend: draft angle must be non-zero and less than PI/2 in magnitude"
      );
    }
    const pullDirection = this.resolveAxisSpec(
      feature.pullDirection,
      upstream,
      "draft pull direction"
    );
    const neutralBasis = this.resolvePlaneBasis(
      feature.neutralPlane,
      upstream,
      resolve
    );
    const neutralPlane = this.makePln(neutralBasis.origin, neutralBasis.normal);
    const pullDir = this.makeDir(
      pullDirection[0],
      pullDirection[1],
      pullDirection[2]
    );
    const draft = this.makeDraftBuilder(owner);

    for (const target of faceTargets) {
      const face = this.toFace(target.meta["shape"]);
      const added = (() => {
        try {
          this.callWithFallback(
            draft,
            ["Add", "Add_1"],
            [
              [face, pullDir, angle, neutralPlane, true],
              [face, pullDir, angle, neutralPlane, false],
              [face, pullDir, angle, neutralPlane],
            ]
          );
          return true;
        } catch {
          return false;
        }
      })();
      if (!added) {
        throw new Error("OCCT backend: failed to add draft face");
      }
    }

    this.tryBuild(draft);
    const solid = this.readShape(draft);
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execShell(
    feature: Shell,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const target = resolve(feature.source, upstream);
    if (target.kind !== "solid") {
      throw new Error("OCCT backend: shell source must resolve to a solid");
    }
    const shape = target.meta["shape"];
    if (!shape) {
      throw new Error("OCCT backend: shell source missing shape");
    }
    const thickness = expectNumber(feature.thickness, "feature.thickness");
    if (thickness <= 0) {
      throw new Error("OCCT backend: shell thickness must be positive");
    }
    const direction = feature.direction ?? "inside";
    const sign = direction === "outside" ? 1 : -1;
    const openFaces = feature.openFaces ?? [];
    const removeFaces: any[] = [];
    for (const selector of openFaces) {
      const faceTarget = resolve(selector, upstream);
      if (faceTarget.kind !== "face") {
        throw new Error("OCCT backend: shell open face must resolve to a face");
      }
      const faceShape = faceTarget.meta["shape"];
      if (!faceShape) {
        throw new Error("OCCT backend: shell open face missing shape");
      }
      removeFaces.push(faceShape);
    }
    const finalizeSolid = (shape: any) => {
      let solidShape = this.normalizeSolid(shape);
      if (!this.shapeHasSolid(solidShape)) {
        const stitched = this.makeSolidFromShells(solidShape);
        if (stitched) {
          solidShape = this.normalizeSolid(stitched);
        }
      }
      return solidShape;
    };

    let solid = finalizeSolid(
      this.makeThickSolid(shape, removeFaces, thickness * sign, 1e-6)
    );
    if (!this.isValidShape(solid)) {
      const retry = finalizeSolid(
        this.makeThickSolid(shape, removeFaces, thickness * sign, 1e-6, {
          intersection: true,
          selfIntersection: true,
          removeInternalEdges: true,
        })
      );
      if (this.isValidShape(retry)) {
        solid = retry;
      }
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private execThread(feature: Thread, upstream: KernelResult): KernelResult {
    const axisDir = this.resolveAxisSpec(feature.axis, upstream, "thread axis");
    const axis = normalizeVector(axisDir);
    if (!isFiniteVec(axis)) {
      throw new Error("OCCT backend: thread axis is degenerate");
    }
    const origin = feature.origin ?? [0, 0, 0];
    const originVec: [number, number, number] = [
      expectNumber(origin[0], "thread origin[0]"),
      expectNumber(origin[1], "thread origin[1]"),
      expectNumber(origin[2], "thread origin[2]"),
    ];
    const length = expectNumber(feature.length, "thread length");
    if (length <= 0) {
      throw new Error("OCCT backend: thread length must be positive");
    }
    const pitch = expectNumber(feature.pitch, "thread pitch");
    if (pitch <= 0) {
      throw new Error("OCCT backend: thread pitch must be positive");
    }
    const majorDiameter = expectNumber(feature.majorDiameter, "thread major diameter");
    if (majorDiameter <= 0) {
      throw new Error("OCCT backend: thread major diameter must be positive");
    }
    const defaultMinor = majorDiameter - pitch * 1.22687;
    const minorDiameter =
      feature.minorDiameter === undefined
        ? defaultMinor
        : expectNumber(feature.minorDiameter, "thread minor diameter");
    if (minorDiameter <= 0 || minorDiameter >= majorDiameter) {
      throw new Error("OCCT backend: thread minor diameter must be smaller than major diameter");
    }

    const majorRadius = majorDiameter / 2;
    const minorRadius = minorDiameter / 2;
    const depth = majorRadius - minorRadius;
    const halfDepth = depth / 2;
    const pitchRadius = (majorRadius + minorRadius) / 2;
    const radialCutOverlap = Math.max(depth * 0.005, 5e-5);
    const axialCutOverlap = Math.max(depth * 0.1, pitch * 0.05, 1e-3);
    const cutOriginVec = this.subVec(originVec, this.scaleVec(axis, axialCutOverlap));
    const cutLength = length + axialCutOverlap * 2;
    const handedness = feature.handedness ?? "right";
    const direction = handedness === "left" ? -1 : 1;

    const basePlane = this.planeBasisFromNormal(cutOriginVec, axis);
    const angle =
      feature.profileAngle === undefined
        ? Math.PI / 3
        : expectNumber(feature.profileAngle, "thread profile angle");
    if (!(angle > 0 && angle < Math.PI)) {
      throw new Error("OCCT backend: thread profile angle must be between 0 and PI");
    }

    const sharpHeight = pitch / (2 * Math.tan(angle / 2));
    const truncation = Math.max(0, sharpHeight - depth);
    const crestTrunc = truncation / 3;
    const rootTrunc = (truncation * 2) / 3;
    let crestFlat =
      feature.crestFlat === undefined
        ? 2 * crestTrunc * Math.tan(angle / 2)
        : Math.max(0, expectNumber(feature.crestFlat, "thread crest flat"));
    let rootFlat =
      feature.rootFlat === undefined
        ? 2 * rootTrunc * Math.tan(angle / 2)
        : Math.max(0, expectNumber(feature.rootFlat, "thread root flat"));
    if (feature.crestFlat !== undefined && feature.rootFlat === undefined) {
      const crestHalf = crestFlat / 2;
      rootFlat = Math.max(0, (crestHalf + depth * Math.tan(angle / 2)) * 2);
    } else if (feature.rootFlat !== undefined && feature.crestFlat === undefined) {
      const rootHalf = rootFlat / 2;
      crestFlat = Math.max(0, (rootHalf - depth * Math.tan(angle / 2)) * 2);
    }
    if (crestFlat <= 1e-6 && rootFlat <= 1e-6) {
      const candidate = 2 * depth * Math.tan(angle / 2);
      rootFlat = Math.max(1e-6, Math.min(pitch * 0.9, candidate));
    }

    const turns = cutLength / pitch;
    const angleSpan = direction * Math.PI * 2 * turns;

    const crestHalf = crestFlat / 2;
    const rootHalf = rootFlat / 2;
    const innerCutOverlap = Math.max(depth * 0.03, 1e-4);
    const crestOffset = halfDepth + radialCutOverlap;
    const rootOffset = -(halfDepth + innerCutOverlap);
    let segmentsPerTurn =
      feature.segmentsPerTurn === undefined
        ? 24
        : Math.round(
            Math.max(
              8,
              expectNumber(feature.segmentsPerTurn, "thread segments per turn")
            )
          );
    const maxSpineSegments = 640;
    const rawSpineSegments = Math.ceil(turns * segmentsPerTurn);
    if (rawSpineSegments > maxSpineSegments) {
      segmentsPerTurn = Math.max(
        8,
        Math.floor(maxSpineSegments / Math.max(turns, 1))
      );
    }
    const segments = Math.max(24, Math.ceil(turns * segmentsPerTurn));
    const startAngleOffset = Math.PI * 0.5;
    const startCos = Math.cos(startAngleOffset);
    const startSin = Math.sin(startAngleOffset);
    let startRadialDir = normalizeVector(
      this.addVec(
        this.scaleVec(basePlane.xDir, startCos),
        this.scaleVec(basePlane.yDir, startSin)
      )
    );
    if (!isFiniteVec(startRadialDir)) {
      startRadialDir = basePlane.xDir;
    }
    const startCenter = this.addVec(
      cutOriginVec,
      this.scaleVec(startRadialDir, pitchRadius)
    );
    let profileX = normalizeVector(startRadialDir);
    const axisProj = dot(profileX, axis);
    if (Math.abs(axisProj) > 1e-6) {
      profileX = normalizeVector(
        this.subVec(profileX, this.scaleVec(axis, axisProj))
      );
    }
    if (!isFiniteVec(profileX)) {
      profileX = basePlane.xDir;
    }
    let profileY = axis;
    if (!isFiniteVec(profileY)) {
      profileY = basePlane.yDir;
    }
    const profilePoints: [number, number, number][] = [];
    if (crestHalf > 1e-6) {
      profilePoints.push(
        this.addVec(
          this.addVec(startCenter, this.scaleVec(profileY, -crestHalf)),
          this.scaleVec(profileX, crestOffset)
        )
      );
      profilePoints.push(
        this.addVec(
          this.addVec(startCenter, this.scaleVec(profileY, crestHalf)),
          this.scaleVec(profileX, crestOffset)
        )
      );
    } else {
      profilePoints.push(
        this.addVec(startCenter, this.scaleVec(profileX, crestOffset))
      );
    }
    if (rootHalf > 1e-6) {
      profilePoints.push(
        this.addVec(
          this.addVec(startCenter, this.scaleVec(profileY, rootHalf)),
          this.scaleVec(profileX, rootOffset)
        )
      );
      profilePoints.push(
        this.addVec(
          this.addVec(startCenter, this.scaleVec(profileY, -rootHalf)),
          this.scaleVec(profileX, rootOffset)
        )
      );
    } else {
      profilePoints.push(
        this.addVec(startCenter, this.scaleVec(profileX, rootOffset))
      );
    }
    const profileWire = this.makePolygonWire(profilePoints);

    const helixPoints: [number, number, number][] = [];
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = startAngleOffset + angleSpan * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const radialVec = this.addVec(
        this.scaleVec(basePlane.xDir, pitchRadius * cos),
        this.scaleVec(basePlane.yDir, pitchRadius * sin)
      );
      const along = this.scaleVec(axis, cutLength * t);
      helixPoints.push(this.addVec(cutOriginVec, this.addVec(radialVec, along)));
    }
    const helixEdge = this.makeSplineEdge3D({
      kind: "path.spline",
      points: helixPoints,
    }).edge;
    const spine = this.makeWireFromEdges([helixEdge]);
    let ridge = this.makeSweepSolid(spine, profileWire, {
      makeSolid: true,
      frenet: true,
      allowFallback: false,
    });
    ridge = this.normalizeSolid(ridge);
    if (!this.shapeHasSolid(ridge)) {
      const stitched = this.makeSolidFromShells(ridge);
      if (stitched) {
        ridge = this.normalizeSolid(stitched);
      }
    }
    const blank = this.readShape(
      this.makeCylinder(majorRadius, length, axis, originVec)
    );
    const cut = this.makeBoolean("cut", blank, ridge);
    let solid = this.readShape(cut);
    solid = this.unifySameDomain(solid);
    solid = this.normalizeSolid(solid);
    if (!this.shapeHasSolid(solid) || !this.isValidShape(solid)) {
      throw new Error("OCCT backend: thread cut produced an invalid solid");
    }
    const solidVolume = this.solidVolume(solid);
    if (Number.isFinite(solidVolume) && solidVolume < 0) {
      solid = this.reverseShape(solid);
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
    const debugThread =
      typeof process !== "undefined" && process?.env?.TF_THREAD_DEBUG === "1";
    if (debugThread) {
      outputs.set(`debug:${feature.id}:ridge`, {
        id: `${feature.id}:ridge`,
        kind: "solid" as const,
        meta: { shape: ridge },
      });
      outputs.set(`debug:${feature.id}:blank`, {
        id: `${feature.id}:blank`,
        kind: "solid" as const,
        meta: { shape: blank },
      });
    }
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
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

    const face = target.meta["shape"];
    if (!face) {
      throw new Error("OCCT backend: hole target missing face shape");
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

    const faceCenter = this.faceCenter(face);
    const plane = this.planeBasisFromFace(face);
    const position2 = feature.position ?? [0, 0];
    const positionOffset = this.offsetFromPlane(position2, plane.xDir, plane.yDir);
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
    if (feature.counterbore && feature.countersink) {
      throw new Error("OCCT backend: hole cannot define both counterbore and countersink");
    }
    let counterboreRadius: number | null = null;
    let counterboreDepth = 0;
    if (feature.counterbore) {
      const cbDiameter = expectNumber(
        feature.counterbore.diameter,
        "feature.counterbore.diameter"
      );
      const cbDepth = expectNumber(
        feature.counterbore.depth,
        "feature.counterbore.depth"
      );
      counterboreRadius = cbDiameter / 2;
      counterboreDepth = cbDepth;
      if (counterboreRadius <= radius) {
        throw new Error(
          "OCCT backend: counterbore diameter must be larger than hole diameter"
        );
      }
      if (counterboreDepth <= 0) {
        throw new Error("OCCT backend: counterbore depth must be positive");
      }
      if (feature.depth !== "throughAll" && counterboreDepth > length) {
        throw new Error("OCCT backend: counterbore depth exceeds hole depth");
      }
    }
    let countersinkRadius: number | null = null;
    let countersinkDepth = 0;
    if (feature.countersink) {
      const csDiameter = expectNumber(
        feature.countersink.diameter,
        "feature.countersink.diameter"
      );
      const csAngle = expectNumber(
        feature.countersink.angle,
        "feature.countersink.angle"
      );
      countersinkRadius = csDiameter / 2;
      if (countersinkRadius <= radius) {
        throw new Error(
          "OCCT backend: countersink diameter must be larger than hole diameter"
        );
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
      if (feature.depth !== "throughAll" && countersinkDepth > length) {
        throw new Error("OCCT backend: countersink depth exceeds hole depth");
      }
    }
    const centers = feature.pattern
      ? this.patternCenters(feature.pattern.ref, position2, plane, upstream)
      : [this.addVec(faceCenter, positionOffset)];

    let solid = owner;
    const applyCut = (current: any, tool: any) => {
      const base = current;
      const cut = this.makeBoolean("cut", base, tool);
      let next = this.readShape(cut);
      next = this.splitByTools(next, [base, tool]);
      return this.normalizeSolid(next);
    };
    for (const origin of centers) {
      const tools = [
        this.readShape(this.makeCylinder(radius, length, axisDir, origin)),
      ];
      if (counterboreRadius !== null) {
        tools.push(
          this.readShape(
            this.makeCylinder(counterboreRadius, counterboreDepth, axisDir, origin)
          )
        );
      }
      if (countersinkRadius !== null) {
        tools.push(
          this.readShape(
            this.makeCone(countersinkRadius, radius, countersinkDepth, axisDir, origin)
          )
        );
      }
      for (const tool of tools) {
        solid = applyCut(solid, tool);
      }
    }

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
    const selections = this.collectSelections(
      solid,
      feature.id,
      ownerKey,
      feature.tags
    );
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
    if (op === "subtract") {
      solid = this.splitByTools(solid, [left, right]);
    }
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      ownerKey,
      feature.tags
    );
    return { outputs, selections };
  }

  private execChamfer(
    feature: { id: string; edges: Selector; distance: number; tags?: string[] },
    upstream: KernelResult,
    _resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const targets = resolveSelectorSet(
      feature.edges,
      this.toResolutionContext(upstream)
    );
    if (targets.length === 0) {
      throw new Error("OCCT backend: chamfer selector matched 0 edges");
    }
    for (const target of targets) {
      if (target.kind !== "edge") {
        throw new Error("OCCT backend: chamfer selector must resolve to an edge");
      }
    }
    const ownerKey = this.resolveOwnerKey(targets[0] as KernelSelection, upstream);
    const owner = this.resolveOwnerShape(targets[0] as KernelSelection, upstream);
    if (!owner) {
      throw new Error("OCCT backend: chamfer target missing owner solid");
    }

    const distance = expectNumber(feature.distance, "feature.distance");
    if (distance <= 0) {
      throw new Error("OCCT backend: chamfer distance must be positive");
    }

    const chamfer = this.makeChamferBuilder(owner);
    const add = (fn: string, ...args: unknown[]) => {
      const method = (chamfer as Record<string, unknown>)[fn];
      if (typeof method === "function") {
        try {
          method.apply(chamfer, args);
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
        add("Add_2", distance, edge) ||
        add("Add_1", edge);
      if (!added) {
        throw new Error("OCCT backend: failed to add chamfer edge");
      }
    }
    this.tryBuild(chamfer);
    const solid = this.readShape(chamfer);
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      ownerKey,
      feature.tags
    );
    return { outputs, selections };
  }

  private execPattern(
    feature: PatternLinear | PatternCircular,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const originSel = resolve(feature.origin, upstream);
    if (originSel.kind !== "face") {
      throw new Error("OCCT backend: pattern origin must resolve to a face");
    }
    const face = originSel.meta["shape"];
    if (!face) {
      throw new Error("OCCT backend: pattern origin face missing shape");
    }
    const basis = this.planeBasisFromFace(face);
    const origin = this.faceCenter(face);
    const outputs = new Map<string, KernelObject>();

    const source = (feature as { source?: Selector }).source;
    const sourceResult = (feature as { result?: string }).result;
    const isFeaturePattern = source !== undefined;
    let sourceShape: any | null = null;
    if (isFeaturePattern) {
      const sourceSelection = resolve(source as Selector, upstream);
      if (sourceSelection.kind !== "solid") {
        throw new Error("OCCT backend: pattern source must resolve to a solid");
      }
      sourceShape = this.resolveOwnerShape(sourceSelection, upstream);
      if (!sourceShape) {
        throw new Error("OCCT backend: pattern source missing owner shape");
      }
      if (!sourceResult) {
        throw new Error("OCCT backend: pattern result is required when source is set");
      }
    }

    if (feature.kind === "pattern.linear") {
      const spacing: [number, number] = [
        expectNumber(feature.spacing[0], "pattern spacing X"),
        expectNumber(feature.spacing[1], "pattern spacing Y"),
      ];
      const count: [number, number] = [
        Math.max(1, Math.round(expectNumber(feature.count[0], "pattern count X"))),
        Math.max(1, Math.round(expectNumber(feature.count[1], "pattern count Y"))),
      ];
      outputs.set(this.patternKey(feature.id), {
        id: `${feature.id}:pattern`,
        kind: "pattern" as const,
        meta: {
          type: "pattern.linear",
          origin,
          xDir: basis.xDir,
          yDir: basis.yDir,
          normal: basis.normal,
          spacing,
          count,
        },
      });
      if (isFeaturePattern && sourceShape && sourceResult) {
        const instances: any[] = [];
        for (let i = 0; i < count[0]; i += 1) {
          for (let j = 0; j < count[1]; j += 1) {
            if (i === 0 && j === 0) {
              instances.push(sourceShape);
              continue;
            }
            const delta: [number, number, number] = [
              basis.xDir[0] * spacing[0] * i + basis.yDir[0] * spacing[1] * j,
              basis.xDir[1] * spacing[0] * i + basis.yDir[1] * spacing[1] * j,
              basis.xDir[2] * spacing[0] * i + basis.yDir[2] * spacing[1] * j,
            ];
            instances.push(this.transformShapeTranslate(sourceShape, delta));
          }
        }
        const merged = this.unionShapesBalanced(instances);
        if (!merged) {
          throw new Error("OCCT backend: pattern generated no instances");
        }
        outputs.set(sourceResult, {
          id: `${feature.id}:solid`,
          kind: "solid",
          meta: { shape: merged },
        });
        const selections = this.collectSelections(
          merged,
          feature.id,
          sourceResult,
          feature.tags
        );
        return { outputs, selections };
      }
      return { outputs, selections: [] };
    }

    const count = Math.max(1, Math.round(expectNumber(feature.count, "pattern count")));
    const axisDir = axisVector(feature.axis);
    const axis = normalizeVector(axisDir);
    outputs.set(this.patternKey(feature.id), {
      id: `${feature.id}:pattern`,
      kind: "pattern" as const,
      meta: {
        type: "pattern.circular",
        origin,
        xDir: basis.xDir,
        yDir: basis.yDir,
        normal: basis.normal,
        axis,
        count,
      },
    });
    if (isFeaturePattern && sourceShape && sourceResult) {
      const instances: any[] = [];
      for (let i = 0; i < count; i += 1) {
        if (i === 0) {
          instances.push(sourceShape);
          continue;
        }
        const angle = (Math.PI * 2 * i) / count;
        instances.push(this.transformShapeRotate(sourceShape, origin, axis, angle));
      }
      const merged = this.unionShapesBalanced(instances);
      if (!merged) {
        throw new Error("OCCT backend: pattern generated no instances");
      }
      outputs.set(sourceResult, {
        id: `${feature.id}:solid`,
        kind: "solid",
        meta: { shape: merged },
      });
      const selections = this.collectSelections(
        merged,
        feature.id,
        sourceResult,
        feature.tags
      );
      return { outputs, selections };
    }
    return { outputs, selections: [] };
  }

  private unionShapesBalanced(shapes: any[]): any | null {
    if (shapes.length === 0) return null;
    let current = shapes.slice();
    while (current.length > 1) {
      const next: any[] = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = current[i + 1];
        if (!left) continue;
        if (!right) {
          next.push(left);
          continue;
        }
        const fused = this.makeBoolean("union", left, right);
        next.push(this.readShape(fused));
      }
      current = next;
    }
    return current[0] ?? null;
  }

  private execSketch(
    feature: Sketch2D,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const outputs = new Map<
      string,
      { id: string; kind: "profile"; meta: Record<string, unknown> }
    >();
    const entityMap = new Map<ID, SketchEntity>();
    for (const entity of feature.entities ?? []) {
      entityMap.set(entity.id, entity);
    }
    const needsPlane = feature.profiles.some(
      (entry) => entry.profile.kind === "profile.sketch"
    );
    const plane = needsPlane
      ? this.resolveSketchPlane(feature, upstream, resolve)
      : null;
    for (const entry of feature.profiles) {
      if (entry.profile.kind === "profile.sketch") {
        if (!plane) {
          throw new Error("OCCT backend: missing sketch plane for profile.sketch");
        }
        const allowOpen = entry.profile.open === true;
        const { wire, closed } = this.buildSketchWireWithStatus(
          entry.profile.loop,
          entityMap,
          plane,
          allowOpen
        );
        const holes = allowOpen
          ? []
          : (entry.profile.holes ?? []).map((hole) =>
              this.buildSketchWire(hole, entityMap, plane)
            );
        const face = allowOpen
          ? undefined
          : this.buildSketchProfileFaceFromWires(wire, holes);
        outputs.set(entry.name, {
          id: `${feature.id}:${entry.name}`,
          kind: "profile",
          meta: { profile: entry.profile, face, wire, wireClosed: closed },
        });
        continue;
      }
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
    ownerKey: string,
    featureTags?: string[],
    opts?: { rootKind?: "solid" | "face" }
  ): KernelSelection[] {
    const occt = this.occt as any;
    const selections: KernelSelection[] = [];
    const canonicalFaceIds = new Map<number, Array<{ shape: any; id: string }>>();
    const canonicalEdgeIds = new Map<number, Array<{ shape: any; id: string }>>();
    const tags =
      Array.isArray(featureTags) && featureTags.length > 0
        ? featureTags.slice()
        : undefined;

    const rootKind = opts?.rootKind ?? "solid";
    if (rootKind === "solid") {
      selections.push({
        id: this.nextSelectionId("solid"),
        kind: "solid",
        meta: {
          shape,
          owner: shape,
          ownerKey,
          createdBy: featureId,
          role: "body",
          center: this.shapeCenter(shape),
          featureTags: tags,
        },
      });
    }

    const faceExplorer = new occt.TopExp_Explorer_1();
    faceExplorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; faceExplorer.More(); faceExplorer.Next()) {
      const face = faceExplorer.Current();
      const id = this.canonicalSelectionId("face", face, canonicalFaceIds);
      selections.push({
        id,
        kind: "face",
        meta: this.faceMetadata(face, shape, featureId, ownerKey, tags),
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
      const id = this.canonicalSelectionId("edge", edge, canonicalEdgeIds);
      selections.push({
        id,
        kind: "edge",
        meta: this.edgeMetadata(edge, shape, featureId, ownerKey, tags),
      });
    }

    return selections;
  }

  private canonicalSelectionId(
    prefix: string,
    shape: any,
    canonical: Map<number, Array<{ shape: any; id: string }>>
  ): string {
    const hash = this.shapeHash(shape);
    const bucket = canonical.get(hash);
    if (bucket) {
      const match = bucket.find((entry) => this.shapesSame(entry.shape, shape));
      if (match) return match.id;
    }
    const id = this.nextSelectionId(prefix);
    if (bucket) {
      bucket.push({ shape, id });
    } else {
      canonical.set(hash, [{ shape, id }]);
    }
    return id;
  }

  private nextSelectionId(prefix: string): string {
    this.selectionSeq += 1;
    return `${prefix}:${this.selectionSeq}`;
  }

  private faceMetadata(
    face: any,
    owner: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ): Record<string, unknown> {
    const { area, center, planar, normal, normalVec, surfaceType } =
      this.faceProperties(face);
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
    return meta;
  }

  private edgeMetadata(
    edge: any,
    owner: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
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
      featureTags,
    };
  }

  private faceProperties(face: any): {
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
    let normalVec: [number, number, number] | undefined;
    let surfaceType: string | undefined;
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const types = (this.occt as any).GeomAbs_SurfaceType;
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
        else if (matches(types.GeomAbs_SurfaceOfExtrusion))
          surfaceType = "extrusion";
        else if (matches(types.GeomAbs_SurfaceOfRevolution))
          surfaceType = "revolution";
        else if (matches(types.GeomAbs_OffsetSurface)) surfaceType = "offset";
        else surfaceType = "other";
        planar = surfaceType === "plane";
      }
      if (planar) {
        const plane = this.call(adaptor, "Plane");
        const axis = this.call(plane, "Axis");
        const dir = this.call(axis, "Direction");
        const [x, y, z] = this.dirToArray(dir);
        normalVec = normalizeVector([x, y, z]);
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

    return { area, center, planar, normal, normalVec, surfaceType };
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
      if (
        obj.kind === "face" ||
        obj.kind === "edge" ||
        obj.kind === "solid" ||
        obj.kind === "surface"
      ) {
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

  private firstFace(shape: any): any | null {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    if (!explorer.More()) return null;
    return this.toFace(explorer.Current());
  }

  private axisBounds(
    axis: [number, number, number],
    bounds: { min: [number, number, number]; max: [number, number, number] }
  ): { min: number; max: number } | null {
    const corners: Array<[number, number, number]> = [
      [bounds.min[0], bounds.min[1], bounds.min[2]],
      [bounds.min[0], bounds.min[1], bounds.max[2]],
      [bounds.min[0], bounds.max[1], bounds.min[2]],
      [bounds.min[0], bounds.max[1], bounds.max[2]],
      [bounds.max[0], bounds.min[1], bounds.min[2]],
      [bounds.max[0], bounds.min[1], bounds.max[2]],
      [bounds.max[0], bounds.max[1], bounds.min[2]],
      [bounds.max[0], bounds.max[1], bounds.max[2]],
    ];
    let min = Infinity;
    let max = -Infinity;
    for (const corner of corners) {
      const proj = dot(corner, axis);
      if (proj < min) min = proj;
      if (proj > max) max = proj;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }

  private cylinderFromFace(face: any): {
    origin: [number, number, number];
    axis: [number, number, number];
    radius: number;
  } | null {
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const types = (this.occt as any).GeomAbs_SurfaceType;
      if (!types || typeof type?.value !== "number") return null;
      const cylinderType = types.GeomAbs_Cylinder;
      if (!cylinderType || cylinderType.value !== type.value) return null;
      const cylinder = this.callWithFallback(adaptor, ["Cylinder", "Cylinder_1"], [[]]);
      if (!cylinder) return null;
      const axis = this.callWithFallback(cylinder, ["Axis", "Axis_1", "Axis_2"], [[]]);
      const dir = axis
        ? this.callWithFallback(axis, ["Direction", "Direction_1"], [[]])
        : null;
      const loc = axis
        ? this.callWithFallback(axis, ["Location", "Location_1"], [[]])
        : null;
      const radius = this.callWithFallback(cylinder, ["Radius", "Radius_1"], [[]]);
      if (!dir || !loc || typeof radius !== "number") return null;
      return {
        origin: this.pointToArray(loc),
        axis: this.dirToArray(dir),
        radius,
      };
    } catch {
      return null;
    }
  }

  private cylinderVExtents(
    face: any,
    cylinder: { origin: [number, number, number]; axis: [number, number, number] }
  ): { min: number; max: number } | null {
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const first = this.callNumber(adaptor, "FirstVParameter");
      const last = this.callNumber(adaptor, "LastVParameter");
      const axis = normalizeVector(cylinder.axis);
      if (!isFiniteVec(axis)) return null;
      const base = dot(cylinder.origin, axis);
      const min = base + Math.min(first, last);
      const max = base + Math.max(first, last);
      if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
      return { min, max };
    } catch {
      const axis = normalizeVector(cylinder.axis);
      if (!isFiniteVec(axis)) return null;
      return this.axisBounds(axis, this.shapeBounds(face));
    }
  }

  private tryThickenCylindricalFace(face: any, offset: number): any | null {
    if (!Number.isFinite(offset) || offset === 0) return null;
    const cylinder = this.cylinderFromFace(face);
    if (!cylinder) return null;
    const axis = normalizeVector(cylinder.axis);
    if (!isFiniteVec(axis)) return null;
    const extents = this.cylinderVExtents(face, cylinder);
    if (!extents) return null;
    const min = Math.min(extents.min, extents.max);
    const max = Math.max(extents.min, extents.max);
    const height = max - min;
    if (!(height > 1e-6)) return null;
    const baseProj = dot(cylinder.origin, axis);
    const base = this.addVec(cylinder.origin, this.scaleVec(axis, min - baseProj));
    const r0 = cylinder.radius;
    const r1 = r0 + offset;
    const outer = Math.max(r0, r1);
    const inner = Math.min(r0, r1);
    if (!(outer > 0)) return null;
    const outerShape = this.readShape(this.makeCylinder(outer, height, axis, base));
    if (!(inner > 0)) {
      return outerShape;
    }
    const innerShape = this.readShape(this.makeCylinder(inner, height, axis, base));
    const cut = this.makeBoolean("cut", outerShape, innerShape);
    const result = this.readShape(cut);
    if (!this.isValidShape(result)) return null;
    return result;
  }

  private shapeCenter(shape: any): [number, number, number] {
    const bounds = this.shapeBounds(shape);
    return [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
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

  private makeCone(
    radius1: number,
    radius2: number,
    height: number,
    axisDir: [number, number, number],
    origin: [number, number, number]
  ) {
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(axisDir[0], axisDir[1], axisDir[2]);
    const ax2 = this.makeAx2(pnt, dir);
    const occt = this.occt as Record<string, any>;
    const ctorWithAxis = occt.BRepPrimAPI_MakeCone_3;
    if (typeof ctorWithAxis === "function") {
      return new ctorWithAxis(ax2, radius1, radius2, height);
    }
    const candidates: Array<unknown[]> = [
      [ax2, radius1, radius2, height],
      [ax2, radius1, radius2, height, 0],
      [radius1, radius2, height],
      [radius1, radius2, height, 0],
    ];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepPrimAPI_MakeCone", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct cone");
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

  private makeChamferBuilder(shape: any) {
    try {
      return this.newOcct("BRepFilletAPI_MakeChamfer", shape);
    } catch {
      throw new Error("OCCT backend: failed to construct chamfer builder");
    }
  }

  private makeDraftBuilder(shape: any) {
    const candidates: Array<unknown[]> = [[shape], []];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepOffsetAPI_DraftAngle", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct draft builder");
  }

  private makeLoftBuilder(isSolid: boolean) {
    const candidates: Array<unknown[]> = [
      [isSolid, false, 1e-6],
      [isSolid, false],
      [isSolid],
      [],
    ];
    for (const args of candidates) {
      try {
        return this.newOcct("BRepOffsetAPI_ThruSections", ...args);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct loft builder");
  }

  private addLoftWire(builder: any, wire: any) {
    const wireHandle = this.toWire(wire);
    this.callWithFallback(
      builder,
      ["AddWire", "AddWire_1", "Add"],
      [[wireHandle]]
    );
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

  private unifySameDomain(shape: any): any {
    let unifier: any;
    const ctorArgs: unknown[][] = [
      [shape, true, true, true],
      [shape, true, true, false],
      [shape, true, true],
      [shape],
    ];
    for (const args of ctorArgs) {
      try {
        unifier = this.newOcct("ShapeUpgrade_UnifySameDomain", ...args);
        break;
      } catch {
        continue;
      }
    }
    if (!unifier) return shape;

    try {
      this.callWithFallback(unifier, ["Build", "Build_1"], [[]]);
    } catch {
      return shape;
    }

    try {
      return this.callWithFallback(unifier, ["Shape", "Shape_1"], [[]]);
    } catch {
      return shape;
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

  private reverseShape(shape: any): any {
    const reversedCandidates = ["Reversed", "Reversed_1", "Reversed_2"];
    for (const name of reversedCandidates) {
      const fn = shape?.[name];
      if (typeof fn !== "function") continue;
      try {
        const candidate = fn.call(shape);
        if (candidate) return candidate;
      } catch {
        continue;
      }
    }
    const reverseCandidates = ["Reverse", "Reverse_1", "Reverse_2"];
    for (const name of reverseCandidates) {
      const fn = shape?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(shape);
        return shape;
      } catch {
        continue;
      }
    }
    return shape;
  }

  private shapeHasSolid(shape: any): boolean {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_SOLID,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    return explorer.More();
  }

  private makeSolidFromShells(shape: any): any | null {
    const occt = this.occt as any;
    const shells: any[] = [];
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_SHELL,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; explorer.More(); explorer.Next()) {
      shells.push(explorer.Current());
    }
    if (shells.length === 0) return null;
    let builder: any;
    try {
      builder = this.newOcct("BRepBuilderAPI_MakeSolid");
    } catch {
      return null;
    }
    for (const shell of shells) {
      this.callWithFallback(builder, ["Add", "Add_1"], [[this.toShell(shell)]]);
    }
    this.tryBuild(builder);
    try {
      return this.readShape(builder);
    } catch {
      return null;
    }
  }

  private isValidShape(shape: any, kind: KernelObject["kind"] = "solid"): boolean {
    try {
      return this.checkValid({ id: "tmp", kind, meta: { shape } } as KernelObject);
    } catch {
      return true;
    }
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

  private toWire(wire: any) {
    const occt = this.occt as any;
    if (occt.TopoDS?.Wire_1) {
      return occt.TopoDS.Wire_1(wire);
    }
    return wire;
  }

  private toShell(shell: any) {
    const occt = this.occt as any;
    if (occt.TopoDS?.Shell_1) {
      return occt.TopoDS.Shell_1(shell);
    }
    return shell;
  }

  private resolveProfile(
    profileRef: ProfileRef,
    upstream: KernelResult
  ): ResolvedProfile {
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
    return { profile, face, wire, wireClosed: typeof wireClosed === "boolean" ? wireClosed : undefined };
  }

  private buildSolidFromProfile(
    profile: ResolvedProfile,
    vec: [number, number, number]
  ) {
    const face = this.buildProfileFace(profile);
    const prism = this.makePrism(face, this.makeVec(vec[0], vec[1], vec[2]));
    return this.readShape(prism);
  }

  private buildProfileFace(profile: ResolvedProfile) {
    if (profile.face) return profile.face;
    switch (profile.profile.kind) {
      case "profile.rectangle":
        return this.makeRectangleFace(
          expectNumber(profile.profile.width, "profile.width"),
          expectNumber(profile.profile.height, "profile.height"),
          profile.profile.center
        );
      case "profile.circle":
        return this.makeCircleFace(
          expectNumber(profile.profile.radius, "profile.radius"),
          profile.profile.center
        );
      case "profile.poly":
        return this.makeRegularPolygonFace(
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
        throw new Error(
          `OCCT backend: unsupported profile ${(profile.profile as Profile).kind}`
        );
    }
  }

  private buildProfileWire(profile: ResolvedProfile): { wire: any; closed: boolean } {
    if (profile.wire) {
      return {
        wire: profile.wire,
        closed: profile.wireClosed !== undefined ? profile.wireClosed : true,
      };
    }
    switch (profile.profile.kind) {
      case "profile.rectangle":
        return {
          wire: this.makeRectangleWire(
            expectNumber(profile.profile.width, "profile.width"),
            expectNumber(profile.profile.height, "profile.height"),
            profile.profile.center
          ),
          closed: true,
        };
      case "profile.circle":
        return {
          wire: this.makeCircleWire(
            expectNumber(profile.profile.radius, "profile.radius"),
            profile.profile.center
          ),
          closed: true,
        };
      case "profile.poly":
        return {
          wire: this.makeRegularPolygonWire(
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
        throw new Error(
          `OCCT backend: unsupported profile ${(profile.profile as Profile).kind}`
        );
    }
  }

  private resolveSketchPlane(
    feature: Sketch2D,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): PlaneBasis {
    const originOffset = feature.origin ?? [0, 0, 0];
    if (!feature.plane) {
      return {
        origin: originOffset,
        xDir: [1, 0, 0],
        yDir: [0, 1, 0],
        normal: [0, 0, 1],
      };
    }
    const basis = this.resolvePlaneBasis(feature.plane, upstream, resolve);
    return {
      ...basis,
      origin: [
        basis.origin[0] + originOffset[0],
        basis.origin[1] + originOffset[1],
        basis.origin[2] + originOffset[2],
      ],
    };
  }

  private resolvePlaneBasis(
    planeRef: PlaneRef,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): PlaneBasis {
    if (this.isSelectorRef(planeRef)) {
      const target = resolve(planeRef as Selector, upstream);
      if (target.kind !== "face") {
        throw new Error("OCCT backend: plane reference must resolve to a face");
      }
      const face = target.meta["shape"];
      if (!face) {
        throw new Error("OCCT backend: plane reference missing face shape");
      }
      return this.planeBasisFromFace(face);
    }
    if (planeRef.kind === "plane.datum") {
      const datum = upstream.outputs.get(this.datumKey(planeRef.ref));
      if (!datum || datum.kind !== "datum") {
        throw new Error(`OCCT backend: missing datum plane ${planeRef.ref}`);
      }
      const meta = datum.meta as Record<string, unknown>;
      if (meta.type !== "plane" && meta.type !== "frame") {
        throw new Error("OCCT backend: datum is not a plane or frame");
      }
      return {
        origin: meta.origin as [number, number, number],
        xDir: meta.xDir as [number, number, number],
        yDir: meta.yDir as [number, number, number],
        normal: meta.normal as [number, number, number],
      };
    }
    throw new Error("OCCT backend: unsupported plane reference");
  }

  private planeBasisFromFace(face: any): PlaneBasis {
    const faceHandle = this.toFace(face);
    const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
    const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
    const planeType = (this.occt as any).GeomAbs_SurfaceType?.GeomAbs_Plane;
    if (!planeType || typeof type?.value !== "number" || type.value !== planeType.value) {
      throw new Error("OCCT backend: sketch plane face is not planar");
    }
    const plane = this.call(adaptor, "Plane");
    const pos = this.call(plane, "Position");
    const loc = this.call(pos, "Location");
    const xDir = this.call(pos, "XDirection");
    const yDir = this.call(pos, "YDirection");
    const normal = this.call(pos, "Direction");
    return {
      origin: this.pointToArray(loc),
      xDir: this.dirToArray(xDir),
      yDir: this.dirToArray(yDir),
      normal: this.dirToArray(normal),
    };
  }

  private planeBasisFromNormal(
    origin: [number, number, number],
    normal: [number, number, number]
  ): PlaneBasis {
    const n = normalizeVector(normal);
    if (!isFiniteVec(n)) {
      throw new Error("OCCT backend: sweep plane normal is degenerate");
    }
    const up: [number, number, number] = Math.abs(dot(n, [0, 0, 1])) > 0.9
      ? [1, 0, 0]
      : [0, 0, 1];
    let xDir = normalizeVector(cross(up, n));
    if (!isFiniteVec(xDir)) {
      xDir = normalizeVector(cross([0, 1, 0], n));
    }
    if (!isFiniteVec(xDir)) {
      throw new Error("OCCT backend: failed to build sweep plane basis");
    }
    const yDir = normalizeVector(cross(n, xDir));
    if (!isFiniteVec(yDir)) {
      throw new Error("OCCT backend: failed to build sweep plane basis");
    }
    return { origin, xDir, yDir, normal: n };
  }

  private resolveAxisSpec(
    axis: AxisSpec,
    upstream: KernelResult,
    label: string
  ): [number, number, number] {
    if (typeof axis === "string") {
      return axisVector(axis);
    }
    if (axis.kind === "axis.vector") {
      const dir = [
        expectNumber(axis.direction[0], `${label} direction[0]`),
        expectNumber(axis.direction[1], `${label} direction[1]`),
        expectNumber(axis.direction[2], `${label} direction[2]`),
      ] as [number, number, number];
      const normalized = normalizeVector(dir);
      if (!isFiniteVec(normalized)) {
        throw new Error(`OCCT backend: ${label} direction is invalid`);
      }
      return normalized;
    }
    if (axis.kind === "axis.datum") {
      const datum = upstream.outputs.get(this.datumKey(axis.ref));
      if (!datum || datum.kind !== "datum") {
        throw new Error(`OCCT backend: missing datum axis ${axis.ref}`);
      }
      const meta = datum.meta as Record<string, unknown>;
      if (meta.type !== "axis") {
        throw new Error("OCCT backend: datum ref is not an axis");
      }
      const dir = meta.direction as [number, number, number];
      const normalized = normalizeVector(dir);
      if (!isFiniteVec(normalized)) {
        throw new Error(`OCCT backend: ${label} direction is invalid`);
      }
      return normalized;
    }
    throw new Error(`OCCT backend: ${label} axis spec not supported`);
  }

  private resolveExtrudeAxis(
    axis: ExtrudeAxis | undefined,
    profile: ResolvedProfile,
    upstream: KernelResult
  ): [number, number, number] {
    if (!axis) return [0, 0, 1];
    if (typeof axis === "object" && axis.kind === "axis.sketch.normal") {
      if (!profile.face) {
        throw new Error("OCCT backend: sketch normal requires a sketch profile");
      }
      const basis = this.planeBasisFromFace(profile.face);
      return normalizeVector(basis.normal);
    }
    return this.resolveAxisSpec(axis as AxisSpec, upstream, "extrude axis");
  }

  private basisFromNormal(
    normal: [number, number, number],
    xHint: [number, number, number] | undefined,
    origin: [number, number, number]
  ): PlaneBasis {
    const n = normalizeVector(normal);
    if (!isFiniteVec(n)) {
      throw new Error("OCCT backend: datum plane normal is invalid");
    }
    let xDir = xHint ? normalizeVector(xHint) : this.defaultAxisForNormal(n);
    if (!isFiniteVec(xDir) || Math.abs(dot(xDir, n)) > 0.95) {
      xDir = this.defaultAxisForNormal(n);
    }
    const xOrth = this.subVec(xDir, this.scaleVec(n, dot(xDir, n)));
    xDir = normalizeVector(xOrth);
    if (!isFiniteVec(xDir)) {
      xDir = this.defaultAxisForNormal(n);
    }
    const yDir = normalizeVector(cross(n, xDir));
    return {
      origin,
      xDir,
      yDir,
      normal: n,
    };
  }

  private defaultAxisForNormal(normal: [number, number, number]): [number, number, number] {
    if (Math.abs(normal[0]) < 0.9) return [1, 0, 0];
    return [0, 1, 0];
  }

  private datumKey(id: string): string {
    return `datum:${id}`;
  }

  private patternKey(id: string): string {
    return `pattern:${id}`;
  }

  private isSelectorRef(ref: PlaneRef): ref is Selector {
    return (
      typeof ref === "object" &&
      ref !== null &&
      ["selector.face", "selector.edge", "selector.solid", "selector.named"].includes(
        (ref as { kind?: string }).kind ?? ""
      )
    );
  }

  private offsetFromPlane(
    offset: Point2D,
    xDir: [number, number, number],
    yDir: [number, number, number]
  ): [number, number, number] {
    const dx = expectNumber(offset[0], "offset x");
    const dy = expectNumber(offset[1], "offset y");
    return [
      xDir[0] * dx + yDir[0] * dy,
      xDir[1] * dx + yDir[1] * dy,
      xDir[2] * dx + yDir[2] * dy,
    ];
  }

  private addVec(
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  private subVec(
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  private scaleVec(
    v: [number, number, number],
    s: number
  ): [number, number, number] {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  private patternCenters(
    patternRef: ID,
    position: Point2D,
    holePlane: PlaneBasis,
    upstream: KernelResult
  ): Array<[number, number, number]> {
    const pattern = this.resolvePattern(patternRef, upstream);
    const normal = pattern.normal as [number, number, number];
    if (Math.abs(dot(normalizeVector(normal), normalizeVector(holePlane.normal))) < 0.95) {
      throw new Error("OCCT backend: pattern plane does not match hole face");
    }
    const xDir = pattern.xDir as [number, number, number];
    const yDir = pattern.yDir as [number, number, number];
    const origin = pattern.origin as [number, number, number];
    const baseOffset = this.offsetFromPlane(position, xDir, yDir);

    if (pattern.type === "pattern.linear") {
      const spacing = pattern.spacing as [number, number];
      const count = pattern.count as [number, number];
      const countX = Math.max(1, Math.round(count[0]));
      const countY = Math.max(1, Math.round(count[1]));
      const centers: Array<[number, number, number]> = [];
      for (let i = 0; i < countX; i += 1) {
        for (let j = 0; j < countY; j += 1) {
          const offset = [
            baseOffset[0] + xDir[0] * spacing[0] * i + yDir[0] * spacing[1] * j,
            baseOffset[1] + xDir[1] * spacing[0] * i + yDir[1] * spacing[1] * j,
            baseOffset[2] + xDir[2] * spacing[0] * i + yDir[2] * spacing[1] * j,
          ] as [number, number, number];
          centers.push(this.addVec(origin, offset));
        }
      }
      return centers;
    }

    const count = Math.max(1, Math.round(pattern.count as number));
    const axis = normalizeVector(pattern.axis as [number, number, number]);
    const centers: Array<[number, number, number]> = [];
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const rotated = rotateAroundAxis(baseOffset, axis, angle);
      centers.push(this.addVec(origin, rotated));
    }
    return centers;
  }

  private resolvePattern(patternRef: ID, upstream: KernelResult): Record<string, unknown> {
    const output = upstream.outputs.get(this.patternKey(patternRef));
    if (!output || output.kind !== "pattern") {
      throw new Error(`OCCT backend: missing pattern ${patternRef}`);
    }
    return output.meta as Record<string, unknown>;
  }

  private buildPathWire(path: Path3D) {
    const segments: EdgeSegment[] = [];
    if (path.kind === "path.spline") {
      const { edge, start, end } = this.makeSplineEdge3D(path);
      segments.push({ edge, start, end });
    } else if (path.kind === "path.polyline") {
      const points = path.points;
      for (let i = 0; i < points.length - 1; i += 1) {
        const startPoint = points[i];
        const endPoint = points[i + 1];
        if (!startPoint || !endPoint) continue;
        const start = this.point3Numbers(startPoint, "path point");
        const end = this.point3Numbers(endPoint, "path point");
        segments.push({ edge: this.makeLineEdge(start, end), start, end });
      }
      if (path.closed && points.length > 1) {
        const startPoint = points[points.length - 1];
        const endPoint = points[0];
        if (startPoint && endPoint) {
          const start = this.point3Numbers(startPoint, "path point");
          const end = this.point3Numbers(endPoint, "path point");
          segments.push({ edge: this.makeLineEdge(start, end), start, end });
        }
      }
    } else {
      for (const segment of path.segments) {
        if (segment.kind === "path.line") {
          const start = this.point3Numbers(segment.start, "path line start");
          const end = this.point3Numbers(segment.end, "path line end");
          segments.push({ edge: this.makeLineEdge(start, end), start, end });
          continue;
        }
        if (segment.kind === "path.arc") {
          const start = this.point3Numbers(segment.start, "path arc start");
          const end = this.point3Numbers(segment.end, "path arc end");
          const center = this.point3Numbers(segment.center, "path arc center");
          const mid = this.arcMidpointFromCenter(start, end, center, segment.direction);
          segments.push({ edge: this.makeArcEdge(start, mid, end), start, end });
        }
      }
    }

    if (segments.length === 0) {
      throw new Error("OCCT backend: path must have at least one segment");
    }
    for (let i = 0; i < segments.length - 1; i += 1) {
      const current = segments[i];
      const next = segments[i + 1];
      if (!current || !next) continue;
      if (!this.pointsClose(current.end, next.start)) {
        throw new Error("OCCT backend: path segments are not connected");
      }
    }
    const wireBuilder = this.newOcct("BRepBuilderAPI_MakeWire");
    for (const segment of segments) {
      if (!this.addWireEdge(wireBuilder, segment.edge)) {
        throw new Error("OCCT backend: path wire builder missing Add()");
      }
    }
    if (typeof wireBuilder.Wire === "function") return wireBuilder.Wire();
    if (typeof wireBuilder.wire === "function") return wireBuilder.wire();
    if (wireBuilder.Shape) return wireBuilder.Shape();
    throw new Error("OCCT backend: path wire builder missing Wire()");
  }

  private pathSegments(path: Path3D): EdgeSegment[] {
    const segments: EdgeSegment[] = [];
    if (path.kind === "path.spline") {
      throw new Error("OCCT backend: pipe sweep does not support spline paths");
    }
    if (path.kind === "path.polyline") {
      const points = path.points;
      for (let i = 0; i < points.length - 1; i += 1) {
        const startPoint = points[i];
        const endPoint = points[i + 1];
        if (!startPoint || !endPoint) continue;
        const start = this.point3Numbers(startPoint, "path point");
        const end = this.point3Numbers(endPoint, "path point");
        segments.push({ edge: this.makeLineEdge(start, end), start, end });
      }
      if (path.closed && points.length > 1) {
        const startPoint = points[points.length - 1];
        const endPoint = points[0];
        if (!startPoint || !endPoint) return segments;
        const start = this.point3Numbers(startPoint, "path point");
        const end = this.point3Numbers(endPoint, "path point");
        segments.push({ edge: this.makeLineEdge(start, end), start, end });
      }
      return segments;
    }

    for (const segment of path.segments) {
      if (segment.kind === "path.line") {
        const start = this.point3Numbers(segment.start, "path line start");
        const end = this.point3Numbers(segment.end, "path line end");
        segments.push({ edge: this.makeLineEdge(start, end), start, end });
        continue;
      }
      if (segment.kind === "path.arc") {
        const start = this.point3Numbers(segment.start, "path arc start");
        const end = this.point3Numbers(segment.end, "path arc end");
        const center = this.point3Numbers(segment.center, "path arc center");
        const mid = this.arcMidpointFromCenter(start, end, center, segment.direction);
        segments.push({ edge: this.makeLineEdge(start, mid), start, end: mid });
        segments.push({ edge: this.makeLineEdge(mid, end), start: mid, end });
      }
    }
    return segments;
  }

  private pathStartTangent(path: Path3D): {
    start: [number, number, number];
    tangent: [number, number, number];
  } {
    if (path.kind === "path.polyline") {
      if (path.points.length < 2) {
        throw new Error("OCCT backend: path needs at least 2 points");
      }
      const startPoint = path.points[0];
      const nextPoint = path.points[1];
      if (!startPoint || !nextPoint) {
        throw new Error("OCCT backend: path needs at least 2 points");
      }
      const start = this.point3Numbers(startPoint, "path point");
      const next = this.point3Numbers(nextPoint, "path point");
      return { start, tangent: this.subVec(next, start) };
    }
    if (path.kind === "path.spline") {
      if (path.points.length < 2) {
        throw new Error("OCCT backend: path needs at least 2 points");
      }
      const startPoint = path.points[0];
      const nextPoint = path.points[1];
      if (!startPoint || !nextPoint) {
        throw new Error("OCCT backend: path needs at least 2 points");
      }
      const start = this.point3Numbers(startPoint, "path point");
      const next = this.point3Numbers(nextPoint, "path point");
      return { start, tangent: this.subVec(next, start) };
    }
    if (path.segments.length === 0) {
      throw new Error("OCCT backend: path has no segments");
    }
    const first = path.segments[0];
    if (!first) {
      throw new Error("OCCT backend: path has no segments");
    }
    if (first.kind === "path.line") {
      const start = this.point3Numbers(first.start, "path line start");
      const end = this.point3Numbers(first.end, "path line end");
      return { start, tangent: this.subVec(end, start) };
    }
    if (first.kind === "path.arc") {
      const start = this.point3Numbers(first.start, "path arc start");
      const end = this.point3Numbers(first.end, "path arc end");
      const center = this.point3Numbers(first.center, "path arc center");
      const mid = this.arcMidpointFromCenter(start, end, center, first.direction);
      return { start, tangent: this.subVec(mid, start) };
    }
    throw new Error("OCCT backend: unsupported path segment");
  }

  private arcMidpointFromCenter(
    start: [number, number, number],
    end: [number, number, number],
    center: [number, number, number],
    direction?: "cw" | "ccw"
  ): [number, number, number] {
    const v1 = this.subVec(start, center);
    const v2 = this.subVec(end, center);
    const r1 = vecLength(v1);
    const r2 = vecLength(v2);
    if (Math.abs(r1 - r2) > 1e-5 || r1 === 0) {
      throw new Error("OCCT backend: path arc radius mismatch");
    }
    const n = normalizeVector(cross(v1, v2));
    if (!isFiniteVec(n)) {
      throw new Error("OCCT backend: path arc is degenerate");
    }
    const dotVal = clamp(dot(v1, v2) / (r1 * r2), -1, 1);
    const angle = Math.acos(dotVal);
    const axis = direction === "cw" ? this.scaleVec(n, -1) : n;
    const midVec = rotateAroundAxis(v1, axis, angle / 2);
    return this.addVec(center, midVec);
  }

  private makeShapeList(shapes: any[]): any {
    const list = this.newOcct("TopTools_ListOfShape");
    for (const shape of shapes) {
      this.callWithFallback(
        list,
        ["Append", "Append_1", "Add", "Add_1", "add"],
        [[shape]]
      );
    }
    return list;
  }

  private makeThickSolid(
    shape: any,
    removeFaces: any[],
    offset: number,
    tolerance: number,
    opts?: {
      intersection?: boolean;
      selfIntersection?: boolean;
      removeInternalEdges?: boolean;
    }
  ): any {
    const faces = this.makeShapeList(removeFaces.map((face) => this.toFace(face)));
    const occt = this.occt as any;
    const mode = occt.BRepOffset_Mode?.BRepOffset_Skin;
    const join = occt.GeomAbs_JoinType?.GeomAbs_Arc;
    const progress = this.makeProgressRange();
    const intersection = opts?.intersection ?? false;
    const selfIntersection = opts?.selfIntersection ?? false;
    const removeInternalEdges = opts?.removeInternalEdges ?? false;
    const argsList: unknown[][] = [[shape, faces, offset, tolerance]];
    if (mode !== undefined) {
      argsList.push([shape, faces, offset, tolerance, mode]);
    }
    if (mode !== undefined && join !== undefined) {
      argsList.push([
        shape,
        faces,
        offset,
        tolerance,
        mode,
        intersection,
        selfIntersection,
        join,
        removeInternalEdges,
      ]);
      if (progress !== null && progress !== undefined) {
        argsList.push([
          shape,
          faces,
          offset,
          tolerance,
          mode,
          intersection,
          selfIntersection,
          join,
          removeInternalEdges,
          progress,
        ]);
      }
    }

    let builder: any | null = null;
    try {
      builder = this.newOcct("BRepOffsetAPI_MakeThickSolid");
    } catch {
      builder = null;
    }
    if (builder) {
      this.callWithFallback(
        builder,
        ["MakeThickSolidByJoin", "MakeThickSolidByJoin_1", "MakeThickSolidByJoin_2"],
        argsList
      );
      this.tryBuild(builder);
      return this.readShape(builder);
    }

    const ctorArgs = [
      [shape, faces, offset, tolerance],
      [shape, faces, offset],
    ];
    for (const args of ctorArgs) {
      try {
        const candidate = this.newOcct("BRepOffsetAPI_MakeThickSolid", ...args);
        this.tryBuild(candidate);
        return this.readShape(candidate);
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct thick solid");
  }

  private makePipeSolid(
    spine: any,
    profile: any,
    frame: PlaneBasis,
    opts?: { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean }
  ): any;
  private makePipeSolid(
    spine: any,
    profile: any,
    opts?: { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean }
  ): any;
  private makePipeSolid(
    spine: any,
    profile: any,
    frame?: PlaneBasis | { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean },
    opts?: { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean }
  ) {
    const resolvedFrame =
      frame && "origin" in frame ? (frame as PlaneBasis) : undefined;
    const resolvedOpts =
      frame && "origin" in frame
        ? opts
        : (frame as
            | { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean }
            | undefined);
    const occt = this.occt as any;
    const makeSolid = resolvedOpts?.makeSolid !== false;
    const allowFallback = resolvedOpts?.allowFallback !== false;
    const frenet = resolvedOpts?.frenet === true;
    try {
      const shell = this.newOcct("BRepOffsetAPI_MakePipeShell", spine);
      if (resolvedFrame) {
        this.trySetPipeShellMode(shell, resolvedFrame);
      } else {
        this.trySetPipeShellFrenet(shell, frenet);
      }
      const mode = occt.BRepBuilderAPI_TransitionMode?.BRepBuilderAPI_RoundCorner;
      if (mode && typeof shell.SetTransitionMode === "function") {
        shell.SetTransitionMode(mode);
      }
      const add =
        typeof shell.Add_1 === "function"
          ? shell.Add_1.bind(shell)
          : typeof shell.Add === "function"
            ? shell.Add.bind(shell)
            : null;
      if (!add) {
        throw new Error("OCCT backend: pipe shell missing Add()");
      }
      add(profile, false, false);
      this.tryBuild(shell);
      if (makeSolid && typeof shell.MakeSolid === "function") {
        shell.MakeSolid();
      }
      return this.readShape(shell);
    } catch {
      if (!allowFallback) {
        throw new Error("OCCT backend: pipe shell failed and fallback is disabled");
      }
      const builder = this.newOcct("BRepOffsetAPI_MakePipe", spine, profile);
      this.tryBuild(builder);
      return this.readShape(builder);
    }
  }

  private makeSweepSolid(
    spine: any,
    profile: any,
    frame: PlaneBasis,
    opts?: {
      makeSolid?: boolean;
      allowFallback?: boolean;
      frenet?: boolean;
      auxiliarySpine?: any;
      auxiliaryCurvilinear?: boolean;
      auxiliaryKeepContact?: boolean;
    }
  ): any;
  private makeSweepSolid(
    spine: any,
    profile: any,
    opts?: {
      makeSolid?: boolean;
      allowFallback?: boolean;
      frenet?: boolean;
      auxiliarySpine?: any;
      auxiliaryCurvilinear?: boolean;
      auxiliaryKeepContact?: boolean;
    }
  ): any;
  private makeSweepSolid(
    spine: any,
    profile: any,
    frame?:
      | PlaneBasis
      | {
          makeSolid?: boolean;
          allowFallback?: boolean;
          frenet?: boolean;
          auxiliarySpine?: any;
          auxiliaryCurvilinear?: boolean;
          auxiliaryKeepContact?: boolean;
        },
    opts?: {
      makeSolid?: boolean;
      allowFallback?: boolean;
      frenet?: boolean;
      auxiliarySpine?: any;
      auxiliaryCurvilinear?: boolean;
      auxiliaryKeepContact?: boolean;
      }
  ) {
    type SweepOpts = {
      makeSolid?: boolean;
      allowFallback?: boolean;
      frenet?: boolean;
      auxiliarySpine?: any;
      auxiliaryCurvilinear?: boolean;
      auxiliaryKeepContact?: boolean;
    };
    const resolvedFrame =
      frame && "origin" in frame ? (frame as PlaneBasis) : undefined;
    const resolvedOpts: SweepOpts | undefined =
      frame && "origin" in frame
        ? (opts as SweepOpts | undefined)
        : (frame as SweepOpts | undefined);
    const occt = this.occt as any;
    const makeSolid = resolvedOpts?.makeSolid !== false;
    const allowFallback = resolvedOpts?.allowFallback !== false;
    const frenet = resolvedOpts?.frenet !== false;
    const auxiliarySpine = resolvedOpts?.auxiliarySpine;
    try {
      const shell = this.newOcct("BRepOffsetAPI_MakePipeShell", spine);
      if (auxiliarySpine) {
        const applied = this.trySetPipeShellAuxiliary(shell, auxiliarySpine, {
          curvilinear: resolvedOpts?.auxiliaryCurvilinear,
          keepContact: resolvedOpts?.auxiliaryKeepContact,
        });
        if (!applied) {
          if (resolvedFrame) {
            this.trySetPipeShellMode(shell, resolvedFrame);
          } else {
            this.trySetPipeShellFrenet(shell, frenet);
          }
        }
      } else if (resolvedFrame) {
        this.trySetPipeShellMode(shell, resolvedFrame);
      } else {
        this.trySetPipeShellFrenet(shell, frenet);
      }
      const mode = occt.BRepBuilderAPI_TransitionMode?.BRepBuilderAPI_RoundCorner;
      if (mode && typeof shell.SetTransitionMode === "function") {
        shell.SetTransitionMode(mode);
      }
      const add =
        typeof shell.Add_1 === "function"
          ? shell.Add_1.bind(shell)
          : typeof shell.Add === "function"
            ? shell.Add.bind(shell)
            : null;
      if (!add) {
        throw new Error("OCCT backend: sweep shell missing Add()");
      }
      add(profile, false, false);
      this.tryBuild(shell);
      if (makeSolid && typeof shell.MakeSolid === "function") {
        shell.MakeSolid();
      }
      return this.readShape(shell);
    } catch {
      if (!allowFallback) {
        throw new Error("OCCT backend: sweep shell failed and fallback is disabled");
      }
      const builder = this.newOcct("BRepOffsetAPI_MakePipe", spine, profile);
      this.tryBuild(builder);
      return this.readShape(builder);
    }
  }

  private trySetPipeShellFrenet(shell: any, frenet: boolean): boolean {
    const candidates = ["SetMode_1", "SetMode"];
    for (const name of candidates) {
      const fn = shell?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(shell, frenet);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private trySetPipeShellMode(shell: any, frame: PlaneBasis): boolean {
    const origin = this.makePnt(frame.origin[0], frame.origin[1], frame.origin[2]);
    const normal = this.makeDir(frame.normal[0], frame.normal[1], frame.normal[2]);
    const xDir = this.makeDir(frame.xDir[0], frame.xDir[1], frame.xDir[2]);
    const ax2 = this.makeAx2WithXDir(origin, normal, xDir);
    const candidates: Array<{ names: string[]; args: unknown[] }> = [
      { names: ["SetMode_3", "SetMode_2", "SetMode_1", "SetMode"], args: [ax2] },
      { names: ["SetMode_2", "SetMode_1", "SetMode"], args: [xDir] },
      { names: ["SetMode_1", "SetMode"], args: [false] },
    ];
    for (const candidate of candidates) {
      for (const name of candidate.names) {
        const fn = shell?.[name];
        if (typeof fn !== "function") continue;
        try {
          fn.call(shell, ...candidate.args);
          return true;
        } catch {
          continue;
        }
      }
    }
    return false;
  }

  private trySetPipeShellAuxiliary(
    shell: any,
    auxiliarySpine: any,
    opts?: { curvilinear?: boolean; keepContact?: boolean }
  ): boolean {
    const wire = this.toWire(auxiliarySpine);
    const curvilinear = opts?.curvilinear ?? true;
    const keepContact = opts?.keepContact ?? true;
    const candidates: Array<{ names: string[]; args: unknown[] }> = [
      { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire, curvilinear, keepContact] },
      { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire, curvilinear] },
      { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire] },
    ];
    for (const candidate of candidates) {
      for (const name of candidate.names) {
        const fn = shell?.[name];
        if (typeof fn !== "function") continue;
        try {
          fn.call(shell, ...candidate.args);
          return true;
        } catch {
          continue;
        }
      }
    }
    return false;
  }

  private makeRingFace(
    center: [number, number, number],
    normal: [number, number, number],
    outerRadius: number,
    innerRadius: number
  ) {
    const outerEdge = this.makeCircleEdge(center, outerRadius, normal);
    const outerWire = this.makeWireFromEdges([outerEdge]);
    const faceBuilder = this.makeFaceFromWire(outerWire);
    if (innerRadius > 0) {
      const innerEdge = this.makeCircleEdge(center, innerRadius, normal);
      const innerWire = this.makeWireFromEdges([innerEdge]);
      if (typeof faceBuilder.Add === "function") {
        faceBuilder.Add(innerWire);
      } else if (typeof faceBuilder.add === "function") {
        faceBuilder.add(innerWire);
      } else {
        throw new Error("OCCT backend: face builder missing Add()");
      }
    }
    return this.readFace(faceBuilder);
  }

  private makeWireFromEdges(edges: any[]) {
    const wireBuilder = this.newOcct("BRepBuilderAPI_MakeWire");
    for (const edge of edges) {
      if (!this.addWireEdge(wireBuilder, edge)) {
        throw new Error("OCCT backend: wire builder missing Add()");
      }
    }
    if (typeof wireBuilder.Wire === "function") return wireBuilder.Wire();
    if (typeof wireBuilder.wire === "function") return wireBuilder.wire();
    if (wireBuilder.Shape) return wireBuilder.Shape();
    throw new Error("OCCT backend: wire builder missing Wire()");
  }

  private makePolygonWire(points: [number, number, number][]) {
    if (points.length < 3) {
      throw new Error("OCCT backend: polygon wire requires at least 3 points");
    }
    const edges: any[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      if (!start || !end) continue;
      edges.push(this.makeLineEdge(start, end));
    }
    return this.makeWireFromEdges(edges);
  }

  private regularPolygonPoints(
    center: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    radius: number,
    sides: number,
    rotation = 0
  ): [number, number, number][] {
    if (sides < 3) {
      throw new Error("OCCT backend: regular polygon requires at least 3 sides");
    }
    const points: [number, number, number][] = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (Math.PI * 2 * i) / sides;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      points.push([
        center[0] + xDir[0] * radius * cos + yDir[0] * radius * sin,
        center[1] + xDir[1] * radius * cos + yDir[1] * radius * sin,
        center[2] + xDir[2] * radius * cos + yDir[2] * radius * sin,
      ]);
    }
    return points;
  }

  private point3Numbers(point: Point3D, label: string): [number, number, number] {
    return [
      expectNumber(point[0], `${label} x`),
      expectNumber(point[1], `${label} y`),
      expectNumber(point[2], `${label} z`),
    ];
  }

  private buildSketchProfileFace(
    profile: Extract<Profile, { kind: "profile.sketch" }>,
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis
  ) {
    const outer = this.buildSketchWire(profile.loop, entityMap, plane);
    const holes = (profile.holes ?? []).map((hole) =>
      this.buildSketchWire(hole, entityMap, plane)
    );
    return this.buildSketchProfileFaceFromWires(outer, holes);
  }

  private buildSketchProfileFaceFromWires(outer: any, holes: any[]) {
    const faceBuilder = this.makeFaceFromWire(outer);
    for (const hole of holes) {
      if (typeof faceBuilder.Add === "function") {
        faceBuilder.Add(hole);
      } else if (typeof faceBuilder.add === "function") {
        faceBuilder.add(hole);
      } else {
        throw new Error("OCCT backend: face builder missing Add()");
      }
    }
    return this.readFace(faceBuilder);
  }

  private buildSketchWire(
    loop: ID[],
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis
  ) {
    const result = this.buildSketchWireWithStatus(loop, entityMap, plane, false);
    return result.wire;
  }

  private buildSketchWireWithStatus(
    loop: ID[],
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis,
    allowOpen: boolean
  ): { wire: any; closed: boolean } {
    const segments: EdgeSegment[] = [];
    for (const id of loop) {
      const entity = entityMap.get(id);
      if (!entity) {
        throw new Error(`OCCT backend: sketch entity ${id} not found`);
      }
      segments.push(...this.sketchEntityToSegments(entity, plane));
    }
    const closed = this.checkLoopContinuity(segments, allowOpen);
    const wireBuilder = this.newOcct("BRepBuilderAPI_MakeWire");
    for (const segment of segments) {
      if (!this.addWireEdge(wireBuilder, segment.edge)) {
        throw new Error("OCCT backend: wire builder missing Add()");
      }
    }
    if (typeof wireBuilder.Wire === "function") return { wire: wireBuilder.Wire(), closed };
    if (typeof wireBuilder.wire === "function") return { wire: wireBuilder.wire(), closed };
    if (wireBuilder.Shape) return { wire: wireBuilder.Shape(), closed };
    throw new Error("OCCT backend: wire builder missing Wire()");
  }

  private sketchEntityToSegments(entity: SketchEntity, plane: PlaneBasis): EdgeSegment[] {
    switch (entity.kind) {
      case "sketch.line": {
        const start = this.point2To3(entity.start, plane);
        const end = this.point2To3(entity.end, plane);
        return [
          {
            edge: this.makeLineEdge(start, end),
            start,
            end,
          },
        ];
      }
      case "sketch.arc": {
        const start2 = entity.start;
        const end2 = entity.end;
        const center2 = entity.center;
        const start = this.point2To3(start2, plane);
        const end = this.point2To3(end2, plane);
        const radiusStart = this.dist2(start2, center2);
        const radiusEnd = this.dist2(end2, center2);
        if (Math.abs(radiusStart - radiusEnd) > 1e-6) {
          throw new Error("OCCT backend: sketch arc radius mismatch");
        }
        const mid2 = this.arcMidpoint(start2, end2, center2, entity.direction);
        const mid = this.point2To3(mid2, plane);
        return [
          {
            edge: this.makeArcEdge(start, mid, end),
            start,
            end,
          },
        ];
      }
      case "sketch.circle": {
        const center = this.point2To3(entity.center, plane);
        const radius = expectNumber(entity.radius, "sketch circle radius");
        return [
          {
            edge: this.makeCircleEdge(center, radius, plane.normal),
            start: center,
            end: center,
            closed: true,
          },
        ];
      }
      case "sketch.ellipse": {
        const center2 = this.point2Numbers(entity.center, "sketch ellipse center");
        const center = this.point2To3([center2[0], center2[1]], plane);
        const radiusX = expectNumber(entity.radiusX, "sketch ellipse radiusX");
        const radiusY = expectNumber(entity.radiusY, "sketch ellipse radiusY");
        const rotation =
          entity.rotation === undefined
            ? 0
            : expectNumber(entity.rotation, "sketch ellipse rotation");
        const { major, minor, xDir } = this.ellipseAxes(
          plane,
          radiusX,
          radiusY,
          rotation
        );
        return [
          {
            edge: this.makeEllipseEdge(center, xDir, plane.normal, major, minor),
            start: center,
            end: center,
            closed: true,
          },
        ];
      }
      case "sketch.rectangle": {
        const points = this.rectanglePoints(entity);
        const segments: EdgeSegment[] = [];
        for (let i = 0; i < points.length; i += 1) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          if (!a || !b) continue;
          const start = this.point2To3(a, plane);
          const end = this.point2To3(b, plane);
          segments.push({
            edge: this.makeLineEdge(start, end),
            start,
            end,
          });
        }
        return segments;
      }
      case "sketch.slot": {
        return this.slotSegments(entity, plane);
      }
      case "sketch.polygon": {
        const points = this.polygonPoints(entity);
        const segments: EdgeSegment[] = [];
        for (let i = 0; i < points.length; i += 1) {
          const a = points[i];
          const b = points[(i + 1) % points.length];
          if (!a || !b) continue;
          const start = this.point2To3(a, plane);
          const end = this.point2To3(b, plane);
          segments.push({
            edge: this.makeLineEdge(start, end),
            start,
            end,
          });
        }
        return segments;
      }
      case "sketch.spline": {
        const { edge, start, end, closed } = this.makeSplineEdge(entity, plane);
        return [
          {
            edge,
            start,
            end,
            closed,
          },
        ];
      }
      default:
        throw new Error(`OCCT backend: unsupported sketch entity ${entity.kind}`);
    }
  }

  private slotSegments(entity: Extract<SketchEntity, { kind: "sketch.slot" }>, plane: PlaneBasis) {
    const length = expectNumber(entity.length, "sketch slot length");
    const width = expectNumber(entity.width, "sketch slot width");
    const radius = width / 2;
    if (radius <= 0 || length <= 0) {
      throw new Error("OCCT backend: sketch slot dimensions must be positive");
    }
    if (entity.endStyle === "straight") {
      const points = this.rectanglePoints({
        ...entity,
        kind: "sketch.rectangle",
        mode: "center",
        center: entity.center,
        width: length,
        height: width,
      });
      const segments: EdgeSegment[] = [];
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const start = this.point2To3(a, plane);
        const end = this.point2To3(b, plane);
        segments.push({ edge: this.makeLineEdge(start, end), start, end });
      }
      return segments;
    }
    const straightHalf = Math.max(0, length / 2 - radius);
    if (straightHalf === 0) {
      const center = this.point2To3(entity.center, plane);
      return [
        {
          edge: this.makeCircleEdge(center, radius, plane.normal),
          start: center,
          end: center,
          closed: true,
        },
      ];
    }
    const rot =
      entity.rotation === undefined
        ? 0
        : expectNumber(entity.rotation, "sketch slot rotation");
    const center2 = entity.center;
    const topRight: Point2D = [straightHalf, radius];
    const topLeft: Point2D = [-straightHalf, radius];
    const bottomRight: Point2D = [straightHalf, -radius];
    const bottomLeft: Point2D = [-straightHalf, -radius];
    const pts = [topRight, bottomRight, bottomLeft, topLeft].map((p) =>
      this.rotateTranslate2(p, center2, rot)
    );
    const [tr, br, bl, tl] = pts;
    if (!tr || !br || !bl || !tl) {
      throw new Error("OCCT backend: failed to build sketch slot points");
    }
    const segments: EdgeSegment[] = [];
    const tr3 = this.point2To3(tr, plane);
    const br3 = this.point2To3(br, plane);
    const bl3 = this.point2To3(bl, plane);
    const tl3 = this.point2To3(tl, plane);
    const leftMid2 = this.rotateTranslate2(
      [-straightHalf - radius, 0],
      center2,
      rot
    );
    const rightMid2 = this.rotateTranslate2(
      [straightHalf + radius, 0],
      center2,
      rot
    );
    const leftMid3 = this.point2To3(leftMid2, plane);
    const rightMid3 = this.point2To3(rightMid2, plane);
    segments.push({ edge: this.makeLineEdge(tr3, tl3), start: tr3, end: tl3 });
    segments.push({ edge: this.makeArcEdge(tl3, leftMid3, bl3), start: tl3, end: bl3 });
    segments.push({ edge: this.makeLineEdge(bl3, br3), start: bl3, end: br3 });
    segments.push({ edge: this.makeArcEdge(br3, rightMid3, tr3), start: br3, end: tr3 });
    return segments;
  }

  private polygonPoints(entity: Extract<SketchEntity, { kind: "sketch.polygon" }>): Point2D[] {
    const sides = Math.round(expectNumber(entity.sides, "sketch polygon sides"));
    if (sides < 3) {
      throw new Error("OCCT backend: sketch polygon must have at least 3 sides");
    }
    const radius = expectNumber(entity.radius, "sketch polygon radius");
    const rot =
      entity.rotation === undefined
        ? 0
        : expectNumber(entity.rotation, "sketch polygon rotation");
    const center = this.point2Numbers(entity.center, "sketch polygon center");
    const points: Point2D[] = [];
    for (let i = 0; i < sides; i += 1) {
      const angle = rot + (Math.PI * 2 * i) / sides;
      points.push([
        center[0] + radius * Math.cos(angle),
        center[1] + radius * Math.sin(angle),
      ]);
    }
    return points;
  }

  private rectanglePoints(entity: Extract<SketchEntity, { kind: "sketch.rectangle" }>): Point2D[] {
    const rot =
      entity.rotation === undefined
        ? 0
        : expectNumber(entity.rotation, "sketch rect rotation");
    if (entity.mode === "center") {
      const hw = expectNumber(entity.width, "sketch rect width") / 2;
      const hh = expectNumber(entity.height, "sketch rect height") / 2;
      const center = this.point2Numbers(entity.center, "sketch rect center");
      const pts: Point2D[] = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];
      return pts.map((p) => this.rotateTranslate2(p, center, rot));
    }
    const width = expectNumber(entity.width, "sketch rect width");
    const height = expectNumber(entity.height, "sketch rect height");
    const corner = this.point2Numbers(entity.corner, "sketch rect corner");
    const pts: Point2D[] = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ];
    return pts.map((p) => this.rotateTranslate2(p, corner, rot));
  }

  private rotateTranslate2(point: Point2D, origin: Point2D, angle: number): Point2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const p = this.point2Numbers(point, "sketch point");
    const o = this.point2Numbers(origin, "sketch origin");
    const x = p[0] * cos - p[1] * sin + o[0];
    const y = p[0] * sin + p[1] * cos + o[1];
    return [x, y];
  }

  private point2To3(point: Point2D, plane: PlaneBasis): [number, number, number] {
    const p = this.point2Numbers(point, "sketch point");
    return [
      plane.origin[0] + plane.xDir[0] * p[0] + plane.yDir[0] * p[1],
      plane.origin[1] + plane.xDir[1] * p[0] + plane.yDir[1] * p[1],
      plane.origin[2] + plane.xDir[2] * p[0] + plane.yDir[2] * p[1],
    ];
  }

  private point2Numbers(point: Point2D, label: string): [number, number] {
    return [
      expectNumber(point[0], `${label} x`),
      expectNumber(point[1], `${label} y`),
    ];
  }

  private ellipseAxes(
    plane: PlaneBasis,
    radiusX: number,
    radiusY: number,
    rotation: number
  ): { major: number; minor: number; xDir: [number, number, number] } {
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const xDir: [number, number, number] = [
      plane.xDir[0] * cos + plane.yDir[0] * sin,
      plane.xDir[1] * cos + plane.yDir[1] * sin,
      plane.xDir[2] * cos + plane.yDir[2] * sin,
    ];
    const yDir: [number, number, number] = [
      -plane.xDir[0] * sin + plane.yDir[0] * cos,
      -plane.xDir[1] * sin + plane.yDir[1] * cos,
      -plane.xDir[2] * sin + plane.yDir[2] * cos,
    ];
    if (radiusX >= radiusY) {
      return { major: radiusX, minor: radiusY, xDir };
    }
    return { major: radiusY, minor: radiusX, xDir: yDir };
  }

  private makeLineEdge(start: [number, number, number], end: [number, number, number]) {
    const p1 = this.makePnt(start[0], start[1], start[2]);
    const p2 = this.makePnt(end[0], end[1], end[2]);
    const builder = this.newOcct("BRepBuilderAPI_MakeEdge", p1, p2);
    return this.readShape(builder);
  }

  private makeArcEdge(
    start: [number, number, number],
    mid: [number, number, number],
    end: [number, number, number]
  ) {
    const p1 = this.makePnt(start[0], start[1], start[2]);
    const p2 = this.makePnt(mid[0], mid[1], mid[2]);
    const p3 = this.makePnt(end[0], end[1], end[2]);
    try {
      const arc = this.newOcct("GC_MakeArcOfCircle", p1, p2, p3);
      const curveHandle = this.call(arc, "Value");
      const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
      const curveBase = this.newOcct("Handle_Geom_Curve", curve);
      const edgeBuilder = this.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
      return this.readShape(edgeBuilder);
    } catch {
      try {
        const builder = this.newOcct("BRepBuilderAPI_MakeEdge", p1, p2, p3);
        return this.readShape(builder);
      } catch {
        return this.makeLineEdge(start, end);
      }
    }
  }

  private makeCircleEdge(
    center: [number, number, number],
    radius: number,
    normal: [number, number, number]
  ) {
    const pnt = this.makePnt(center[0], center[1], center[2]);
    const dir = this.makeDir(normal[0], normal[1], normal[2]);
    const ax2 = this.makeAx2(pnt, dir);
    const circ = this.makeCirc(ax2, radius);
    const builder = this.newOcct("BRepBuilderAPI_MakeEdge", circ);
    return this.readShape(builder);
  }

  private makeEllipseEdge(
    center: [number, number, number],
    xDir: [number, number, number],
    normal: [number, number, number],
    major: number,
    minor: number
  ) {
    const pnt = this.makePnt(center[0], center[1], center[2]);
    const dir = this.makeDir(normal[0], normal[1], normal[2]);
    const xAxis = this.makeDir(xDir[0], xDir[1], xDir[2]);
    const ax2 = this.makeAx2WithXDir(pnt, dir, xAxis);
    const elips = this.newOcct("gp_Elips", ax2, major, minor);
    const builder = this.newOcct("BRepBuilderAPI_MakeEdge", elips);
    return this.readShape(builder);
  }

  private makeSplineEdge(
    entity: Extract<SketchEntity, { kind: "sketch.spline" }>,
    plane: PlaneBasis
  ): { edge: any; start: [number, number, number]; end: [number, number, number]; closed: boolean } {
    const rawPoints = entity.points;
    if (rawPoints.length < 2) {
      throw new Error("OCCT backend: sketch spline must have at least 2 points");
    }
    const points = rawPoints.slice();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) {
      throw new Error("OCCT backend: sketch spline points missing");
    }
    const start2 = this.point2Numbers(first, "sketch spline start");
    const end2 = this.point2Numbers(last, "sketch spline end");
    const start = this.point2To3([start2[0], start2[1]], plane);
    const end = this.point2To3([end2[0], end2[1]], plane);
    const isClosed =
      entity.closed === true || this.pointsClose(start, end);
    if (isClosed && points.length > 2) {
      const dx = Math.abs(start2[0] - end2[0]);
      const dy = Math.abs(start2[1] - end2[1]);
      if (dx > 1e-6 || dy > 1e-6) {
        points.push(first);
      }
    }
    const arr = this.newOcct("TColgp_Array1OfPnt", 1, points.length);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) {
        throw new Error("OCCT backend: sketch spline point missing");
      }
      const p2 = this.point2Numbers(point, "sketch spline point");
      const p3 = this.point2To3([p2[0], p2[1]], plane);
      arr.SetValue(i + 1, this.makePnt(p3[0], p3[1], p3[2]));
    }
    const degree =
      entity.degree === undefined
        ? 3
        : Math.round(expectNumber(entity.degree, "sketch spline degree"));
    const deg = Math.max(1, Math.min(8, degree));
    const continuity = (this.occt as any).GeomAbs_Shape?.GeomAbs_C2;
    const tol = 1e-6;
    const bspline = this.newOcct(
      "GeomAPI_PointsToBSpline",
      arr,
      deg,
      deg,
      continuity ?? 0,
      tol
    );
    const curveHandle = this.call(bspline, "Curve");
    const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
    const curveBase = this.newOcct("Handle_Geom_Curve", curve);
    const edgeBuilder = this.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
    const edge = this.readShape(edgeBuilder);
    return { edge, start, end, closed: isClosed };
  }

  private makeSplineEdge3D(path: Extract<Path3D, { kind: "path.spline" }>): {
    edge: any;
    start: [number, number, number];
    end: [number, number, number];
    closed: boolean;
  } {
    const rawPoints = path.points;
    if (rawPoints.length < 2) {
      throw new Error("OCCT backend: path spline must have at least 2 points");
    }
    const points = rawPoints.slice();
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) {
      throw new Error("OCCT backend: path spline points missing");
    }
    const start = this.point3Numbers(first, "path spline start");
    const end = this.point3Numbers(last, "path spline end");
    const isClosed = path.closed === true || this.pointsClose(start, end);
    if (isClosed && points.length > 2) {
      const dx = Math.abs(start[0] - end[0]);
      const dy = Math.abs(start[1] - end[1]);
      const dz = Math.abs(start[2] - end[2]);
      if (dx > 1e-6 || dy > 1e-6 || dz > 1e-6) {
        points.push(first);
      }
    }
    const arr = this.newOcct("TColgp_Array1OfPnt", 1, points.length);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      if (!point) {
        throw new Error("OCCT backend: path spline point missing");
      }
      const p3 = this.point3Numbers(point, "path spline point");
      arr.SetValue(i + 1, this.makePnt(p3[0], p3[1], p3[2]));
    }
    const degree =
      path.degree === undefined
        ? 3
        : Math.round(expectNumber(path.degree, "path spline degree"));
    const deg = Math.max(1, Math.min(8, degree));
    const continuity = (this.occt as any).GeomAbs_Shape?.GeomAbs_C2;
    const tol = 1e-6;
    const bspline = this.newOcct(
      "GeomAPI_PointsToBSpline",
      arr,
      deg,
      deg,
      continuity ?? 0,
      tol
    );
    const curveHandle = this.call(bspline, "Curve");
    const curve = curveHandle?.get ? curveHandle.get() : curveHandle;
    const curveBase = this.newOcct("Handle_Geom_Curve", curve);
    const edgeBuilder = this.newOcct("BRepBuilderAPI_MakeEdge", curveBase);
    const edge = this.readShape(edgeBuilder);
    return { edge, start, end, closed: isClosed };
  }

  private makeFaceFromWire(wire: any) {
    try {
      return this.newOcct("BRepBuilderAPI_MakeFace", wire, true);
    } catch {
      return this.newOcct("BRepBuilderAPI_MakeFace", wire);
    }
  }

  private readFace(builder: any) {
    if (builder.Face) return builder.Face();
    if (builder.face) return builder.face();
    return this.readShape(builder);
  }

  private addWireEdge(builder: any, edge: any): boolean {
    const edgeHandle = this.toEdge(edge);
    const candidates = ["Add", "Add_1", "Add_2", "add"];
    for (const name of candidates) {
      const fn = builder?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(builder, edgeHandle);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  private assertClosedLoop(segments: EdgeSegment[]) {
    this.checkLoopContinuity(segments, false);
  }

  private checkLoopContinuity(
    segments: EdgeSegment[],
    allowOpen: boolean
  ): boolean {
    if (segments.length === 0) {
      throw new Error("OCCT backend: sketch loop must have at least one segment");
    }
    if (segments.length === 1 && segments[0]?.closed) {
      return true;
    }
    if (segments.some((segment) => segment.closed)) {
      throw new Error("OCCT backend: closed sketch segment must be alone in loop");
    }
    for (let i = 0; i < segments.length - 1; i += 1) {
      const current = segments[i];
      const next = segments[i + 1];
      if (!current || !next) continue;
      if (!this.pointsClose(current.end, next.start)) {
        throw new Error("OCCT backend: sketch loop is not contiguous");
      }
    }
    const first = segments[0];
    const last = segments[segments.length - 1];
    const closed = !!first && !!last && this.pointsClose(last.end, first.start);
    if (!allowOpen && !closed) {
      throw new Error("OCCT backend: sketch loop is not closed");
    }
    return closed;
  }

  private pointsClose(
    a: [number, number, number],
    b: [number, number, number],
    tol = 1e-6
  ): boolean {
    return (
      Math.abs(a[0] - b[0]) <= tol &&
      Math.abs(a[1] - b[1]) <= tol &&
      Math.abs(a[2] - b[2]) <= tol
    );
  }

  private dist2(a: Point2D, b: Point2D): number {
    const aNum = this.point2Numbers(a, "sketch point");
    const bNum = this.point2Numbers(b, "sketch point");
    const dx = aNum[0] - bNum[0];
    const dy = aNum[1] - bNum[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  private arcMidpoint(
    start: Point2D,
    end: Point2D,
    center: Point2D,
    direction: "cw" | "ccw"
  ): Point2D {
    const s = this.point2Numbers(start, "sketch arc start");
    const e = this.point2Numbers(end, "sketch arc end");
    const c = this.point2Numbers(center, "sketch arc center");
    const startAngle = Math.atan2(s[1] - c[1], s[0] - c[0]);
    const endAngle = Math.atan2(e[1] - c[1], e[0] - c[0]);
    let sweep = endAngle - startAngle;
    if (direction === "ccw") {
      if (sweep <= 0) sweep += Math.PI * 2;
    } else {
      if (sweep >= 0) sweep -= Math.PI * 2;
    }
    const midAngle = startAngle + sweep / 2;
    const radius = this.dist2(start, center);
    return [
      c[0] + radius * Math.cos(midAngle),
      c[1] + radius * Math.sin(midAngle),
    ];
  }

  private makeRectangleWire(width: number, height: number, center?: Point3D) {
    const [cx, cy, cz] = center
      ? this.point3Numbers(center, "profile center")
      : [0, 0, 0];
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
    if (!wire) {
      throw new Error("OCCT backend: rectangle wire builder missing Wire()");
    }
    return wire;
  }

  private makeRectangleFace(width: number, height: number, center?: Point3D) {
    const wire = this.makeRectangleWire(width, height, center);
    const face = new (this.occt as any).BRepBuilderAPI_MakeFace_15(wire, true);
    return face.Face();
  }

  private makeCircleWire(radius: number, center?: Point3D) {
    const [cx, cy, cz] = center
      ? this.point3Numbers(center, "profile center")
      : [0, 0, 0];
    const pnt = this.makePnt(cx, cy, cz);
    const dir = this.makeDir(0, 0, 1);
    const ax2 = this.makeAx2(pnt, dir);
    const circle = this.makeCirc(ax2, radius);
    const edge = new (this.occt as any).BRepBuilderAPI_MakeEdge_8(circle);
    const wireBuilder = new (this.occt as any).BRepBuilderAPI_MakeWire_2(edge.Edge());
    const wire = typeof wireBuilder.Wire === "function" ? wireBuilder.Wire() : wireBuilder.wire?.();
    if (!wire) {
      throw new Error("OCCT backend: circle wire builder missing Wire()");
    }
    return wire;
  }

  private makeCircleFace(radius: number, center?: Point3D) {
    const wire = this.makeCircleWire(radius, center);
    const face = new (this.occt as any).BRepBuilderAPI_MakeFace_15(wire, true);
    return face.Face();
  }

  private makeRegularPolygonWire(
    sides: number,
    radius: number,
    center?: Point3D,
    rotation?: number
  ) {
    const count = Math.round(sides);
    if (count < 3) {
      throw new Error("OCCT backend: polygon profile must have at least 3 sides");
    }
    const rot =
      rotation === undefined ? 0 : expectNumber(rotation, "profile rotation");
    const centerVec: [number, number, number] = center
      ? this.point3Numbers(center, "profile center")
      : [0, 0, 0];
    const points = this.regularPolygonPoints(
      centerVec,
      [1, 0, 0],
      [0, 1, 0],
      radius,
      count,
      rot
    );
    return this.makePolygonWire(points);
  }

  private makeRegularPolygonFace(
    sides: number,
    radius: number,
    center?: Point3D,
    rotation?: number
  ) {
    const wire = this.makeRegularPolygonWire(sides, radius, center, rotation);
    const face = new (this.occt as any).BRepBuilderAPI_MakeFace_15(wire, true);
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

  private makeXY(x: number, y: number) {
    return this.newOcct("gp_XY", x, y);
  }

  private makePnt2d(x: number, y: number) {
    try {
      return this.newOcct("gp_Pnt2d", x, y);
    } catch {
      const xy = this.makeXY(x, y);
      return this.newOcct("gp_Pnt2d", xy);
    }
  }

  private makeDir2d(x: number, y: number) {
    try {
      return this.newOcct("gp_Dir2d", x, y);
    } catch {
      const xy = this.makeXY(x, y);
      return this.newOcct("gp_Dir2d", xy);
    }
  }

  private makeAx2(pnt: any, dir: any) {
    const occt = this.occt as any;
    if (occt.gp_Ax2_3) return new occt.gp_Ax2_3(pnt, dir);
    throw new Error("OCCT backend: gp_Ax2_3 constructor not available");
  }

  private makeAx2WithXDir(pnt: any, dir: any, xDir: any) {
    const occt = this.occt as any;
    if (occt.gp_Ax2_2) return new occt.gp_Ax2_2(pnt, dir, xDir);
    return this.makeAx2(pnt, dir);
  }

  private makeAx1(pnt: any, dir: any) {
    const occt = this.occt as any;
    if (occt.gp_Ax1_2) return new occt.gp_Ax1_2(pnt, dir);
    if (occt.gp_Ax1_3) return new occt.gp_Ax1_3(pnt, dir);
    throw new Error("OCCT backend: gp_Ax1 constructor not available");
  }

  private makePln(origin: [number, number, number], normal: [number, number, number]) {
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(normal[0], normal[1], normal[2]);
    return this.newOcct("gp_Pln", pnt, dir);
  }

  private transformShapeTranslate(shape: any, delta: [number, number, number]) {
    const trsf = this.newOcct("gp_Trsf");
    const vec = this.makeVec(delta[0], delta[1], delta[2]);
    this.callWithFallback(
      trsf,
      ["SetTranslation", "SetTranslation_1", "SetTranslationPart"],
      [[vec]]
    );
    const builder = this.newOcct("BRepBuilderAPI_Transform", shape, trsf, true);
    this.tryBuild(builder);
    return this.readShape(builder);
  }

  private transformShapeRotate(
    shape: any,
    origin: [number, number, number],
    axis: [number, number, number],
    angle: number
  ) {
    const trsf = this.newOcct("gp_Trsf");
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    const dir = this.makeDir(axis[0], axis[1], axis[2]);
    const ax1 = this.makeAx1(pnt, dir);
    this.callWithFallback(trsf, ["SetRotation", "SetRotation_1"], [[ax1, angle]]);
    const builder = this.newOcct("BRepBuilderAPI_Transform", shape, trsf, true);
    this.tryBuild(builder);
    return this.readShape(builder);
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

  private makeCylindricalSurface(
    ax2: any,
    radius: number,
    pnt?: any,
    dir?: any,
    xDir?: any
  ) {
    try {
      return this.newOcct("Geom_CylindricalSurface", ax2, radius);
    } catch {
      // fall through
    }
    if (pnt && dir && xDir) {
      try {
        const ax3 = this.newOcct("gp_Ax3", pnt, dir, xDir);
        return this.newOcct("Geom_CylindricalSurface", ax3, radius);
      } catch {
        // fall through
      }
    }
    if (pnt && dir) {
      try {
        const ax3 = this.newOcct("gp_Ax3", pnt, dir);
        return this.newOcct("Geom_CylindricalSurface", ax3, radius);
      } catch {
        // fall through
      }
    }
    throw new Error("OCCT backend: failed to construct cylindrical surface");
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

  private configureStepExport(occt: any, opts: StepExportOptions): void {
    const setCVal = occt.Interface_Static_SetCVal ?? occt.Interface_Static?.SetCVal;
    const setIVal = occt.Interface_Static_SetIVal ?? occt.Interface_Static?.SetIVal;
    const setRVal = occt.Interface_Static_SetRVal ?? occt.Interface_Static?.SetRVal;
    if (opts.schema && typeof setCVal === "function") {
      setCVal("write.step.schema", opts.schema);
    }
    if (opts.unit && typeof setCVal === "function") {
      setCVal("write.step.unit", this.stepUnitToken(opts.unit));
    }
    if (typeof opts.precision === "number" && Number.isFinite(opts.precision)) {
      if (typeof setIVal === "function") setIVal("write.step.precision.mode", 1);
      if (typeof setRVal === "function") setRVal("write.step.precision.val", opts.precision);
    }
  }

  private resolveStepModelType(occt: any, kind: KernelObject["kind"]): number {
    const types = occt?.STEPControl_StepModelType;
    if (!types) return 0;
    if (kind === "solid") {
      return (
        types.STEPControl_ManifoldSolidBrep ??
        types.STEPControl_AsIs ??
        0
      );
    }
    return types.STEPControl_AsIs ?? 0;
  }

  private assertStepStatus(occt: any, status: unknown, label: string): void {
    if (typeof status === "boolean") {
      if (!status) throw new Error(`OCCT backend: ${label} failed`);
      return;
    }
    if (typeof status === "number") {
      const retDone = occt.IFSelect_ReturnStatus?.IFSelect_RetDone;
      if (typeof retDone === "number" && status !== retDone) {
        throw new Error(`OCCT backend: ${label} failed (status ${status})`);
      }
    }
  }

  private callWithFallback(
    target: any,
    names: string[],
    argsList: unknown[][]
  ): unknown {
    let sawFunction = false;
    let lastError: unknown = null;
    for (const name of names) {
      const fn = target?.[name];
      if (typeof fn !== "function") continue;
      sawFunction = true;
      for (const args of argsList) {
        try {
          return fn.call(target, ...args);
        } catch (err) {
          lastError = err;
          continue;
        }
      }
    }
    if (sawFunction && lastError) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`OCCT backend: ${names.join(" or ")} failed: ${msg}`);
    }
    throw new Error(`OCCT backend: missing ${names.join(" or ")}()`);
  }

  private makeStepPath(fs: any): string {
    const dir = "/tmp";
    if (typeof fs?.mkdir === "function") {
      try {
        fs.mkdir(dir);
      } catch {
        // ignore if it already exists
      }
    }
    const rand = Math.random().toString(36).slice(2);
    return `${dir}/trueform-${Date.now()}-${rand}.step`;
  }

  private makeStlPath(fs: any): string {
    const dir = "/tmp";
    if (typeof fs?.mkdir === "function") {
      try {
        fs.mkdir(dir);
      } catch {
        // ignore if it already exists
      }
    }
    const rand = Math.random().toString(36).slice(2);
    return `${dir}/trueform-${Date.now()}-${rand}.stl`;
  }

  private stepUnitToken(unit: StepExportOptions["unit"]): string {
    switch (unit) {
      case "mm":
        return "MM";
      case "cm":
        return "CM";
      case "m":
        return "M";
      case "in":
        return "INCH";
      default:
        return "MM";
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

  private faceOrientationValue(face: any): number | null {
    const candidates = ["Orientation", "Orientation_1", "Orientation_2", "Orientation_3"];
    for (const name of candidates) {
      const fn = face?.[name];
      if (typeof fn !== "function") continue;
      try {
        const value = fn.call(face);
        if (typeof value === "number") return value;
        if (value && typeof value.value === "number") return value.value;
      } catch {
        continue;
      }
    }
    return null;
  }

  private sewShapeFaces(shape: any, tolerance = 1e-6): any | null {
    const occt = this.occt as any;
    let sewing: any;
    try {
      sewing = this.newOcct("BRepBuilderAPI_Sewing", tolerance, true, true, true, false);
    } catch {
      return null;
    }
    const add =
      typeof sewing.Add_1 === "function"
        ? sewing.Add_1.bind(sewing)
        : typeof sewing.Add === "function"
          ? sewing.Add.bind(sewing)
          : null;
    if (!add) return null;

    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    let sawFace = false;
    for (; explorer.More(); explorer.Next()) {
      sawFace = true;
      add(explorer.Current());
    }
    if (!sawFace) return null;

    const progress = this.makeProgressRange();
    try {
      sewing.Perform(progress);
    } catch {
      try {
        sewing.Perform();
      } catch {
        return null;
      }
    }
    try {
      return this.callWithFallback(sewing, ["SewedShape", "SewedShape_1"], [[]]);
    } catch {
      return null;
    }
  }

  private edgeContinuityValue(edge: any, faceA: any, faceB: any): number | null {
    const occt = this.occt as any;
    const tool = occt.BRep_Tool;
    if (!tool) return null;
    const edgeHandle = this.toEdge(edge);
    const face1 = this.toFace(faceA);
    const face2 = this.toFace(faceB);
    const candidates = ["Continuity_1", "Continuity"];
    for (const name of candidates) {
      const fn = tool?.[name];
      if (typeof fn !== "function") continue;
      try {
        const value = fn.call(tool, edgeHandle, face1, face2);
        if (typeof value === "number") return value;
        if (value && typeof value.value === "number") return value.value;
      } catch {
        continue;
      }
    }
    return null;
  }

  private shapeHash(shape: any, upper = 2147483647): number {
    if (shape && typeof shape.HashCode === "function") {
      try {
        const value = shape.HashCode(upper);
        if (typeof value === "number") return value;
      } catch {
        // ignore hash errors
      }
    }
    return 0;
  }

  private shapesSame(a: any, b: any): boolean {
    if (a === b) return true;
    if (a && typeof a.IsSame === "function") {
      try {
        return !!a.IsSame(b);
      } catch {
        // fall through
      }
    }
    if (a && typeof a.IsEqual === "function") {
      try {
        return !!a.IsEqual(b);
      } catch {
        // fall through
      }
    }
    return false;
  }

  private buildEdgeAdjacency(
    shape: any
  ): Map<number, Array<{ edge: any; faces: any[] }>> | null {
    const occt = this.occt as any;
    if (!occt.TopExp_Explorer_1) return null;
    const adjacency = new Map<number, Array<{ edge: any; faces: any[] }>>();
    const faceExplorer = new occt.TopExp_Explorer_1();
    faceExplorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; faceExplorer.More(); faceExplorer.Next()) {
      const face = faceExplorer.Current();
      const faceHandle = this.toFace(face);
      const edgeExplorer = new occt.TopExp_Explorer_1();
      edgeExplorer.Init(
        face,
        occt.TopAbs_ShapeEnum.TopAbs_EDGE,
        occt.TopAbs_ShapeEnum.TopAbs_SHAPE
      );
      for (; edgeExplorer.More(); edgeExplorer.Next()) {
        const edge = this.toEdge(edgeExplorer.Current());
        const hash = this.shapeHash(edge);
        const bucket = adjacency.get(hash) ?? [];
        let entry = bucket.find((item) => this.shapesSame(item.edge, edge));
        if (!entry) {
          entry = { edge, faces: [] };
          bucket.push(entry);
        }
        if (!entry.faces.some((f) => this.shapesSame(f, faceHandle))) {
          entry.faces.push(faceHandle);
        }
        if (!adjacency.has(hash)) adjacency.set(hash, bucket);
      }
    }
    return adjacency;
  }

  private adjacentFaces(
    adjacency: Map<number, Array<{ edge: any; faces: any[] }>> | null,
    edge: any
  ): any[] {
    if (!adjacency) return [];
    const hash = this.shapeHash(edge);
    const bucket = adjacency.get(hash);
    if (!bucket) return [];
    for (const entry of bucket) {
      if (this.shapesSame(entry.edge, edge)) {
        return entry.faces;
      }
    }
    return [];
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

  private buildEdgeLines(
    shape: any,
    opts: MeshOptions
  ): { positions: number[]; edgeIndices: number[] } {
    const occt = this.occt as any;
    const adjacency = this.buildEdgeAdjacency(shape);
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_EDGE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    const positions: number[] = [];
    const edgeIndices: number[] = [];
    let edgeIndex = 0;
    for (; explorer.More(); explorer.Next()) {
      const edgeShape = explorer.Current();
      const edge = this.toEdge(edgeShape);
      const faces = this.adjacentFaces(adjacency, edge);
      if (faces.length > 0 && faces.length < 2) {
        edgeIndex += 1;
        continue;
      }
      if (faces.length >= 2) {
        const continuity = this.edgeContinuityValue(edge, faces[0], faces[1]);
        if (!opts.includeTangentEdges && continuity !== null && continuity > 0) {
          edgeIndex += 1;
          continue;
        }
      }
      const points = this.sampleEdgePoints(edge, opts);
      if (points.length < 2) {
        edgeIndex += 1;
        continue;
      }
      for (let i = 0; i + 1 < points.length; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        edgeIndices.push(edgeIndex);
      }
      edgeIndex += 1;
    }
    return { positions, edgeIndices };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function cross(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vecLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalizeVector(vec: [number, number, number]): [number, number, number] {
  const [x, y, z] = vec;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [x / len, y / len, z / len];
}

function isFiniteVec(vec: [number, number, number]): boolean {
  return vecLength(vec) > 0 && vec.every((v) => Number.isFinite(v));
}

function rotateAroundAxis(
  vec: [number, number, number],
  axis: [number, number, number],
  angle: number
): [number, number, number] {
  const n = normalizeVector(axis);
  if (!isFiniteVec(n)) return vec;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const crossTerm = cross(n, vec);
  const dotTerm = dot(n, vec);
  return [
    vec[0] * cos + crossTerm[0] * sin + n[0] * dotTerm * (1 - cos),
    vec[1] * cos + crossTerm[1] * sin + n[1] * dotTerm * (1 - cos),
    vec[2] * cos + crossTerm[2] * sin + n[2] * dotTerm * (1 - cos),
  ];
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
