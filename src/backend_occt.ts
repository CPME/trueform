import {
  Backend,
  BackendCapabilities,
  ExecuteInput,
  KernelResult,
  KernelObject,
  KernelSelection,
  KernelSelectionLineage,
  KernelSelectionRecord,
  MeshData,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
} from "./backend.js";
import { resolveSelectorSet } from "./selectors.js";
import { BackendError } from "./errors.js";
import { TF_STAGED_FEATURES } from "./feature_staging.js";
import { hashValue } from "./hash.js";
import { tryDynamicMethod } from "./occt/dynamic_call.js";
import {
  executeEdgeModifier,
  type EdgeModifierDeps,
} from "./occt/edge_modifiers.js";
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
  Chamfer,
  VariableFillet,
  Hole,
  Loft,
  Sweep,
  Shell,
  Pipe,
  PipeSweep,
  Rib,
  Plane,
  HexTubeSweep,
  PlaneRef,
  Path3D,
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
  Web,
  Mirror,
  DeleteFace,
  ReplaceFace,
  MoveFace,
  MoveBody,
  SplitBody,
  SplitFace,
  Draft,
  Thicken,
  Unwrap,
  Thread,
  VariableChamfer,
  HoleEndCondition,
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
  planeNormal?: [number, number, number];
  wireSegmentSlots?: string[];
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
  sourceSlot?: string;
};

type FaceSurfaceClass =
  | "plane"
  | "cylinder"
  | "cone"
  | "sphere"
  | "torus"
  | "bspline"
  | "bezier"
  | "extrusion"
  | "revolution"
  | "offset"
  | "other"
  | "unknown";

type FaceSurfaceMap = Map<number, Array<{ face: any; surface: FaceSurfaceClass }>>;

type CollectedSubshape = {
  shape: any;
  meta: Record<string, unknown>;
  ledger?: SelectionLedgerHint;
};

type SelectionLedgerHint = {
  slot?: string;
  role?: string;
  lineage?: KernelSelectionLineage;
  aliases?: string[];
};

type SelectionLedgerPlan = {
  solid?: SelectionLedgerHint;
  faces?: (entries: CollectedSubshape[]) => void;
  edges?: (entries: CollectedSubshape[]) => void;
};

type SelectionCollectionOptions = {
  rootKind?: "solid" | "face";
  ledgerPlan?: SelectionLedgerPlan;
};

type SelectionIdAssignment = {
  id: string;
  aliases?: string[];
  record: KernelSelectionRecord;
};

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

export class OcctBackend implements Backend {
  private occt: OcctModule;

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
        "feature.rib",
        "feature.web",
        "feature.shell",
        "feature.pipe",
        "feature.pipeSweep",
        "feature.hexTubeSweep",
        "feature.mirror",
        "feature.delete.face",
        "feature.replace.face",
        "feature.move.face",
        "feature.move.body",
        "feature.split.body",
        "feature.split.face",
        "feature.draft",
        "feature.thicken",
        "feature.unwrap",
        "feature.thread",
        "feature.hole",
        "feature.fillet",
        "feature.fillet.variable",
        "feature.chamfer",
        "feature.chamfer.variable",
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
      case "feature.rib":
        return this.execRib(input.feature as Rib, input.upstream);
      case "feature.web":
        return this.execWeb(input.feature as Web, input.upstream);
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
      case "feature.delete.face":
        return this.execDeleteFace(
          input.feature as DeleteFace,
          input.upstream
        );
      case "feature.replace.face":
        return this.execReplaceFace(
          input.feature as ReplaceFace,
          input.upstream
        );
      case "feature.move.face":
        return this.execMoveFace(
          input.feature as MoveFace,
          input.upstream
        );
      case "feature.move.body":
        return this.execMoveBody(
          input.feature as MoveBody,
          input.upstream
        );
      case "feature.split.body":
        return this.execSplitBody(
          input.feature as SplitBody,
          input.upstream
        );
      case "feature.split.face":
        return this.execSplitFace(
          input.feature as SplitFace,
          input.upstream
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
      case "feature.unwrap":
        return this.execUnwrap(
          input.feature as Unwrap,
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
      case "feature.fillet.variable":
        return this.execVariableFillet(
          input.feature as VariableFillet,
          input.upstream
        );
      case "feature.chamfer":
        return this.execChamfer(
          input.feature as any,
          input.upstream,
          input.resolve
        );
      case "feature.chamfer.variable":
        return this.execVariableChamfer(
          input.feature as VariableChamfer,
          input.upstream
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

    const face = this.buildProfileFace(profile);
    const prism = this.makePrism(face, this.makeVec(vec[0], vec[1], vec[2]));
    const solid = this.readShape(prism);
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
      feature.tags,
      {
        ledgerPlan: this.makePrismSelectionLedgerPlan(axis, {
          prism,
          wire: profile.wire,
          wireSegmentSlots: profile.wireSegmentSlots,
        }),
      }
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
        {
          rootKind: "face",
          ledgerPlan:
            profile.wire && profile.wireSegmentSlots
              ? this.makeRevolveSelectionLedgerPlan(angleRad, {
                  revol,
                  wire: profile.wire,
                  wireSegmentSlots: profile.wireSegmentSlots,
                })
              : undefined,
        }
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
      feature.tags,
      {
        ledgerPlan:
          profile.wire && profile.wireSegmentSlots
            ? this.makeRevolveSelectionLedgerPlan(angleRad, {
                revol,
                wire: profile.wire,
                wireSegmentSlots: profile.wireSegmentSlots,
              })
            : undefined,
      }
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

  private execRib(feature: Rib, upstream: KernelResult): KernelResult {
    return this.execThinProfileFeature("rib", feature, upstream);
  }

  private execWeb(feature: Web, upstream: KernelResult): KernelResult {
    return this.execThinProfileFeature("web", feature, upstream);
  }

  private execThinProfileFeature(
    kind: "rib" | "web",
    feature: Rib | Web,
    upstream: KernelResult
  ): KernelResult {
    const profile = this.resolveProfile(feature.profile, upstream);
    if (profile.profile.kind !== "profile.sketch") {
      throw new Error(`OCCT backend: ${kind} requires a profile.sketch reference`);
    }
    if (profile.profile.open !== true) {
      throw new Error(`OCCT backend: ${kind} requires an open sketch profile`);
    }
    const { wire, closed } = this.buildProfileWire(profile);
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

    const axis = this.resolveExtrudeAxis(
      feature.axis ?? ({ kind: "axis.sketch.normal" } as ExtrudeAxis),
      profile,
      upstream
    );
    const side = feature.side ?? "symmetric";
    const occt = this.occt as any;
    const edgeExplorer = new occt.TopExp_Explorer_1();
    edgeExplorer.Init(
      wire,
      occt.TopAbs_ShapeEnum.TopAbs_EDGE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const edges: any[] = [];
    for (; edgeExplorer.More(); edgeExplorer.Next()) {
      edges.push(this.toEdge(edgeExplorer.Current()));
    }
    if (edges.length !== 1) {
      throw new Error(
        `OCCT backend: ${kind} currently supports a single sketch line segment profile`
      );
    }
    const endpoints = this.edgeEndpoints(edges[0]);
    if (!endpoints) {
      throw new Error(`OCCT backend: ${kind} profile edge has invalid endpoints`);
    }
    const lineDir = normalizeVector(this.subVec(endpoints.end, endpoints.start));
    if (!isFiniteVec(lineDir)) {
      throw new Error(`OCCT backend: ${kind} profile edge is degenerate`);
    }
    const offsetDir = normalizeVector(cross(lineDir, axis));
    if (!isFiniteVec(offsetDir)) {
      throw new Error(`OCCT backend: ${kind} axis cannot be parallel to profile line`);
    }
    const low = side === "symmetric" ? -thickness / 2 : 0;
    const high = side === "symmetric" ? thickness / 2 : thickness;
    const p0 = this.addVec(endpoints.start, this.scaleVec(offsetDir, low));
    const p1 = this.addVec(endpoints.end, this.scaleVec(offsetDir, low));
    const p2 = this.addVec(endpoints.end, this.scaleVec(offsetDir, high));
    const p3 = this.addVec(endpoints.start, this.scaleVec(offsetDir, high));
    const section = this.makePolygonWire([p0, p1, p2, p3]);
    const sectionFace = this.readShape(this.makeFaceFromWire(section));
    const sectionCenter: [number, number, number] = [
      (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
      (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
      (p0[2] + p1[2] + p2[2] + p3[2]) / 4,
    ];
    const span = this.resolveThinFeatureAxisSpan(axis, sectionCenter, depth, upstream);
    if (!span) {
      throw new Error(
        `OCCT backend: ${kind} requires upstream support solids to bound depth`
      );
    }
    const spanDepth = span.high - span.low;
    if (!(spanDepth > 1e-6)) {
      throw new Error(`OCCT backend: ${kind} depth range collapsed`);
    }
    const sectionStart =
      Math.abs(span.low) > 1e-9
        ? this.transformShapeTranslate(sectionFace, this.scaleVec(axis, span.low))
        : sectionFace;
    let solid = this.readShape(
      this.makePrism(
        sectionStart,
        this.makeVec(axis[0] * spanDepth, axis[1] * spanDepth, axis[2] * spanDepth)
      )
    );
    solid = this.normalizeSolid(solid);
    if (!this.shapeHasSolid(solid)) {
      const stitched = this.makeSolidFromShells(solid);
      if (stitched) {
        solid = this.normalizeSolid(stitched);
      }
    }

    if (!this.shapeHasSolid(solid) || !this.isValidShape(solid)) {
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
    const selections = this.collectSelections(
      solid,
      feature.id,
      feature.result,
      feature.tags
    );
    return { outputs, selections };
  }

  private resolveThinFeatureAxisSpan(
    axis: [number, number, number],
    origin: [number, number, number],
    requestedDepth: number,
    upstream: KernelResult
  ): { low: number; high: number } | null {
    const start = dot(origin, axis);
    const eps = 1e-6;

    let clampedPos: number | null = null;
    let clampedNeg: number | null = null;
    let foundSupport = false;

    for (const output of upstream.outputs.values()) {
      if (output.kind !== "solid") continue;
      const shape = output.meta["shape"];
      if (!shape) continue;
      const extents = this.axisBounds(axis, this.shapeBounds(shape));
      if (!extents) continue;

      if (start < extents.min - eps || start > extents.max + eps) {
        continue;
      }
      foundSupport = true;
      const positive = extents.max - start;
      const negative = start - extents.min;
      if (positive > eps) {
        clampedPos = clampedPos === null ? positive : Math.min(clampedPos, positive);
      }
      if (negative > eps) {
        clampedNeg = clampedNeg === null ? negative : Math.min(clampedNeg, negative);
      }
    }

    if (!foundSupport) return null;

    const low = clampedNeg === null ? 0 : -Math.min(requestedDepth, clampedNeg);
    const high = clampedPos === null ? requestedDepth : Math.min(requestedDepth, clampedPos);
    if (!(high - low > eps)) return null;
    return { low, high };
  }

  private execPipe(feature: Pipe, _upstream: KernelResult): KernelResult {
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

  private execPipeSweep(feature: PipeSweep, _upstream: KernelResult): KernelResult {
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

    const spine = this.buildPathWire(feature.path);
    const { start, tangent } = this.pathStartTangent(feature.path);
    const axis = normalizeVector(tangent);
    if (!isFiniteVec(axis)) {
      throw new Error("OCCT backend: pipe sweep path tangent is degenerate");
    }
    const plane = this.planeBasisFromNormal(start, axis);
    const mode = feature.mode ?? "solid";
    if (mode === "surface") {
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

    let solid: any;
    try {
      const outerFace = this.makeRingFace(
        plane.origin,
        plane.normal,
        outerRadius,
        0
      );
      const outerShape = this.makePipeSolid(spine, outerFace, plane, {
        makeSolid: true,
      });
      if (innerRadius > 0) {
        const innerFace = this.makeRingFace(
          plane.origin,
          plane.normal,
          innerRadius,
          0
        );
        const innerShape = this.makePipeSolid(spine, innerFace, plane, {
          makeSolid: true,
        });
        const cut = this.makeBoolean("cut", outerShape, innerShape);
        solid = this.readShape(cut);
        solid = this.splitByTools(solid, [outerShape, innerShape]);
      } else {
        solid = outerShape;
      }
    } catch {
      throw new Error(
        "OCCT backend: pipe sweep failed to create solid; increase bend radius or reduce diameter"
      );
    }
    const solidCount = this.countSolids(solid);
    if (solidCount !== 1) {
      throw new Error(
        `OCCT backend: pipe sweep must produce exactly one solid; got ${solidCount}`
      );
    }
    solid = this.normalizeSolid(solid);
    if (!this.isValidShape(solid)) {
      throw new Error(
        "OCCT backend: pipe sweep failed to create solid; increase bend radius or reduce diameter"
      );
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

  private execHexTubeSweep(feature: HexTubeSweep, _upstream: KernelResult): KernelResult {
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
    const selections = this.collectSelections(solid, feature.id, feature.result, feature.tags);
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
      [[ax2]]
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

  private execDeleteFace(
    feature: DeleteFace,
    upstream: KernelResult
  ): KernelResult {
    const source = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (source.length === 0) {
      throw new Error("OCCT backend: delete face source selector matched 0 entities");
    }
    if (source.length !== 1 || source[0]?.kind !== "solid") {
      throw new Error("OCCT backend: delete face source selector must resolve to one solid");
    }
    const sourceSelection = source[0] as KernelSelection;
    const ownerKey = this.resolveOwnerKey(sourceSelection, upstream);
    const ownerShape = this.resolveOwnerShape(sourceSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: delete face source missing owner solid");
    }

    const targets = resolveSelectorSet(
      feature.faces,
      this.toResolutionContext(upstream)
    );
    if (targets.length === 0) {
      throw new Error("OCCT backend: delete face selector matched 0 entities");
    }
    for (const target of targets) {
      if (target.kind !== "face") {
        throw new Error("OCCT backend: delete face selector must resolve to faces");
      }
      const targetOwner =
        typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
      if (targetOwner && targetOwner !== ownerKey) {
        throw new Error("OCCT backend: delete face targets must belong to source solid");
      }
    }

    const removeFaces: any[] = [];
    const seen = new Set<number>();
    for (const target of targets) {
      const faceShape = target.meta["shape"];
      if (!faceShape) continue;
      const hash = this.shapeHash(faceShape);
      if (seen.has(hash)) continue;
      seen.add(hash);
      removeFaces.push(faceShape);
    }
    if (removeFaces.length === 0) {
      throw new Error("OCCT backend: delete face resolved no target faces");
    }

    let result =
      feature.heal === false
        ? this.deleteFacesBySewing(ownerShape, removeFaces)
        : this.deleteFacesWithDefeaturing(ownerShape, removeFaces) ??
          this.deleteFacesBySewing(ownerShape, removeFaces);
    if (!result) {
      throw new Error("OCCT backend: failed to delete faces");
    }

    if (feature.heal !== false) {
      const healed = this.makeSolidFromShells(result);
      if (healed) {
        result = this.normalizeSolid(healed);
      }
    }

    const outputKind: "solid" | "surface" = this.shapeHasSolid(result)
      ? "solid"
      : "surface";
    if (outputKind === "solid" && !this.isValidShape(result)) {
      throw new Error("OCCT backend: delete face produced invalid solid");
    }

    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: result },
        },
      ],
    ]);
    const selections = this.collectSelections(
      result,
      feature.id,
      feature.result,
      feature.tags,
      {
        rootKind: outputKind === "solid" ? "solid" : "face",
        ledgerPlan: this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []),
      }
    );
    return { outputs, selections };
  }

  private execReplaceFace(
    feature: ReplaceFace,
    upstream: KernelResult
  ): KernelResult {
    const source = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (source.length === 0) {
      throw new Error("OCCT backend: replace face source selector matched 0 entities");
    }
    if (source.length !== 1 || source[0]?.kind !== "solid") {
      throw new Error("OCCT backend: replace face source selector must resolve to one solid");
    }
    const sourceSelection = source[0] as KernelSelection;
    const ownerKey = this.resolveOwnerKey(sourceSelection, upstream);
    const ownerShape = this.resolveOwnerShape(sourceSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: replace face source missing owner solid");
    }

    const targets = resolveSelectorSet(
      feature.faces,
      this.toResolutionContext(upstream)
    );
    if (targets.length === 0) {
      throw new Error("OCCT backend: replace face selector matched 0 entities");
    }
    for (const target of targets) {
      if (target.kind !== "face") {
        throw new Error("OCCT backend: replace face selector must resolve to faces");
      }
      const targetOwner =
        typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
      if (targetOwner && targetOwner !== ownerKey) {
        throw new Error("OCCT backend: replace face targets must belong to source solid");
      }
    }
    const replaceFaces = this.uniqueFaceShapes(targets);
    if (replaceFaces.length === 0) {
      throw new Error("OCCT backend: replace face resolved no target faces");
    }

    const tools = resolveSelectorSet(
      feature.tool,
      this.toResolutionContext(upstream)
    );
    if (tools.length === 0) {
      throw new Error("OCCT backend: replace face tool selector matched 0 entities");
    }
    for (const tool of tools) {
      if (tool.kind !== "face" && tool.kind !== "surface") {
        throw new Error("OCCT backend: replace face tool selector must resolve to face/surface");
      }
    }
    const toolFaces = this.collectToolFaces(tools);
    if (toolFaces.length === 0) {
      throw new Error("OCCT backend: replace face tool selector resolved no faces");
    }
    if (toolFaces.length !== 1 && toolFaces.length !== replaceFaces.length) {
      throw new Error(
        "OCCT backend: replace face tool face count must be 1 or match target face count"
      );
    }

    const replacements = replaceFaces.map((face, index) => ({
      from: face,
      to: toolFaces[Math.min(index, toolFaces.length - 1)] as any,
    }));

    let result =
      this.replaceFacesWithReshape(ownerShape, replacements) ??
      this.replaceFacesBySewing(ownerShape, replaceFaces, replacements.map((entry) => entry.to));
    if (!result) {
      throw new Error("OCCT backend: failed to replace faces");
    }

    if (feature.heal !== false) {
      const healed = this.makeSolidFromShells(result);
      if (healed) {
        result = this.normalizeSolid(healed);
      }
    }

    const outputKind: "solid" | "surface" = this.shapeHasSolid(result)
      ? "solid"
      : "surface";
    if (outputKind === "solid" && !this.isValidShape(result)) {
      throw new Error("OCCT backend: replace face produced invalid solid");
    }

    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: result },
        },
      ],
    ]);
    const selections = this.collectSelections(
      result,
      feature.id,
      feature.result,
      feature.tags,
      {
        rootKind: outputKind === "solid" ? "solid" : "face",
        ledgerPlan: this.makeFaceMutationSelectionLedgerPlan(
          upstream,
          ownerShape,
          replacements.map((replacement, index) => ({
            from: targets[Math.min(index, targets.length - 1)] as KernelSelection,
            to: replacement.to,
          }))
        ),
      }
    );
    return { outputs, selections };
  }

  private execMoveFace(
    feature: MoveFace,
    upstream: KernelResult
  ): KernelResult {
    const source = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (source.length === 0) {
      throw new Error("OCCT backend: move face source selector matched 0 entities");
    }
    if (source.length !== 1 || source[0]?.kind !== "solid") {
      throw new Error("OCCT backend: move face source selector must resolve to one solid");
    }
    const sourceSelection = source[0] as KernelSelection;
    const ownerKey = this.resolveOwnerKey(sourceSelection, upstream);
    const ownerShape = this.resolveOwnerShape(sourceSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: move face source missing owner solid");
    }

    const targets = resolveSelectorSet(
      feature.faces,
      this.toResolutionContext(upstream)
    );
    if (targets.length === 0) {
      throw new Error("OCCT backend: move face selector matched 0 entities");
    }
    for (const target of targets) {
      if (target.kind !== "face") {
        throw new Error("OCCT backend: move face selector must resolve to faces");
      }
      const targetOwner =
        typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
      if (targetOwner && targetOwner !== ownerKey) {
        throw new Error("OCCT backend: move face targets must belong to source solid");
      }
    }
    const sourceFaces = this.uniqueFaceShapes(targets);
    if (sourceFaces.length === 0) {
      throw new Error("OCCT backend: move face resolved no target faces");
    }

    const transformOrigin = (() => {
      const origin = feature.origin ?? [0, 0, 0];
      return [
        expectNumber(origin[0], "move face origin[0]"),
        expectNumber(origin[1], "move face origin[1]"),
        expectNumber(origin[2], "move face origin[2]"),
      ] as [number, number, number];
    })();

    const movedFaces = sourceFaces.map((face) => {
      let moved = face;
      if (feature.scale !== undefined) {
        const scale = expectNumber(feature.scale, "move face scale");
        if (!(scale > 0)) {
          throw new Error("OCCT backend: move face scale must be positive");
        }
        moved = this.transformShapeScale(moved, transformOrigin, scale);
      }
      if (feature.rotationAxis !== undefined || feature.rotationAngle !== undefined) {
        if (feature.rotationAxis === undefined || feature.rotationAngle === undefined) {
          throw new Error(
            "OCCT backend: move face rotationAxis and rotationAngle must be provided together"
          );
        }
        const axis = this.resolveAxisSpec(
          feature.rotationAxis,
          upstream,
          "move face rotation axis"
        );
        const angle = expectNumber(feature.rotationAngle, "move face rotationAngle");
        moved = this.transformShapeRotate(moved, transformOrigin, axis, angle);
      }
      if (feature.translation !== undefined) {
        const delta: [number, number, number] = [
          expectNumber(feature.translation[0], "move face translation[0]"),
          expectNumber(feature.translation[1], "move face translation[1]"),
          expectNumber(feature.translation[2], "move face translation[2]"),
        ];
        moved = this.transformShapeTranslate(moved, delta);
      }
      return moved;
    });

    const replacements = sourceFaces.map((face, index) => ({
      from: face,
      to: movedFaces[index] as any,
    }));
    let result =
      this.replaceFacesWithReshape(ownerShape, replacements) ??
      this.replaceFacesBySewing(ownerShape, sourceFaces, movedFaces);
    if (!result) {
      throw new Error("OCCT backend: failed to move faces");
    }

    if (feature.heal !== false) {
      const healed = this.makeSolidFromShells(result);
      if (healed) {
        result = this.normalizeSolid(healed);
      }
    }

    let outputKind: "solid" | "surface" = this.shapeHasSolid(result)
      ? "solid"
      : "surface";
    if (outputKind === "solid" && !this.isValidShape(result)) {
      const fallback = this.replaceFacesBySewing(ownerShape, sourceFaces, movedFaces);
      if (fallback) {
        result = fallback;
        outputKind = this.shapeHasSolid(result) ? "solid" : "surface";
      }
    }
    if (outputKind === "solid" && !this.isValidShape(result)) {
      throw new Error("OCCT backend: move face produced invalid solid");
    }

    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: result },
        },
      ],
    ]);
    const selections = this.collectSelections(
      result,
      feature.id,
      feature.result,
      feature.tags,
      {
        rootKind: outputKind === "solid" ? "solid" : "face",
        ledgerPlan: this.makeFaceMutationSelectionLedgerPlan(
          upstream,
          ownerShape,
          movedFaces.map((movedFace, index) => ({
            from: targets[Math.min(index, targets.length - 1)] as KernelSelection,
            to: movedFace,
          }))
        ),
      }
    );
    return { outputs, selections };
  }

  private execMoveBody(
    feature: MoveBody,
    upstream: KernelResult
  ): KernelResult {
    const sourceSel = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (sourceSel.length === 0) {
      throw new Error("OCCT backend: move body source selector matched 0 entities");
    }
    for (const selection of sourceSel) {
      if (
        selection.kind !== "solid" &&
        selection.kind !== "face" &&
        selection.kind !== "surface"
      ) {
        throw new Error(
          "OCCT backend: move body source selector must resolve to solid/face/surface"
        );
      }
    }
    const ownerKeys = new Set<string>();
    for (const selection of sourceSel) {
      ownerKeys.add(this.resolveOwnerKey(selection as KernelSelection, upstream));
    }
    if (ownerKeys.size !== 1) {
      throw new Error("OCCT backend: move body source selector must resolve to a single owner");
    }
    const ownerShape = this.resolveOwnerShape(sourceSel[0] as KernelSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: move body source missing owner shape");
    }

    const transformOrigin = (() => {
      const origin = feature.origin ?? [0, 0, 0];
      return [
        expectNumber(origin[0], "move body origin[0]"),
        expectNumber(origin[1], "move body origin[1]"),
        expectNumber(origin[2], "move body origin[2]"),
      ] as [number, number, number];
    })();

    let moved = ownerShape;
    if (feature.scale !== undefined) {
      const scale = expectNumber(feature.scale, "move body scale");
      if (!(scale > 0)) {
        throw new Error("OCCT backend: move body scale must be positive");
      }
      moved = this.transformShapeScale(moved, transformOrigin, scale);
    }
    if (feature.rotationAxis !== undefined || feature.rotationAngle !== undefined) {
      if (feature.rotationAxis === undefined || feature.rotationAngle === undefined) {
        throw new Error(
          "OCCT backend: move body rotationAxis and rotationAngle must be provided together"
        );
      }
      const axis = this.resolveAxisSpec(
        feature.rotationAxis,
        upstream,
        "move body rotation axis"
      );
      const angle = expectNumber(feature.rotationAngle, "move body rotationAngle");
      moved = this.transformShapeRotate(moved, transformOrigin, axis, angle);
    }
    if (feature.translation !== undefined) {
      const delta: [number, number, number] = [
        expectNumber(feature.translation[0], "move body translation[0]"),
        expectNumber(feature.translation[1], "move body translation[1]"),
        expectNumber(feature.translation[2], "move body translation[2]"),
      ];
      moved = this.transformShapeTranslate(moved, delta);
    }

    const outputKind: "solid" | "face" | "surface" = this.shapeHasSolid(moved)
      ? "solid"
      : sourceSel.some((selection) => selection.kind === "surface")
        ? "surface"
        : "face";
    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: moved },
        },
      ],
    ]);
    const selections = this.collectSelections(
      moved,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: outputKind === "solid" ? "solid" : "face" }
    );
    return { outputs, selections };
  }

  private execSplitBody(
    feature: SplitBody,
    upstream: KernelResult
  ): KernelResult {
    const sourceSel = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (sourceSel.length === 0) {
      throw new Error("OCCT backend: split body source selector matched 0 entities");
    }
    for (const selection of sourceSel) {
      if (selection.kind !== "solid" && selection.kind !== "face") {
        throw new Error("OCCT backend: split body source selector must resolve to solid/face");
      }
    }
    const sourceOwnerKeys = new Set<string>();
    for (const selection of sourceSel) {
      const key = this.resolveOwnerKey(selection as KernelSelection, upstream);
      sourceOwnerKeys.add(key);
    }
    if (sourceOwnerKeys.size !== 1) {
      throw new Error("OCCT backend: split body source selector must resolve to a single owner");
    }
    const sourceOwner = this.resolveOwnerShape(sourceSel[0] as KernelSelection, upstream);
    if (!sourceOwner) {
      throw new Error("OCCT backend: split body source must resolve to a solid owner");
    }

    const toolSelections = resolveSelectorSet(
      feature.tool,
      this.toResolutionContext(upstream)
    );
    if (toolSelections.length === 0) {
      throw new Error("OCCT backend: split body tool selector matched 0 entities");
    }
    for (const selection of toolSelections) {
      if (
        selection.kind !== "solid" &&
        selection.kind !== "face" &&
        selection.kind !== "surface"
      ) {
        throw new Error(
          "OCCT backend: split body tool selector must resolve to solid/face/surface"
        );
      }
    }

    const tools: any[] = [];
    const seen = new Set<number>();
    for (const selection of toolSelections) {
      const shape = selection.meta["shape"];
      if (!shape) continue;
      const hash = this.shapeHash(shape);
      if (seen.has(hash)) continue;
      seen.add(hash);
      tools.push(shape);
    }
    if (tools.length === 0) {
      throw new Error("OCCT backend: split body tool selector resolved no shapes");
    }

    // keepTool is accepted by IR/DSL but does not alter output wiring yet.
    let split = this.splitByTools(sourceOwner, tools);
    split = this.unifySameDomain(split);
    if (!this.isValidShape(split)) {
      throw new Error("OCCT backend: split body produced invalid result");
    }

    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:solid`,
          kind: "solid" as const,
          meta: { shape: split },
        },
      ],
    ]);
    const selections = this.collectSelections(
      split,
      feature.id,
      feature.result,
      feature.tags,
      {
        ledgerPlan: this.makeFaceMutationSelectionLedgerPlan(upstream, sourceOwner, []),
      }
    );
    return { outputs, selections };
  }

  private execSplitFace(
    feature: SplitFace,
    upstream: KernelResult
  ): KernelResult {
    const faceSelections = resolveSelectorSet(
      feature.faces,
      this.toResolutionContext(upstream)
    );
    if (faceSelections.length === 0) {
      throw new Error("OCCT backend: split face selector matched 0 entities");
    }
    for (const selection of faceSelections) {
      if (selection.kind !== "face") {
        throw new Error("OCCT backend: split face selector must resolve to faces");
      }
    }
    const ownerKeys = new Set<string>();
    for (const selection of faceSelections) {
      ownerKeys.add(this.resolveOwnerKey(selection as KernelSelection, upstream));
    }
    if (ownerKeys.size !== 1) {
      throw new Error("OCCT backend: split face selector must resolve to a single owner");
    }

    const ownerKey = this.resolveOwnerKey(faceSelections[0] as KernelSelection, upstream);
    const ownerShape = this.resolveOwnerShape(faceSelections[0] as KernelSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: split face target must resolve to an owner shape");
    }

    const toolSelections = resolveSelectorSet(
      feature.tool,
      this.toResolutionContext(upstream)
    );
    if (toolSelections.length === 0) {
      throw new Error("OCCT backend: split face tool selector matched 0 entities");
    }
    for (const selection of toolSelections) {
      if (
        selection.kind !== "solid" &&
        selection.kind !== "face" &&
        selection.kind !== "surface"
      ) {
        throw new Error(
          "OCCT backend: split face tool selector must resolve to solid/face/surface"
        );
      }
    }

    const tools: any[] = [];
    const seen = new Set<number>();
    for (const selection of toolSelections) {
      const shape = selection.meta["shape"];
      if (!shape) continue;
      const hash = this.shapeHash(shape);
      if (seen.has(hash)) continue;
      seen.add(hash);
      tools.push(shape);
    }
    if (tools.length === 0) {
      throw new Error("OCCT backend: split face tool selector resolved no shapes");
    }

    // Initial implementation splits at owner-shape scope and returns the split owner.
    let split = this.splitByTools(ownerShape, tools);
    split = this.unifySameDomain(split);
    if (!this.isValidShape(split)) {
      throw new Error("OCCT backend: split face produced invalid result");
    }

    const outputKind: "solid" | "face" = this.shapeHasSolid(split) ? "solid" : "face";
    const outputs = new Map([
      [
        feature.result,
        {
          id: `${feature.id}:${outputKind}`,
          kind: outputKind,
          meta: { shape: split },
        },
      ],
    ]);
    const selections = this.collectSelections(
      split,
      feature.id,
      outputKind === "solid" ? feature.result : ownerKey,
      feature.tags,
      {
        rootKind: outputKind === "solid" ? "solid" : "face",
        ledgerPlan: this.makeSplitFaceSelectionLedgerPlan(upstream, ownerShape, faceSelections),
      }
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

  private execUnwrap(
    feature: Unwrap,
    upstream: KernelResult,
    _resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const mode = feature.mode ?? "strict";
    const targets = resolveSelectorSet(feature.source, this.toResolutionContext(upstream));
    if (targets.length === 0) {
      throw new Error("OCCT backend: unwrap source selector matched 0 entities");
    }

    const faces: any[] = [];
    const precomputedPatches: UnwrapPatch[] = [];
    const seenByHash = new Map<number, any[]>();
    const addFace = (candidate: any) => {
      const face = this.toFace(candidate);
      const hash = this.shapeHash(face);
      const bucket = seenByHash.get(hash);
      if (bucket?.some((entry) => this.shapesSame(entry, face))) {
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
        const surfaceFaces = this.listFaces(shape);
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
        precomputedPatches.push(...this.extractSheetPatchesFromSolid(shape, mode));
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

    const facePatches = faces.map((face) => this.unwrapFacePatch(face));
    const patches = precomputedPatches.concat(facePatches);
    const components = this.layoutConnectedUnwrapFacePatches(patches);
    const packed = this.packUnwrapPatches(components);
    const outputShape =
      packed.length === 1 ? packed[0] : this.makeCompoundFromShapes(packed);
    if (!this.isValidShape(outputShape)) {
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
    const selections = this.collectSelections(
      outputShape,
      feature.id,
      feature.result,
      feature.tags,
      { rootKind: "face" }
    );
    return { outputs, selections };
  }

  private unwrapFacePatch(face: any): UnwrapPatch {
    const properties = this.faceProperties(face);
    if (properties.planar) {
      const basis = this.planeBasisFromFace(face);
      let flattened = face;

      const origin = basis.origin;
      if (vecLength(origin) > 1e-9) {
        flattened = this.transformShapeTranslate(flattened, [
          -origin[0],
          -origin[1],
          -origin[2],
        ]);
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
        flattened = this.transformShapeRotate(flattened, [0, 0, 0], alignAxis, alignAngle);
        sourceX = rotateAroundAxis(sourceX, alignAxis, alignAngle);
      }

      const xProj: [number, number, number] = [sourceX[0], sourceX[1], 0];
      const xProjLen = vecLength(xProj);
      let spin = 0;
      if (xProjLen > 1e-9) {
        const xUnit: [number, number, number] = [xProj[0] / xProjLen, xProj[1] / xProjLen, 0];
        spin = Math.atan2(-xUnit[1], clamp(xUnit[0], -1, 1));
        if (Math.abs(spin) > 1e-12) {
          flattened = this.transformShapeRotate(flattened, [0, 0, 0], [0, 0, 1], spin);
        }
      }

      if (!this.isValidShape(flattened)) {
        throw new Error("OCCT backend: unwrap produced invalid result");
      }
      const flatProps = this.faceProperties(flattened);
      const projectPoint: UnwrapPointProjector = (point) => {
        if (!point.every((value) => Number.isFinite(value))) return null;
        const translated: [number, number, number] = [
          point[0] - origin[0],
          point[1] - origin[1],
          point[2] - origin[2],
        ];
        const aligned =
          Math.abs(alignAngle) > 1e-12
            ? rotateAroundAxis(translated, alignAxis, alignAngle)
            : translated;
        const spun =
          Math.abs(spin) > 1e-12
            ? rotateAroundAxis(aligned, [0, 0, 1], spin)
            : aligned;
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
      const cylinder = this.cylinderFromFace(face);
      const uv = this.surfaceUvExtents(face);
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
      const wire = this.makePolygonWire(corners);
      const faceBuilder = this.makeFaceFromWire(wire);
      const flattened = this.readShape(faceBuilder);
      if (!this.isValidShape(flattened)) {
        throw new Error("OCCT backend: unwrap produced invalid result");
      }
      const axis = normalizeVector(cylinder.axis);
      const xRef = this.cylinderReferenceXDirection(cylinder);
      const yRef = normalizeVector(cross(axis, xRef));
      const axisValid = isFiniteVec(axis);
      const xRefValid = isFiniteVec(xRef);
      const yRefValid = isFiniteVec(yRef);
      const projectPoint: UnwrapPointProjector = (point) => {
        if (!axisValid || !xRefValid || !yRefValid) return null;
        if (!point.every((value) => Number.isFinite(value))) return null;
        const rel = this.subVec(point, cylinder.origin);
        const axial = dot(rel, axis);
        const radial = this.subVec(rel, this.scaleVec(axis, axial));
        const radialLen = vecLength(radial);
        if (!(radialLen > 1e-9)) return null;
        const cosAngle = dot(radial, xRef) / radialLen;
        const sinAngle = dot(radial, yRef) / radialLen;
        let u = Math.atan2(sinAngle, cosAngle);
        u = this.closestPeriodicParameter(u, uv.uMin, uv.uMax);
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

    throw new Error(
      "OCCT backend: unwrap currently supports planar or cylindrical faces only"
    );
  }

  private extractSheetPatchesFromSolid(
    solid: any,
    mode: "strict" | "experimental" = "strict"
  ): UnwrapPatch[] {
    const bounds = this.shapeBounds(solid);
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

    const faces = this.listFaces(solid);
    if (faces.length === 0) {
      throw new Error("OCCT backend: unwrap solid source has no faces");
    }

    const cylinderNet = this.extractSolidCylinderNetFromSolid(solid, faces);
    if (cylinderNet) {
      return [cylinderNet];
    }

    if (thinRatio > 0.35) {
      const boxNet = this.extractAxisAlignedBoxNetFromSolid(solid, faces);
      if (boxNet) {
        return [boxNet];
      }
      if (mode === "experimental") {
        const polyhedral = this.extractPlanarPolyhedralPatchesFromSolid(solid, faces);
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
      const props = this.faceProperties(face);
      if (!props.planar) continue;
      const normal = props.normalVec
        ? normalizeVector(props.normalVec)
        : normalizeVector(this.planeBasisFromFace(face).normal);
      if (!isFiniteVec(normal)) continue;
      planar.push({
        face,
        area: Math.max(props.area, 0),
        center: props.center,
        normal,
      });
    }

    let bestPlanar: { a: PlanarEntry; b: PlanarEntry; thickness: number; score: number } | null =
      null;
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
        const delta = this.subVec(b.center, a.center);
        const thickness = Math.abs(dot(delta, a.normal));
        if (!(thickness > 1e-6)) continue;
        const score = Math.min(a.area, b.area) / thickness;
        if (!bestPlanar || score > bestPlanar.score) {
          bestPlanar = { a, b, thickness, score };
        }
      }
    }
    if (bestPlanar) {
      const primary =
        bestPlanar.a.area >= bestPlanar.b.area ? bestPlanar.a.face : bestPlanar.b.face;
      const patch = this.unwrapFacePatch(primary);
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
      const cyl = this.cylinderFromFace(face);
      const uv = this.surfaceUvExtents(face);
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
      const wire = this.makePolygonWire(corners);
      const faceBuilder = this.makeFaceFromWire(wire);
      const shape = this.readShape(faceBuilder);
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

  private extractSolidCylinderNetFromSolid(
    solid: any,
    faces?: any[]
  ): UnwrapPatch | null {
    const sourceFaces = faces ?? this.listFaces(solid);
    const cylindricalFaces: any[] = [];
    const planarFaces: Array<{
      face: any;
      area: number;
      center: [number, number, number];
      normal: [number, number, number];
    }> = [];
    for (const face of sourceFaces) {
      const props = this.faceProperties(face);
      if (props.surfaceType === "cylinder") {
        cylindricalFaces.push(face);
        continue;
      }
      if (!props.planar) {
        return null;
      }
      const normal = props.normalVec
        ? normalizeVector(props.normalVec)
        : normalizeVector(this.planeBasisFromFace(face).normal);
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
    const cylinder = this.cylinderFromFace(sideFace);
    const uv = this.surfaceUvExtents(sideFace);
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
    if (Math.abs(capA.area - capArea) > areaTol || Math.abs(capB.area - capArea) > areaTol) {
      return null;
    }
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
    const rectWire = this.makePolygonWire(rectangleCorners);
    const rectFace = this.readShape(this.makeFaceFromWire(rectWire));
    const topCap = this.makeCircleFace(cylinder.radius, [width / 2, height + cylinder.radius, 0]);
    const bottomCap = this.makeCircleFace(cylinder.radius, [width / 2, -cylinder.radius, 0]);
    const shape = this.makeCompoundFromShapes([rectFace, topCap, bottomCap]);
    if (!this.isValidShape(shape, "face")) return null;
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

  private extractAxisAlignedBoxNetFromSolid(
    solid: any,
    faces?: any[]
  ): UnwrapPatch | null {
    const sourceFaces = faces ?? this.listFaces(solid);
    if (sourceFaces.length !== 6) return null;

    const bounds = this.shapeBounds(solid);
    const center: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const byDir = new Map<AxisDirection, any>();
    for (const face of sourceFaces) {
      const props = this.faceProperties(face);
      if (!props.planar) return null;
      const normal = props.normalVec
        ? normalizeVector(props.normalVec)
        : normalizeVector(this.planeBasisFromFace(face).normal);
      const abs: [number, number, number] = [
        Math.abs(normal[0]),
        Math.abs(normal[1]),
        Math.abs(normal[2]),
      ];
      const dominant = Math.max(abs[0], abs[1], abs[2]);
      if (!(dominant > 0.98)) return null;
      const dir = (() => {
        if (dominant === abs[0]) {
          return props.center[0] >= center[0] ? "+X" : "-X";
        }
        if (dominant === abs[1]) {
          return props.center[1] >= center[1] ? "+Y" : "-Y";
        }
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
      const wire = this.makePolygonWire(corners);
      const faceBuilder = this.makeFaceFromWire(wire);
      return this.readShape(faceBuilder);
    };

    const faceSpecs: Array<{
      dir: AxisDirection;
      x0: number;
      y0: number;
      w: number;
      h: number;
    }> = [
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
      if (!this.isValidShape(shape, "face")) return null;
      shapes.push(shape);
      faceMeta.push({
        kind: "planar",
        sourceDirection: spec.dir,
        width: spec.w,
        height: spec.h,
        sourceSurfaceType: "plane",
      });
    }

    const compound = this.makeCompoundFromShapes(shapes);
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

  private extractPlanarPolyhedralPatchesFromSolid(
    solid: any,
    faces?: any[]
  ): UnwrapPatch[] | null {
    const sourceFaces = faces ?? this.listFaces(solid);
    if (sourceFaces.length < 4) return null;
    const patches: UnwrapPatch[] = [];
    for (const face of sourceFaces) {
      const props = this.faceProperties(face);
      if (!props.planar) return null;
      const patch = this.unwrapFacePatch(face);
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

  private layoutConnectedUnwrapFacePatches(patches: UnwrapPatch[]): any[] {
    if (patches.length <= 1) return patches.map((patch) => patch.shape);
    const edges = this.buildUnwrapAdjacencyEdges(patches);
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
        key: this.unwrapPatchSortKey(patch),
      }))
      .sort((a, b) => this.compareUnwrapSortKeys(a.key, b.key))
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
        const neighbors = (edgesByPatch.get(current) ?? []).slice().sort((a, b) =>
          this.compareUnwrapAdjacencyEdges(a, b)
        );
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
          const target0 = this.applyUnwrapTransform2D(currentTransform, a0);
          const target1 = this.applyUnwrapTransform2D(currentTransform, a1);
          const fit = this.fitUnwrapEdgeTransform2D(b0, b1, target0, target1);
          if (!fit) continue;
          const candidateShape = this.transformShapeInUnwrapPlane(
            neighborPatch.shape,
            fit
          );
          const componentShapes = Array.from(componentPlaced)
            .map((index) => transformedByIndex.get(index))
            .filter(Boolean);
          if (this.unwrapPlacementOverlaps(candidateShape, componentShapes)) {
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
      return this.transformShapeInUnwrapPlane(patch.shape, transform);
    });

    return components.map((indices) => {
      const shapes = indices.map((index) => transformed[index]).filter(Boolean);
      if (shapes.length === 0) return null;
      if (shapes.length === 1) return shapes[0];
      return this.finalizeUnwrapComponentShapes(shapes);
    }).filter((shape): shape is any => shape !== null);
  }

  private buildUnwrapAdjacencyEdges(patches: UnwrapPatch[]): UnwrapAdjacencyEdge[] {
    const entries: Array<{ index: number; face: any }> = [];
    for (let i = 0; i < patches.length; i += 1) {
      const patch = patches[i];
      if (!patch?.sourceFace || !patch.projectPoint) continue;
      entries.push({ index: i, face: this.toFace(patch.sourceFace) });
    }
    if (entries.length < 2) return [];

    const compound = this.makeCompoundFromShapes(entries.map((entry) => entry.face));
    const adjacency = this.buildEdgeAdjacency(compound);
    if (!adjacency) return [];

    const byFaceHash = new Map<number, Array<{ index: number; face: any }>>();
    for (const entry of entries) {
      const hash = this.shapeHash(entry.face);
      const bucket = byFaceHash.get(hash) ?? [];
      bucket.push(entry);
      byFaceHash.set(hash, bucket);
    }
    const lookupIndex = (face: any): number | null => {
      const hash = this.shapeHash(face);
      const bucket = byFaceHash.get(hash);
      if (!bucket) return null;
      for (const entry of bucket) {
        if (this.shapesSame(entry.face, face)) return entry.index;
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
        const endpoints = this.edgeEndpoints(item.edge);
        if (!endpoints) continue;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        const edgeHash = this.shapeHash(item.edge);
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
    edges.sort((a, b) => this.compareUnwrapAdjacencyEdges(a, b));
    return edges;
  }

  private edgeEndpoints(
    edge: any
  ): { start: [number, number, number]; end: [number, number, number] } | null {
    try {
      const adaptor = this.newOcct("BRepAdaptor_Curve", this.toEdge(edge));
      const first = this.callNumber(adaptor, "FirstParameter");
      const last = this.callNumber(adaptor, "LastParameter");
      if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
      const start = this.pointToArray(this.call(adaptor, "Value", first));
      const end = this.pointToArray(this.call(adaptor, "Value", last));
      if (![...start, ...end].every((value) => Number.isFinite(value))) return null;
      return { start, end };
    } catch {
      return null;
    }
  }

  private applyUnwrapTransform2D(
    transform: Unwrap2DTransform,
    point: [number, number, number]
  ): [number, number, number] {
    const cos = Math.cos(transform.angle);
    const sin = Math.sin(transform.angle);
    const x = cos * point[0] - sin * point[1] + transform.tx;
    const y = sin * point[0] + cos * point[1] + transform.ty;
    return [x, y, point[2]];
  }

  private fitUnwrapEdgeTransform2D(
    sourceStart: [number, number, number],
    sourceEnd: [number, number, number],
    targetStart: [number, number, number],
    targetEnd: [number, number, number]
  ): Unwrap2DTransform | null {
    const targetVec: [number, number] = [
      targetEnd[0] - targetStart[0],
      targetEnd[1] - targetStart[1],
    ];
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

  private transformShapeInUnwrapPlane(shape: any, transform: Unwrap2DTransform): any {
    let out = shape;
    if (Math.abs(transform.angle) > 1e-12) {
      out = this.transformShapeRotate(out, [0, 0, 0], [0, 0, 1], transform.angle);
    }
    if (Math.abs(transform.tx) > 1e-12 || Math.abs(transform.ty) > 1e-12) {
      out = this.transformShapeTranslate(out, [transform.tx, transform.ty, 0]);
    }
    return out;
  }

  private unwrapPlacementOverlaps(shape: any, existing: any[]): boolean {
    if (existing.length === 0) return false;
    const bounds = this.shapeBounds(shape);
    const tol = 1e-5;
    for (const candidate of existing) {
      const other = this.shapeBounds(candidate);
      const overlapX =
        Math.min(bounds.max[0], other.max[0]) - Math.max(bounds.min[0], other.min[0]);
      if (overlapX <= tol) continue;
      const overlapY =
        Math.min(bounds.max[1], other.max[1]) - Math.max(bounds.min[1], other.min[1]);
      if (overlapY <= tol) continue;
      return true;
    }
    return false;
  }

  private finalizeUnwrapComponentShapes(shapes: any[]): any {
    const compound = this.makeCompoundFromShapes(shapes);
    if (!this.unwrapShapesCoplanarXY(shapes)) return compound;
    const sewed = this.sewShapeFaces(compound, 1e-6);
    if (!sewed) return compound;
    if (this.shapeHasSolid(sewed)) return compound;
    if (this.countFaces(sewed) < 1) return compound;
    return sewed;
  }

  private unwrapShapesCoplanarXY(shapes: any[]): boolean {
    if (shapes.length <= 1) return true;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const shape of shapes) {
      const bounds = this.shapeBounds(shape);
      minZ = Math.min(minZ, bounds.min[2]);
      maxZ = Math.max(maxZ, bounds.max[2]);
    }
    if (!(Number.isFinite(minZ) && Number.isFinite(maxZ))) return false;
    return Math.abs(maxZ - minZ) <= 1e-5;
  }

  private unwrapPatchSortKey(patch: UnwrapPatch): [number, number, number, number] {
    if (patch.sourceFace) {
      const props = this.faceProperties(patch.sourceFace);
      return [props.center[0], props.center[1], props.center[2], props.area];
    }
    const bounds = this.shapeBounds(patch.shape);
    const center: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const area = this.faceProperties(this.firstFace(patch.shape) ?? patch.shape).area;
    return [center[0], center[1], center[2], area];
  }

  private compareUnwrapSortKeys(
    a: [number, number, number, number],
    b: [number, number, number, number]
  ): number {
    for (let i = 0; i < a.length; i += 1) {
      const delta = (a[i] ?? 0) - (b[i] ?? 0);
      if (Math.abs(delta) > 1e-9) return delta < 0 ? -1 : 1;
    }
    return 0;
  }

  private compareUnwrapAdjacencyEdges(
    a: UnwrapAdjacencyEdge,
    b: UnwrapAdjacencyEdge
  ): number {
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

  private closestPeriodicParameter(value: number, min: number, max: number): number {
    const period = Math.PI * 2;
    const center = (min + max) / 2;
    const shifted = value + Math.round((center - value) / period) * period;
    if (shifted < min) return shifted + period;
    if (shifted > max) return shifted - period;
    return shifted;
  }

  private packUnwrapPatches(shapes: any[]): any[] {
    if (shapes.length <= 1) return shapes;
    const packed: any[] = [];
    let cursorX = 0;
    let maxHeight = 0;
    let gap = 1;
    for (const shape of shapes) {
      const bounds = this.shapeBounds(shape);
      const width = Math.max(bounds.max[0] - bounds.min[0], 1e-6);
      const height = Math.max(bounds.max[1] - bounds.min[1], 1e-6);
      const moved = this.transformShapeTranslate(shape, [
        cursorX - bounds.min[0],
        -bounds.min[1],
        0,
      ]);
      packed.push(moved);
      maxHeight = Math.max(maxHeight, height);
      gap = Math.max(gap, maxHeight * 0.05, 0.5);
      cursorX += width + gap;
    }
    return packed;
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
      feature.tags,
      {
        ledgerPlan: this.makeDraftSelectionLedgerPlan(
          upstream,
          owner,
          faceTargets as KernelSelection[],
          draft
        ),
      }
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
      feature.tags,
      {
        ledgerPlan: this.makeFaceMutationSelectionLedgerPlan(upstream, shape, []),
      }
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
    if (feature.counterbore && feature.countersink) {
      throw new Error("OCCT backend: hole cannot define both counterbore and countersink");
    }
    const wizardEndCondition = this.resolveHoleEndCondition(feature);
    if (feature.wizard?.threaded === true) {
      throw new Error(
        "OCCT backend: hole wizard threaded profiles are not yet supported; use feature.thread"
      );
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
      const length = this.resolveHoleDepth(
        feature,
        owner,
        axisDir,
        origin,
        radius,
        wizardEndCondition
      );
      if (!(length > 0)) {
        throw new Error("OCCT backend: hole depth must be positive");
      }
      if (counterboreDepth > 0 && counterboreDepth > length) {
        throw new Error("OCCT backend: counterbore depth exceeds hole depth");
      }
      if (countersinkDepth > 0 && countersinkDepth > length) {
        throw new Error("OCCT backend: countersink depth exceeds hole depth");
      }
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

    const outputKey = feature.result ?? ownerKey;
    const outputs = new Map([
      [
        outputKey,
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
      outputKey,
      feature.tags,
      {
        ledgerPlan: this.makeHoleSelectionLedgerPlan(
          upstream,
          owner,
          target,
          centers,
          axisDir,
          {
            radius,
            counterboreRadius,
            countersink: countersinkRadius !== null,
          }
        ),
      }
    );
    return { outputs, selections };
  }

  private resolveHoleEndCondition(feature: Hole): HoleEndCondition {
    if (feature.wizard?.endCondition) {
      return feature.wizard.endCondition;
    }
    return feature.depth === "throughAll" ? "throughAll" : "blind";
  }

  private resolveHoleDepth(
    feature: Hole,
    owner: any,
    axisDir: [number, number, number],
    origin: [number, number, number],
    holeRadius: number,
    endCondition: HoleEndCondition
  ): number {
    if (endCondition === "blind") {
      return expectNumber(feature.depth, "feature.depth");
    }
    if (endCondition === "throughAll" || endCondition === "upToLast") {
      return this.depthToBodyLimit(owner, axisDir, origin, holeRadius, "last");
    }
    return this.depthToBodyLimit(owner, axisDir, origin, holeRadius, "next");
  }

  private depthToBodyLimit(
    shape: any,
    axisDir: [number, number, number],
    origin: [number, number, number],
    holeRadius: number,
    mode: "next" | "last"
  ): number {
    const probeDepth = this.depthToBodyLimitByProbe(shape, axisDir, origin, holeRadius, mode);
    if (probeDepth !== null) return probeDepth;
    const boundsDepth = this.depthToBodyLimitByBounds(shape, axisDir, origin, mode);
    if (boundsDepth !== null) return boundsDepth;
    return this.throughAllDepth(shape, axisDir, origin);
  }

  private depthToBodyLimitByProbe(
    shape: any,
    axisDir: [number, number, number],
    origin: [number, number, number],
    holeRadius: number,
    mode: "next" | "last"
  ): number | null {
    const axis = normalizeVector(axisDir);
    if (!isFiniteVec(axis)) return null;
    const maxDepth = this.depthToBodyLimitByBounds(shape, axis, origin, "last");
    if (!(maxDepth !== null && maxDepth > 0)) return null;

    const probeRadius = Math.max(0.05, Math.min(0.5, holeRadius * 0.25));
    const probeHeight = maxDepth + this.holeDepthMargin(maxDepth);
    if (!(probeHeight > 0)) return null;

    let probe: any;
    let intersected: any;
    try {
      probe = this.readShape(this.makeCylinder(probeRadius, probeHeight, axis, origin));
      intersected = this.readShape(this.makeBoolean("intersect", shape, probe));
    } catch {
      return null;
    }

    const ranges = this.collectSolidProjectionRanges(intersected, axis);
    if (ranges.length === 0) return null;
    const start = dot(origin, axis);
    const eps = 1e-6;
    const distances: number[] = [];
    for (const range of ranges) {
      const entry = Math.max(range.min, start);
      const exit = range.max;
      const depth = exit - entry;
      if (exit > start + eps && depth > eps) {
        distances.push(exit - start);
      }
    }
    if (distances.length === 0) return null;
    const base = mode === "next" ? Math.min(...distances) : Math.max(...distances);
    if (!(base > 0)) return null;
    return base + this.holeDepthMargin(base);
  }

  private depthToBodyLimitByBounds(
    shape: any,
    axisDir: [number, number, number],
    origin: [number, number, number],
    mode: "next" | "last"
  ): number | null {
    const axis = normalizeVector(axisDir);
    if (!isFiniteVec(axis)) return null;
    const extents = this.axisBounds(axis, this.shapeBounds(shape));
    if (!extents) return null;
    const start = dot(origin, axis);
    const span = extents.max - extents.min;
    if (!(span > 0)) return null;
    const next = extents.max - start;
    if (!(next > 1e-6)) return null;
    const base = mode === "last" ? next : next;
    return base + this.holeDepthMargin(base);
  }

  private collectSolidProjectionRanges(
    shape: any,
    axis: [number, number, number]
  ): Array<{ min: number; max: number }> {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_SOLID,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const ranges: Array<{ min: number; max: number }> = [];
    for (; explorer.More(); explorer.Next()) {
      const solid = explorer.Current();
      const bounds = this.axisBounds(axis, this.shapeBounds(solid));
      if (bounds) {
        ranges.push({ min: bounds.min, max: bounds.max });
      }
    }
    ranges.sort((a, b) => a.min - b.min);
    return ranges;
  }

  private holeDepthMargin(depth: number): number {
    return Math.max(0.05, depth * 0.02);
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
      feature.tags,
      {
        ledgerPlan: this.makeBooleanSelectionLedgerPlan(upstream, left, right),
      }
    );
    return { outputs, selections };
  }

  private execFillet(
    feature: Fillet,
    upstream: KernelResult,
    _resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const radius = expectNumber(feature.radius, "feature.radius");
    if (radius <= 0) {
      throw new Error("OCCT backend: fillet radius must be positive");
    }
    return executeEdgeModifier(
      "fillet",
      feature,
      upstream,
      this.edgeModifierDeps(),
      (owner) => this.makeFilletBuilder(owner),
      (builder, edge) =>
        tryDynamicMethod(builder, [
          { name: "Add_2", args: [edge, radius] },
          { name: "Add_2", args: [radius, edge] },
          { name: "Add_1", args: [edge] },
        ])
    );
  }

  private execChamfer(
    feature: Chamfer,
    upstream: KernelResult,
    _resolve: ExecuteInput["resolve"]
  ): KernelResult {
    const distance = expectNumber(feature.distance, "feature.distance");
    if (distance <= 0) {
      throw new Error("OCCT backend: chamfer distance must be positive");
    }
    return executeEdgeModifier(
      "chamfer",
      feature,
      upstream,
      this.edgeModifierDeps(),
      (owner) => this.makeChamferBuilder(owner),
      (builder, edge) =>
        tryDynamicMethod(builder, [
          { name: "Add_2", args: [distance, edge] },
          { name: "Add_1", args: [edge] },
        ])
    );
  }

  private execVariableFillet(
    feature: VariableFillet,
    upstream: KernelResult
  ): KernelResult {
    const source = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (source.length !== 1 || source[0]?.kind !== "solid") {
      throw new Error(
        "OCCT backend: variable fillet source selector must resolve to one solid"
      );
    }
    const sourceSelection = source[0] as KernelSelection;
    const ownerKey = this.resolveOwnerKey(sourceSelection, upstream);
    const ownerShape = this.resolveOwnerShape(sourceSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: variable fillet source missing owner solid");
    }
    const builder = this.makeFilletBuilder(ownerShape);
    const addedEdges: any[] = [];
    let addedAny = false;
    for (const [index, entry] of feature.entries.entries()) {
      const radius = expectNumber(entry.radius, `variable fillet radius[${index}]`);
      if (!(radius > 0)) {
        throw new Error("OCCT backend: variable fillet radius must be positive");
      }
      const targets = resolveSelectorSet(
        entry.edge,
        this.toResolutionContext(upstream)
      );
      if (targets.length === 0) {
        throw new Error(`OCCT backend: variable fillet entry ${index} matched 0 edges`);
      }
      for (const target of targets) {
        if (target.kind !== "edge") {
          throw new Error("OCCT backend: variable fillet entries must resolve to edges");
        }
        const targetOwner = this.resolveOwnerKey(target as KernelSelection, upstream);
        if (targetOwner !== ownerKey) {
          throw new Error(
            "OCCT backend: variable fillet edges must belong to source solid"
          );
        }
        const edge = this.toEdge(target.meta["shape"]);
        if (this.containsShape(addedEdges, edge)) continue;
        const added = tryDynamicMethod(builder, [
          { name: "Add_2", args: [edge, radius] },
          { name: "Add_2", args: [radius, edge] },
          { name: "Add_1", args: [edge] },
        ]);
        if (!added) {
          throw new Error("OCCT backend: failed to add variable fillet edge");
        }
        addedEdges.push(edge);
        addedAny = true;
      }
    }
    if (!addedAny) {
      throw new Error("OCCT backend: variable fillet resolved no unique edges");
    }
    this.tryBuild(builder);
    const solid = this.readShape(builder);
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

  private execVariableChamfer(
    feature: VariableChamfer,
    upstream: KernelResult
  ): KernelResult {
    const source = resolveSelectorSet(
      feature.source,
      this.toResolutionContext(upstream)
    );
    if (source.length !== 1 || source[0]?.kind !== "solid") {
      throw new Error(
        "OCCT backend: variable chamfer source selector must resolve to one solid"
      );
    }
    const sourceSelection = source[0] as KernelSelection;
    const ownerKey = this.resolveOwnerKey(sourceSelection, upstream);
    const ownerShape = this.resolveOwnerShape(sourceSelection, upstream);
    if (!ownerShape) {
      throw new Error("OCCT backend: variable chamfer source missing owner solid");
    }
    const builder = this.makeChamferBuilder(ownerShape);
    const addedEdges: any[] = [];
    let addedAny = false;
    for (const [index, entry] of feature.entries.entries()) {
      const distance = expectNumber(
        entry.distance,
        `variable chamfer distance[${index}]`
      );
      if (!(distance > 0)) {
        throw new Error("OCCT backend: variable chamfer distance must be positive");
      }
      const targets = resolveSelectorSet(
        entry.edge,
        this.toResolutionContext(upstream)
      );
      if (targets.length === 0) {
        throw new Error(`OCCT backend: variable chamfer entry ${index} matched 0 edges`);
      }
      for (const target of targets) {
        if (target.kind !== "edge") {
          throw new Error("OCCT backend: variable chamfer entries must resolve to edges");
        }
        const targetOwner = this.resolveOwnerKey(target as KernelSelection, upstream);
        if (targetOwner !== ownerKey) {
          throw new Error(
            "OCCT backend: variable chamfer edges must belong to source solid"
          );
        }
        const edge = this.toEdge(target.meta["shape"]);
        if (this.containsShape(addedEdges, edge)) continue;
        const added = tryDynamicMethod(builder, [
          { name: "Add_2", args: [distance, edge] },
          { name: "Add_1", args: [edge] },
        ]);
        if (!added) {
          throw new Error("OCCT backend: failed to add variable chamfer edge");
        }
        addedEdges.push(edge);
        addedAny = true;
      }
    }
    if (!addedAny) {
      throw new Error("OCCT backend: variable chamfer resolved no unique edges");
    }
    this.tryBuild(builder);
    const solid = this.readShape(builder);
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

  private edgeModifierDeps(): EdgeModifierDeps {
    return {
      toResolutionContext: (state) => this.toResolutionContext(state),
      resolveOwnerKey: (selection, state) => this.resolveOwnerKey(selection, state),
      resolveOwnerShape: (selection, state) => this.resolveOwnerShape(selection, state),
      toEdge: (edge) => this.toEdge(edge),
      tryBuild: (builder) => this.tryBuild(builder),
      readShape: (builder) => this.readShape(builder),
      collectSelections: (shape, featureId, ownerKey, tags, opts) =>
        this.collectSelections(
          shape,
          featureId,
          ownerKey,
          tags,
          opts as SelectionCollectionOptions | undefined
        ),
      makeSelectionCollectionOptions: (label, upstream, owner, targets, builder) =>
        ({
          ledgerPlan: this.makeEdgeModifierSelectionLedgerPlan(
            label,
            upstream,
            owner,
            targets,
            builder
          ),
        }) satisfies SelectionCollectionOptions,
    };
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
        const wireSegmentSlots = this.segmentSlotsForLoop(
          entry.profile.loop,
          entityMap,
          plane
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
          meta: {
            profile: entry.profile,
            face,
            wire,
            wireClosed: closed,
            planeNormal: plane.normal,
            wireSegmentSlots,
          },
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
    opts?: SelectionCollectionOptions
  ): KernelSelection[] {
    const selections: KernelSelection[] = [];
    const tags =
      Array.isArray(featureTags) && featureTags.length > 0
        ? featureTags.slice()
        : undefined;

    const rootKind = opts?.rootKind ?? "solid";
    if (rootKind === "solid") {
      const solidEntry: CollectedSubshape = {
        shape,
        meta: {
          shape,
          owner: shape,
          ownerKey,
          createdBy: featureId,
          role: "body",
          center: this.shapeCenter(shape),
          featureTags: tags,
        },
      };
      this.applySelectionLedgerHint(solidEntry, {
        slot: "body",
        role: "body",
        lineage: { kind: "created" },
      });
      if (opts?.ledgerPlan?.solid) {
        this.applySelectionLedgerHint(solidEntry, opts.ledgerPlan.solid);
      }
      const assignment = this.assignStableSelectionIds("solid", [solidEntry])[0];
      if (assignment) {
        selections.push({
          id: assignment.id,
          kind: "solid",
          meta: solidEntry.meta,
          record: assignment.record,
        });
      }
    }

    const faceEntries = this.collectUniqueSubshapes(
      shape,
      (this.occt as any).TopAbs_ShapeEnum.TopAbs_FACE,
      (face) => this.faceMetadata(face, shape, featureId, ownerKey, tags)
    );
    if (opts?.ledgerPlan?.faces) {
      opts.ledgerPlan.faces(faceEntries);
    }
    if (rootKind === "face" && faceEntries.length === 1) {
      const onlyFace = faceEntries[0];
      if (onlyFace && !onlyFace.ledger?.slot) {
        this.applySelectionLedgerHint(onlyFace, {
          slot: "seed",
          role: "face",
          lineage: { kind: "created" },
        });
      }
    }
    const faceAssignments = this.assignStableSelectionIds("face", faceEntries);
    for (let i = 0; i < faceEntries.length; i += 1) {
      const entry = faceEntries[i];
      const assignment = faceAssignments[i];
      if (!entry || !assignment) continue;
      selections.push({
        id: assignment.id,
        kind: "face",
        meta: entry.meta,
        record: assignment.record,
      });
    }

    const edgeEntries = this.collectUniqueSubshapes(
      shape,
      (this.occt as any).TopAbs_ShapeEnum.TopAbs_EDGE,
      (edge) => this.edgeMetadata(edge, shape, featureId, ownerKey, tags)
    );
    if (opts?.ledgerPlan?.edges) {
      opts.ledgerPlan.edges(edgeEntries);
    }
    const edgeAssignments = this.assignStableSelectionIds("edge", edgeEntries);
    for (let i = 0; i < edgeEntries.length; i += 1) {
      const entry = edgeEntries[i];
      const assignment = edgeAssignments[i];
      if (!entry || !assignment) continue;
      selections.push({
        id: assignment.id,
        kind: "edge",
        meta: entry.meta,
        record: assignment.record,
      });
    }

    return selections;
  }

  private applySelectionLedgerHint(
    entry: CollectedSubshape,
    hint: SelectionLedgerHint
  ): void {
    const existing = entry.ledger;
    const aliases = new Set<string>();
    for (const candidate of [existing?.aliases, hint.aliases]) {
      if (!Array.isArray(candidate)) continue;
      for (const alias of candidate) {
        if (typeof alias === "string" && alias.trim().length > 0) {
          aliases.add(alias.trim());
        }
      }
    }
    entry.ledger = {
      slot: typeof hint.slot === "string" && hint.slot.length > 0 ? hint.slot : existing?.slot,
      role: typeof hint.role === "string" && hint.role.length > 0 ? hint.role : existing?.role,
      lineage: hint.lineage ?? existing?.lineage,
      aliases: aliases.size > 0 ? Array.from(aliases) : existing?.aliases,
    };
    if (entry.ledger?.role) {
      if (
        entry.meta.selectionLegacyRole === undefined &&
        typeof entry.meta.role === "string" &&
        entry.meta.role.trim().length > 0
      ) {
        entry.meta.selectionLegacyRole = entry.meta.role;
      }
      entry.meta.role = entry.ledger.role;
    }
    if (entry.ledger?.slot) {
      entry.meta.selectionSlot = entry.ledger.slot;
    }
    if (entry.ledger?.lineage) {
      entry.meta.selectionLineage = entry.ledger.lineage;
    }
    if (entry.ledger?.aliases && entry.ledger.aliases.length > 0) {
      entry.meta.selectionAliases = entry.ledger.aliases.slice();
    }
  }

  private collectUniqueSubshapes(
    shape: any,
    shapeKind: any,
    metaFactory: (subshape: any) => Record<string, unknown>
  ): CollectedSubshape[] {
    const occt = this.occt as any;
    const collected: CollectedSubshape[] = [];
    const seen = new Map<number, any[]>();
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(shape, shapeKind, occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; explorer.More(); explorer.Next()) {
      const current = explorer.Current();
      const hash = this.shapeHash(current);
      const bucket = seen.get(hash);
      if (bucket && bucket.some((candidate) => this.shapesSame(candidate, current))) {
        continue;
      }
      if (bucket) bucket.push(current);
      else seen.set(hash, [current]);
      collected.push({
        shape: current,
        meta: metaFactory(current),
      });
    }
    return collected;
  }

  private assignStableSelectionIds(
    kind: KernelSelection["kind"],
    entries: CollectedSubshape[]
  ): SelectionIdAssignment[] {
    type DecoratedEntry = {
      index: number;
      baseId: string;
      legacyBaseId?: string;
      tieHash: string;
      record: KernelSelectionRecord;
    };

    const decorated: DecoratedEntry[] = entries.map((entry, index) => {
      const record = this.buildSelectionRecord(entry);
      return {
        index,
        baseId: this.buildStableSelectionBaseId(kind, entry.meta, record),
        legacyBaseId: record.slot
          ? this.buildLegacyStableSelectionBaseId(kind, entry.meta, record)
          : undefined,
        tieHash: hashValue(this.selectionTieBreakerFingerprint(kind, entry.meta)),
        record,
      };
    });

    const groups = new Map<string, DecoratedEntry[]>();
    for (const entry of decorated) {
      const bucket = groups.get(entry.baseId);
      if (bucket) bucket.push(entry);
      else groups.set(entry.baseId, [entry]);
    }

    const assignments = new Array<SelectionIdAssignment>(entries.length);
    for (const bucket of groups.values()) {
      bucket.sort((a, b) => {
        const byTie = a.tieHash.localeCompare(b.tieHash);
        if (byTie !== 0) return byTie;
        return a.index - b.index;
      });
      for (let i = 0; i < bucket.length; i += 1) {
        const entry = bucket[i];
        if (!entry) continue;
        const id = bucket.length === 1 ? entry.baseId : `${entry.baseId}.${i + 1}`;
        const aliases =
          entry.legacyBaseId && entry.legacyBaseId !== entry.baseId
            ? [bucket.length === 1 ? entry.legacyBaseId : `${entry.legacyBaseId}.${i + 1}`]
            : undefined;
        if (aliases) {
          entry.record.aliases = aliases;
          const targetEntry = entries[entry.index];
          if (targetEntry) {
            targetEntry.meta.selectionAliases = aliases.slice();
          }
        }
        assignments[entry.index] = {
          id,
          aliases,
          record: entry.record,
        };
      }
    }

    return assignments;
  }

  private buildSelectionRecord(entry: CollectedSubshape): KernelSelectionRecord {
    const identity = this.selectionIdentityValues(entry.meta);
    return {
      ownerKey: identity.ownerKey,
      createdBy: identity.createdBy,
      role: entry.ledger?.role ?? this.stringFingerprint(entry.meta.role),
      slot: entry.ledger?.slot,
      lineage: entry.ledger?.lineage ?? { kind: "created" },
      aliases: entry.ledger?.aliases,
    };
  }

  private selectionIdentityValues(
    meta: Record<string, unknown>,
    record?: Pick<KernelSelectionRecord, "ownerKey" | "createdBy">
  ): { ownerKey: string; createdBy: string } {
    const ownerKey =
      record?.ownerKey && record.ownerKey.trim().length > 0
        ? record.ownerKey.trim()
        : typeof meta.ownerKey === "string" && meta.ownerKey.trim().length > 0
          ? meta.ownerKey.trim()
          : "unowned";
    const createdBy =
      record?.createdBy && record.createdBy.trim().length > 0
        ? record.createdBy.trim()
        : typeof meta.createdBy === "string" && meta.createdBy.trim().length > 0
          ? meta.createdBy.trim()
          : "unknown";
    return { ownerKey, createdBy };
  }

  private buildStableSelectionBaseId(
    kind: KernelSelection["kind"],
    meta: Record<string, unknown>,
    record?: KernelSelectionRecord
  ): string {
    const { ownerKey, createdBy } = this.selectionIdentityValues(meta, record);
    const ownerToken = this.normalizeSelectionToken(ownerKey);
    const createdByToken = this.normalizeSelectionToken(createdBy);
    const slotToken =
      typeof record?.slot === "string" && record.slot.trim().length > 0
        ? this.normalizeSelectionToken(record.slot)
        : "";
    if (slotToken.length > 0) {
      return `${kind}:${ownerToken}~${createdByToken}.${slotToken}`;
    }
    return this.buildLegacyStableSelectionBaseId(kind, meta, record);
  }

  private buildLegacyStableSelectionBaseId(
    kind: KernelSelection["kind"],
    meta: Record<string, unknown>,
    record?: KernelSelectionRecord
  ): string {
    const { ownerKey, createdBy } = this.selectionIdentityValues(meta, record);
    const ownerToken = this.normalizeSelectionToken(ownerKey);
    const createdByToken = this.normalizeSelectionToken(createdBy);
    const semanticHash = hashValue(
      this.selectionSemanticFingerprint(kind, this.legacySelectionSemanticMeta(meta))
    );
    return `${kind}:${ownerToken}~${createdByToken}.${semanticHash}`;
  }

  private legacySelectionSemanticMeta(meta: Record<string, unknown>): Record<string, unknown> {
    const legacyMeta = { ...meta };
    if (
      typeof legacyMeta.selectionLegacyRole === "string" &&
      legacyMeta.selectionLegacyRole.trim().length > 0
    ) {
      legacyMeta.role = legacyMeta.selectionLegacyRole;
      return legacyMeta;
    }
    if (typeof legacyMeta.selectionSlot === "string" && legacyMeta.selectionSlot.length > 0) {
      delete legacyMeta.role;
    }
    return legacyMeta;
  }

  private selectionSemanticFingerprint(
    kind: KernelSelection["kind"],
    meta: Record<string, unknown>
  ): Record<string, unknown> {
    const featureTags = Array.isArray(meta.featureTags)
      ? meta.featureTags
          .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
          .slice()
          .sort()
      : [];
    return {
      version: 1,
      kind,
      ownerKey: this.stringFingerprint(meta.ownerKey),
      createdBy: this.stringFingerprint(meta.createdBy),
      role: this.stringFingerprint(meta.role),
      planar: typeof meta.planar === "boolean" ? meta.planar : undefined,
      normal: this.stringFingerprint(meta.normal),
      surfaceType: this.stringFingerprint(meta.surfaceType),
      curveType: this.stringFingerprint(meta.curveType),
      featureTags,
    };
  }

  private selectionTieBreakerFingerprint(
    kind: KernelSelection["kind"],
    meta: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      version: 1,
      kind,
      center: this.vectorFingerprint(meta.center),
      centerZ: this.numberFingerprint(meta.centerZ),
      area: this.numberFingerprint(meta.area),
      length: this.numberFingerprint(meta.length),
      radius: this.numberFingerprint(meta.radius),
      normalVec: this.vectorFingerprint(meta.normalVec),
      planeOrigin: this.vectorFingerprint(meta.planeOrigin),
      planeNormal: this.vectorFingerprint(meta.planeNormal),
      planeXDir: this.vectorFingerprint(meta.planeXDir),
      planeYDir: this.vectorFingerprint(meta.planeYDir),
    };
  }

  private makePrismSelectionLedgerPlan(
    axis: [number, number, number],
    opts?: {
      prism?: any;
      wire?: any;
      wireSegmentSlots?: string[];
    }
  ): SelectionLedgerPlan {
    const normalizedAxis = normalizeVector(axis);
    if (!isFiniteVec(normalizedAxis)) {
      return {};
    }
    return {
      faces: (entries) =>
        this.annotatePrismFaceSelections(entries, normalizedAxis, {
          prism: opts?.prism,
          wire: opts?.wire,
          wireSegmentSlots: opts?.wireSegmentSlots,
        }),
    };
  }

  private makeRevolveSelectionLedgerPlan(
    angleRad: number,
    opts: {
      revol: any;
      wire: any;
      wireSegmentSlots: string[];
    }
  ): SelectionLedgerPlan {
    return {
      faces: (entries) =>
        this.annotateRevolveFaceSelections(entries, angleRad, {
          revol: opts.revol,
          wire: opts.wire,
          wireSegmentSlots: opts.wireSegmentSlots,
        }),
    };
  }

  private makeFaceMutationSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    replacements: Array<{ from: KernelSelection; to: any }>
  ): SelectionLedgerPlan {
    const ownerFaces = upstream.selections.filter(
      (selection): selection is KernelSelection =>
        selection.kind === "face" &&
        !!selection.meta["owner"] &&
        this.shapesSame(selection.meta["owner"], ownerShape)
    );
    const replacementSources = new Set(
      replacements
        .map((entry) => entry.from?.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
    return {
      faces: (entries) =>
        this.annotateFaceMutationSelections(entries, ownerFaces, replacements, replacementSources),
    };
  }

  private makeHoleSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    target: KernelSelection,
    centers: Array<[number, number, number]>,
    axisDir: [number, number, number],
    opts: {
      radius: number;
      counterboreRadius: number | null;
      countersink: boolean;
    }
  ): SelectionLedgerPlan {
    const mutationPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []);
    const normalizedAxis = normalizeVector(axisDir);
    return {
      faces: (entries) => {
        mutationPlan.faces?.(entries);
        if (!isFiniteVec(normalizedAxis)) return;
        this.annotateHoleFaceSelections(entries, target, centers, normalizedAxis, opts);
      },
    };
  }

  private makeDraftSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[],
    builder: any
  ): SelectionLedgerPlan {
    const mutationPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []);
    return {
      faces: (entries) => {
        mutationPlan.faces?.(entries);
        this.annotateDraftFaceSelections(entries, faceTargets, builder);
      },
    };
  }

  private makeEdgeModifierSelectionLedgerPlan(
    label: "fillet" | "chamfer",
    upstream: KernelResult,
    ownerShape: any,
    edgeTargets: KernelSelection[],
    builder: any
  ): SelectionLedgerPlan {
    const mutationPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []);
    return {
      faces: (entries) => {
        mutationPlan.faces?.(entries);
        this.annotateEdgeModifierFaceSelections(entries, label, edgeTargets, builder);
      },
      edges: (entries) => {
        this.annotateEdgeModifierEdgeSelections(entries, label, edgeTargets, builder);
      },
    };
  }

  private makeSplitFaceSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[]
  ): SelectionLedgerPlan {
    const mutationPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []);
    return {
      faces: (entries) => {
        mutationPlan.faces?.(entries);
        this.annotateSplitFaceSelections(entries, faceTargets);
      },
    };
  }

  private makeBooleanSelectionLedgerPlan(
    upstream: KernelResult,
    leftShape: any,
    rightShape: any
  ): SelectionLedgerPlan {
    const leftPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, leftShape, []);
    const rightPlan = this.makeFaceMutationSelectionLedgerPlan(upstream, rightShape, []);
    return {
      faces: (entries) => {
        leftPlan.faces?.(entries);
        rightPlan.faces?.(entries);
      },
    };
  }

  private annotateFaceMutationSelections(
    entries: CollectedSubshape[],
    ownerFaces: KernelSelection[],
    replacements: Array<{ from: KernelSelection; to: any }>,
    replacementSources: Set<string>
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);

    const applyHint = (entry: CollectedSubshape, sourceSelection: KernelSelection): void => {
      const hint: SelectionLedgerHint = {
        lineage: { kind: "modified", from: sourceSelection.id },
      };
      const slot = this.selectionSlotForLineage(sourceSelection);
      if (slot) hint.slot = slot;
      const role = this.selectionRoleForLineage(sourceSelection);
      if (role) hint.role = role;
      this.applySelectionLedgerHint(entry, hint);
    };

    const applyLineage = (
      targetShape: any,
      sourceSelection: KernelSelection,
      allowFallback = false
    ): boolean => {
      for (let i = 0; i < unmatched.length; i += 1) {
        const entry = unmatched[i];
        if (!entry || !this.shapesSame(entry.shape, targetShape)) continue;
        applyHint(entry, sourceSelection);
        unmatched.splice(i, 1);
        return true;
      }
      if (!allowFallback) return false;
      const fallbackIndex = this.bestFaceMutationFallbackIndex(unmatched, sourceSelection);
      if (fallbackIndex < 0) return false;
      const fallbackEntry = unmatched[fallbackIndex];
      if (!fallbackEntry) return false;
      applyHint(fallbackEntry, sourceSelection);
      unmatched.splice(fallbackIndex, 1);
      return true;
    };

    for (const replacement of replacements) {
      if (!replacement?.from || !replacement.to) continue;
      applyLineage(replacement.to, replacement.from, true);
    }

    for (const sourceSelection of ownerFaces) {
      if (replacementSources.has(sourceSelection.id)) continue;
      const sourceShape = sourceSelection.meta["shape"];
      if (!sourceShape) continue;
      applyLineage(sourceShape, sourceSelection);
    }
  }

  private bestFaceMutationFallbackIndex(
    entries: CollectedSubshape[],
    sourceSelection: KernelSelection
  ): number {
    if (entries.length === 0) return -1;
    const sourceMeta = sourceSelection.meta;
    const sourceNormal =
      typeof sourceMeta["normal"] === "string" ? (sourceMeta["normal"] as string) : null;
    const sourceSurfaceType =
      typeof sourceMeta["surfaceType"] === "string"
        ? (sourceMeta["surfaceType"] as string)
        : null;
    const sourcePlanar =
      typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
    const sourceArea =
      typeof sourceMeta["area"] === "number" ? (sourceMeta["area"] as number) : null;
    const sourceCenter = this.vectorFingerprint(sourceMeta["center"]);

    const candidates = entries
      .map((entry, index) => {
        if (
          sourceNormal &&
          typeof entry.meta["normal"] === "string" &&
          entry.meta["normal"] !== sourceNormal
        ) {
          return null;
        }
        if (
          sourceSurfaceType &&
          typeof entry.meta["surfaceType"] === "string" &&
          entry.meta["surfaceType"] !== sourceSurfaceType
        ) {
          return null;
        }
        if (
          sourcePlanar !== null &&
          typeof entry.meta["planar"] === "boolean" &&
          entry.meta["planar"] !== sourcePlanar
        ) {
          return null;
        }

        const area =
          typeof entry.meta["area"] === "number" ? (entry.meta["area"] as number) : null;
        const center = this.vectorFingerprint(entry.meta["center"]);
        const areaDelta =
          sourceArea !== null && area !== null ? Math.abs(area - sourceArea) : Number.POSITIVE_INFINITY;
        const centerDelta =
          sourceCenter && center
            ? Math.hypot(
                sourceCenter[0] - center[0],
                sourceCenter[1] - center[1],
                sourceCenter[2] - center[2]
              )
            : Number.POSITIVE_INFINITY;
        return { index, areaDelta, centerDelta };
      })
      .filter(
        (
          candidate
        ): candidate is { index: number; areaDelta: number; centerDelta: number } =>
          candidate !== null
      );

    if (candidates.length === 0) return -1;
    candidates.sort((a, b) => {
      const byArea = a.areaDelta - b.areaDelta;
      if (Math.abs(byArea) > 1e-9) return byArea;
      const byCenter = a.centerDelta - b.centerDelta;
      if (Math.abs(byCenter) > 1e-9) return byCenter;
      return a.index - b.index;
    });
    return candidates[0]?.index ?? -1;
  }

  private annotateHoleFaceSelections(
    entries: CollectedSubshape[],
    target: KernelSelection,
    centers: Array<[number, number, number]>,
    axisDir: [number, number, number],
    opts: {
      radius: number;
      counterboreRadius: number | null;
      countersink: boolean;
    }
  ): void {
    if (entries.length === 0 || centers.length === 0) return;
    const sourceSlot = this.selectionSlotForLineage(target);
    const slotRoot = sourceSlot ? `hole.${sourceSlot}` : "hole.seed";
    const holeTolerance = Math.max(1e-4, opts.radius * 0.1);

    for (const entry of entries) {
      if (entry.ledger?.slot) continue;
      const center = this.vectorFingerprint(entry.meta["center"]);
      if (
        center &&
        !centers.some(
          (origin) => this.distancePointToAxis(center, origin, axisDir) <= holeTolerance
        )
      ) {
        continue;
      }

      const surfaceType = entry.meta["surfaceType"];
      if (
        surfaceType === "cylinder" &&
        typeof entry.meta["radius"] === "number" &&
        this.radiusMatches(entry.meta["radius"] as number, opts.radius)
      ) {
        this.applySelectionLedgerHint(entry, {
          slot: `${slotRoot}.wall`,
          role: "hole",
          lineage: { kind: "modified", from: target.id },
        });
        continue;
      }
      if (
        surfaceType === "cylinder" &&
        opts.counterboreRadius !== null &&
        typeof entry.meta["radius"] === "number" &&
        this.radiusMatches(entry.meta["radius"] as number, opts.counterboreRadius)
      ) {
        this.applySelectionLedgerHint(entry, {
          slot: `${slotRoot}.counterbore`,
          role: "hole",
          lineage: { kind: "modified", from: target.id },
        });
        continue;
      }
      if (surfaceType === "cone" && opts.countersink) {
        this.applySelectionLedgerHint(entry, {
          slot: `${slotRoot}.countersink`,
          role: "hole",
          lineage: { kind: "modified", from: target.id },
        });
      }
    }
  }

  private annotateDraftFaceSelections(
    entries: CollectedSubshape[],
    faceTargets: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.slice();
    for (const target of faceTargets) {
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const modified = this.collectModifiedShapes(builder, sourceShape).flatMap((shape) => {
        const faces = this.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      });
      if (modified.length === 0) continue;
      const sourceSlot = this.selectionSlotForLineage(target);
      const sourceRole = this.selectionRoleForLineage(target);
      for (const candidate of modified) {
        const index = unmatched.findIndex((entry) => this.shapesSame(entry.shape, candidate));
        if (index < 0) continue;
        const [entry] = unmatched.splice(index, 1);
        if (!entry) continue;
        const hint: SelectionLedgerHint = {
          lineage: { kind: "modified", from: target.id },
        };
        if (sourceSlot) hint.slot = sourceSlot;
        if (sourceRole) hint.role = sourceRole;
        this.applySelectionLedgerHint(entry, hint);
        break;
      }
    }
  }

  private annotateEdgeModifierFaceSelections(
    entries: CollectedSubshape[],
    label: "fillet" | "chamfer",
    edgeTargets: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < edgeTargets.length; i += 1) {
      const target = edgeTargets[i];
      if (!target) continue;
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const slotRoot = this.selectionSlotForLineage(target)
        ? `${label}.${this.selectionSlotForLineage(target)}`
        : `${label}.seed.${i + 1}`;
      const generated = this.collectGeneratedShapes(builder, sourceShape).flatMap((shape) => {
        const faces = this.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      });
      if (generated.length === 0) continue;
      let generatedIndex = 0;
      for (const candidate of generated) {
        const index = unmatched.findIndex((entry) => this.shapesSame(entry.shape, candidate));
        if (index < 0) continue;
        const [entry] = unmatched.splice(index, 1);
        if (!entry) continue;
        generatedIndex += 1;
        const hint: SelectionLedgerHint = {
          role: label,
          lineage: { kind: "modified", from: target.id },
          slot: generatedIndex === 1 ? slotRoot : `${slotRoot}.part.${generatedIndex}`,
        };
        this.applySelectionLedgerHint(entry, hint);
      }
    }
  }

  private annotateEdgeModifierEdgeSelections(
    entries: CollectedSubshape[],
    label: "fillet" | "chamfer",
    edgeTargets: KernelSelection[],
    builder: any
  ): void {
    const unmatched = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < edgeTargets.length; i += 1) {
      const target = edgeTargets[i];
      if (!target) continue;
      const sourceShape = target.meta["shape"];
      if (!sourceShape) continue;
      const slotRoot = this.selectionSlotForLineage(target)
        ? `${label}.${this.selectionSlotForLineage(target)}`
        : `${label}.seed.${i + 1}`;
      const descendantEdges = this.uniqueShapeList(
        this.collectGeneratedShapes(builder, sourceShape).flatMap((shape) => {
          const faces = this.collectFacesFromShape(shape);
          if (faces.length > 0) {
            return faces.flatMap((face) => this.collectEdgesFromShape(face));
          }
          const edges = this.collectEdgesFromShape(shape);
          return edges.length > 0 ? edges : [shape];
        })
      );
      if (descendantEdges.length === 0) continue;

      const matched: CollectedSubshape[] = [];
      for (const candidate of descendantEdges) {
        const index = unmatched.findIndex((entry) => this.shapesSame(entry.shape, candidate));
        if (index < 0) continue;
        const [entry] = unmatched.splice(index, 1);
        if (!entry) continue;
        matched.push(entry);
      }
      if (matched.length === 0) continue;

      matched.sort((a, b) => {
        const aTie = hashValue(this.selectionTieBreakerFingerprint("edge", a.meta));
        const bTie = hashValue(this.selectionTieBreakerFingerprint("edge", b.meta));
        const byTie = aTie.localeCompare(bTie);
        if (byTie !== 0) return byTie;
        return this.shapeHash(a.shape) - this.shapeHash(b.shape);
      });

      for (let edgeIndex = 0; edgeIndex < matched.length; edgeIndex += 1) {
        const entry = matched[edgeIndex];
        if (!entry) continue;
        this.applySelectionLedgerHint(entry, {
          role: "edge",
          lineage: { kind: "modified", from: target.id },
          slot: `${slotRoot}.edge.${edgeIndex + 1}`,
        });
      }
    }
  }

  private annotateSplitFaceSelections(
    entries: CollectedSubshape[],
    faceTargets: KernelSelection[]
  ): void {
    const remaining = entries.filter((entry) => !entry.ledger?.slot);
    for (let i = 0; i < faceTargets.length; i += 1) {
      const target = faceTargets[i];
      if (!target) continue;
      const slotRoot = this.selectionSlotForLineage(target)
        ? `split.${this.selectionSlotForLineage(target)}`
        : `split.seed.${i + 1}`;
      const sourceRole = this.selectionRoleForLineage(target);
      const ranked = remaining
        .map((entry) => ({
          entry,
          ordering: this.splitBranchOrdering(entry, target),
        }))
        .filter(
          (
            candidate
          ): candidate is {
            entry: CollectedSubshape;
            ordering: [number, number, number];
          } => candidate.ordering !== null
        )
        .sort((a, b) => {
          const byX = a.ordering[0] - b.ordering[0];
          if (Math.abs(byX) > 1e-9) return byX;
          const byY = a.ordering[1] - b.ordering[1];
          if (Math.abs(byY) > 1e-9) return byY;
          const byZ = a.ordering[2] - b.ordering[2];
          if (Math.abs(byZ) > 1e-9) return byZ;
          return 0;
        });
      for (let branchIndex = 0; branchIndex < ranked.length; branchIndex += 1) {
        const current = ranked[branchIndex];
        if (!current) continue;
        const remainingIndex = remaining.indexOf(current.entry);
        if (remainingIndex >= 0) {
          remaining.splice(remainingIndex, 1);
        }
        const hint: SelectionLedgerHint = {
          slot: `${slotRoot}.branch.${branchIndex + 1}`,
          lineage: {
            kind: "split",
            from: target.id,
            branch: `${branchIndex + 1}`,
          },
        };
        if (sourceRole) {
          hint.role = sourceRole;
        }
        this.applySelectionLedgerHint(current.entry, hint);
      }
    }
  }

  private radiusMatches(actual: number, expected: number): boolean {
    const tolerance = Math.max(1e-4, Math.abs(expected) * 1e-4);
    return Math.abs(actual - expected) <= tolerance;
  }

  private distancePointToAxis(
    point: [number, number, number],
    origin: [number, number, number],
    axisDir: [number, number, number]
  ): number {
    const relative = this.subVec(point, origin);
    const projection = this.scaleVec(axisDir, dot(relative, axisDir));
    return vecLength(this.subVec(relative, projection));
  }

  private selectionSlotForLineage(selection: KernelSelection): string | undefined {
    if (typeof selection.record?.slot === "string" && selection.record.slot.trim().length > 0) {
      return selection.record.slot.trim();
    }
    const metaSlot = selection.meta["selectionSlot"];
    if (typeof metaSlot === "string" && metaSlot.trim().length > 0) {
      return metaSlot.trim();
    }
    return undefined;
  }

  private selectionRoleForLineage(selection: KernelSelection): string | undefined {
    if (typeof selection.record?.role === "string" && selection.record.role.trim().length > 0) {
      return selection.record.role.trim();
    }
    const metaRole = selection.meta["role"];
    if (typeof metaRole === "string" && metaRole.trim().length > 0) {
      return metaRole.trim();
    }
    return undefined;
  }

  private splitBranchOrdering(
    entry: CollectedSubshape,
    sourceSelection: KernelSelection
  ): [number, number, number] | null {
    const sourceMeta = sourceSelection.meta;
    const sourceSurfaceType =
      typeof sourceMeta["surfaceType"] === "string"
        ? (sourceMeta["surfaceType"] as string)
        : null;
    const entrySurfaceType =
      typeof entry.meta["surfaceType"] === "string"
        ? (entry.meta["surfaceType"] as string)
        : null;
    if (sourceSurfaceType && entrySurfaceType && sourceSurfaceType !== entrySurfaceType) {
      return null;
    }

    const sourcePlanar =
      typeof sourceMeta["planar"] === "boolean" ? (sourceMeta["planar"] as boolean) : null;
    const entryPlanar =
      typeof entry.meta["planar"] === "boolean" ? (entry.meta["planar"] as boolean) : null;
    if (sourcePlanar !== null && entryPlanar !== null && sourcePlanar !== entryPlanar) {
      return null;
    }

    const sourceNormal = this.vectorFingerprint(
      sourceMeta["planeNormal"] ?? sourceMeta["normalVec"]
    );
    const entryNormal = this.vectorFingerprint(
      entry.meta["planeNormal"] ?? entry.meta["normalVec"]
    );
    if (sourceNormal && entryNormal) {
      const sourceNormalUnit = normalizeVector(sourceNormal);
      const entryNormalUnit = normalizeVector(entryNormal);
      if (Math.abs(dot(sourceNormalUnit, entryNormalUnit)) < 0.999) {
        return null;
      }
    }

    const sourcePlaneOrigin = this.vectorFingerprint(sourceMeta["planeOrigin"]);
    const entryPlaneOrigin = this.vectorFingerprint(entry.meta["planeOrigin"]);
    if (sourcePlaneOrigin && entryPlaneOrigin && sourceNormal) {
      const delta = this.subVec(entryPlaneOrigin, sourcePlaneOrigin);
      if (Math.abs(dot(delta, normalizeVector(sourceNormal))) > 1e-4) {
        return null;
      }
    }

    const center = this.vectorFingerprint(entry.meta["center"]);
    if (!center) return null;

    const origin = sourcePlaneOrigin ?? this.vectorFingerprint(sourceMeta["center"]) ?? [0, 0, 0];
    const normal =
      this.vectorFingerprint(sourceMeta["planeNormal"] ?? sourceMeta["normalVec"]) ?? [0, 0, 1];
    const xSeed =
      this.vectorFingerprint(sourceMeta["planeXDir"]) ?? this.defaultAxisForNormal(normal);
    const xDir = normalizeVector(xSeed);
    const ySeed = this.vectorFingerprint(sourceMeta["planeYDir"]) ?? cross(normalizeVector(normal), xDir);
    const yDir = normalizeVector(ySeed);
    const relative = this.subVec(center, origin);
    const x = dot(relative, xDir);
    const y = dot(relative, yDir);
    const z = typeof entry.meta["centerZ"] === "number" ? (entry.meta["centerZ"] as number) : center[2];
    return [x, y, z];
  }

  private annotatePrismFaceSelections(
    entries: CollectedSubshape[],
    axis: [number, number, number],
    opts?: {
      prism?: any;
      wire?: any;
      wireSegmentSlots?: string[];
    }
  ): void {
    if (entries.length === 0) return;
    const centers = entries
      .map((entry) => this.vectorFingerprint(entry.meta.center))
      .filter((center): center is [number, number, number] => Array.isArray(center));
    const centroid =
      centers.length > 0
        ? ([
            centers.reduce((sum, center) => sum + center[0], 0) / centers.length,
            centers.reduce((sum, center) => sum + center[1], 0) / centers.length,
            centers.reduce((sum, center) => sum + center[2], 0) / centers.length,
          ] as [number, number, number])
        : ([0, 0, 0] as [number, number, number]);

    const caps: Array<{ entry: CollectedSubshape; projection: number }> = [];
    const sideEntries: CollectedSubshape[] = [];
    for (const entry of entries) {
      const center = this.vectorFingerprint(entry.meta.center) ?? centroid;
      const projection = dot(this.subVec(center, centroid), axis);
      const normalVec = this.vectorFingerprint(entry.meta.normalVec);
      const alignment = normalVec ? Math.abs(dot(normalizeVector(normalVec), axis)) : 0;
      if (alignment > 0.98) {
        caps.push({ entry, projection });
        continue;
      }
      sideEntries.push(entry);
    }

    caps.sort((a, b) => a.projection - b.projection);

    const bottom = caps[0]?.entry;
    const top = caps[caps.length - 1]?.entry;
    if (bottom) {
      this.applySelectionLedgerHint(bottom, {
        slot: "bottom",
        role: "bottom",
        lineage: { kind: "created" },
      });
    }
    if (top && top !== bottom) {
      this.applySelectionLedgerHint(top, {
        slot: "top",
        role: "top",
        lineage: { kind: "created" },
      });
    }

    if (sideEntries.length === 0) return;
    const historyApplied =
      opts?.prism && opts?.wire && Array.isArray(opts.wireSegmentSlots)
        ? this.applyPrismHistorySideSlots(
            sideEntries,
            opts.prism,
            opts.wire,
            opts.wireSegmentSlots
          )
        : false;
    if (historyApplied) return;

    const basis = this.basisFromNormal(axis, undefined, centroid);
    const ranked = sideEntries
      .map((entry) => {
        const center = this.vectorFingerprint(entry.meta.center) ?? centroid;
        const relative = this.subVec(center, centroid);
        const radial = this.subVec(relative, this.scaleVec(axis, dot(relative, axis)));
        const x = dot(radial, basis.xDir);
        const y = dot(radial, basis.yDir);
        const angle = Number.isFinite(x) && Number.isFinite(y) ? Math.atan2(y, x) : 0;
        const height = dot(relative, axis);
        const area = this.numberFingerprint(entry.meta.area) ?? 0;
        return { entry, angle, height, area };
      })
      .sort((a, b) => {
        const byAngle = a.angle - b.angle;
        if (byAngle !== 0) return byAngle;
        const byHeight = a.height - b.height;
        if (byHeight !== 0) return byHeight;
        return b.area - a.area;
      });

    for (let i = 0; i < ranked.length; i += 1) {
      const current = ranked[i];
      if (!current) continue;
      this.applySelectionLedgerHint(current.entry, {
        slot: `side.${i + 1}`,
        role: "side",
        lineage: { kind: "created" },
      });
    }
  }

  private annotateRevolveFaceSelections(
    entries: CollectedSubshape[],
    _angleRad: number,
    opts: {
      revol: any;
      wire: any;
      wireSegmentSlots: string[];
    }
  ): void {
    if (entries.length === 0) return;
    this.applyGeneratedDerivedFaceSlots(
      entries,
      opts.revol,
      opts.wire,
      opts.wireSegmentSlots,
      "profile"
    );
  }

  private applyPrismHistorySideSlots(
    sideEntries: CollectedSubshape[],
    prism: any,
    wire: any,
    wireSegmentSlots: string[]
  ): boolean {
    return this.applyGeneratedDerivedFaceSlots(sideEntries, prism, wire, wireSegmentSlots, "side");
  }

  private applyGeneratedDerivedFaceSlots(
    entries: CollectedSubshape[],
    builder: any,
    wire: any,
    wireSegmentSlots: string[],
    slotPrefix: string
  ): boolean {
    const wireEdges = this.collectWireEdgesInOrder(wire);
    if (wireEdges.length === 0 || wireEdges.length !== wireSegmentSlots.length) {
      return false;
    }

    const remaining = entries.slice();
    let assigned = 0;
    for (let i = 0; i < wireEdges.length; i += 1) {
      const sourceEdge = wireEdges[i];
      const segmentSlot = wireSegmentSlots[i];
      if (!sourceEdge || typeof segmentSlot !== "string" || segmentSlot.trim().length === 0) {
        continue;
      }
      const generated = this.collectGeneratedShapes(builder, sourceEdge).flatMap((shape) => {
        const faces = this.collectFacesFromShape(shape);
        return faces.length > 0 ? faces : [shape];
      });
      const face = generated.find((candidate) =>
        remaining.some((entry) => this.shapesSame(entry.shape, candidate))
      );
      if (!face) continue;
      const index = remaining.findIndex((entry) => this.shapesSame(entry.shape, face));
      if (index < 0) continue;
      const [entry] = remaining.splice(index, 1);
      if (!entry) continue;
      this.applySelectionLedgerHint(entry, {
        slot: `${slotPrefix}.${segmentSlot.trim()}`,
        role: slotPrefix,
        lineage: { kind: "created" },
      });
      assigned += 1;
    }

    if (assigned === 0) {
      return false;
    }

    for (let i = 0; i < remaining.length; i += 1) {
      const entry = remaining[i];
      if (!entry) continue;
      this.applySelectionLedgerHint(entry, {
        slot: `${slotPrefix}.fallback.${i + 1}`,
        role: slotPrefix,
        lineage: { kind: "created" },
      });
    }
    return true;
  }

  private collectWireEdgesInOrder(wire: any): any[] {
    const occt = this.occt as any;
    const edges: any[] = [];
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(this.toWire(wire), occt.TopAbs_ShapeEnum.TopAbs_EDGE, occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; explorer.More(); explorer.Next()) {
      edges.push(explorer.Current());
    }
    return edges;
  }

  private collectGeneratedShapes(builder: any, source: any): any[] {
    return this.collectHistoryShapes(builder, ["Generated", "Generated_1"], source);
  }

  private collectModifiedShapes(builder: any, source: any): any[] {
    return this.collectHistoryShapes(builder, ["Modified", "Modified_1"], source);
  }

  private collectHistoryShapes(
    builder: any,
    methodNames: string[],
    source: any
  ): any[] {
    let generated: any;
    try {
      generated = this.callWithFallback(builder, methodNames, [[source]]);
    } catch {
      return [];
    }
    if (!generated) return [];
    if (typeof generated.Size === "function") {
      return this.drainShapeList(generated);
    }
    return [generated];
  }

  private drainShapeList(list: any): any[] {
    const shapes: any[] = [];
    let size = this.readShapeListSize(list);
    let guard = 0;
    while (size > 0 && guard < 1024) {
      let first: any;
      try {
        first = this.callWithFallback(list, ["First_1", "First_2", "First"], [[], []]);
      } catch {
        break;
      }
      if (first) {
        shapes.push(first);
      }
      try {
        this.callWithFallback(list, ["RemoveFirst", "RemoveFirst_1"], [[], []]);
      } catch {
        break;
      }
      size = this.readShapeListSize(list);
      guard += 1;
    }
    return shapes;
  }

  private readShapeListSize(list: any): number {
    try {
      const size = this.callWithFallback(list, ["Size", "Size_1"], [[], []]);
      return typeof size === "number" && Number.isFinite(size) ? size : 0;
    } catch {
      return 0;
    }
  }

  private normalizeSelectionToken(value: string): string {
    return value
      .trim()
      .replace(/[^A-Za-z0-9_-]+/g, ".")
      .replace(/\.+/g, ".")
      .replace(/^\.|\.$/g, "")
      .slice(0, 96);
  }

  private stringFingerprint(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private numberFingerprint(value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    return Number(value.toFixed(6));
  }

  private vectorFingerprint(value: unknown): [number, number, number] | undefined {
    if (!Array.isArray(value) || value.length !== 3) return undefined;
    const out: number[] = [];
    for (const entry of value) {
      if (typeof entry !== "number" || !Number.isFinite(entry)) return undefined;
      out.push(Number(entry.toFixed(6)));
    }
    return out as [number, number, number];
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
    if (surfaceType === "cylinder") {
      const cylinder = this.cylinderFromFace(face);
      if (cylinder && Number.isFinite(cylinder.radius) && cylinder.radius > 0) {
        meta.radius = cylinder.radius;
      }
    }
    if (planar) {
      try {
        const plane = this.planeBasisFromFace(face);
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
    let length: number | undefined;
    try {
      const props = this.newOcct("GProp_GProps");
      const edgeHandle = this.toEdge(edge);
      const occt = this.occt as any;
      if (occt.BRepGProp?.LinearProperties_1) {
        occt.BRepGProp.LinearProperties_1(edgeHandle, props, true);
        const measured = this.callNumber(props, "Mass");
        if (Number.isFinite(measured) && measured > 0) {
          length = measured;
        }
      }
    } catch {
      // Keep metadata lean if edge length extraction fails.
    }

    let radius: number | undefined;
    let curveType: string | undefined;
    try {
      const adaptor = this.newOcct("BRepAdaptor_Curve", this.toEdge(edge));
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const types = (this.occt as any).GeomAbs_CurveType;
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
        const circle = this.callWithFallback(adaptor, ["Circle", "Circle_1"], [[]]);
        const measuredRadius = circle
          ? this.callWithFallback(circle, ["Radius", "Radius_1"], [[]])
          : null;
        if (
          typeof measuredRadius === "number" &&
          Number.isFinite(measuredRadius) &&
          measuredRadius > 0
        ) {
          radius = measuredRadius;
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
    if (length !== undefined) meta.length = length;
    if (radius !== undefined) meta.radius = radius;
    if (curveType) meta.curveType = curveType;
    return meta;
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

  private listFaces(shape: any): any[] {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const faces: any[] = [];
    for (; explorer.More(); explorer.Next()) {
      faces.push(this.toFace(explorer.Current()));
    }
    return faces;
  }

  private countFaces(shape: any): number {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    let count = 0;
    for (; explorer.More(); explorer.Next()) count += 1;
    return count;
  }

  private makeCompoundFromShapes(shapes: any[]): any {
    if (shapes.length === 0) {
      throw new Error("OCCT backend: cannot create compound from empty shape list");
    }
    if (shapes.length === 1) return shapes[0];
    const compound = this.newOcct("TopoDS_Compound");
    const builder = this.newOcct("BRep_Builder");
    this.callWithFallback(builder, ["MakeCompound", "MakeCompound_1"], [[compound]]);
    for (const shape of shapes) {
      this.callWithFallback(builder, ["Add", "Add_1"], [[compound, shape]]);
    }
    return compound;
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
    xDir?: [number, number, number];
    yDir?: [number, number, number];
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
      const position = this.callWithFallback(
        cylinder,
        ["Position", "Position_1", "Position_2"],
        [[]]
      );
      let xDir: [number, number, number] | undefined;
      let yDir: [number, number, number] | undefined;
      if (position) {
        const x = this.callWithFallback(position, ["XDirection", "XDirection_1"], [[]]);
        const y = this.callWithFallback(position, ["YDirection", "YDirection_1"], [[]]);
        if (x) xDir = this.dirToArray(x);
        if (y) yDir = this.dirToArray(y);
      }
      const radius = this.callWithFallback(cylinder, ["Radius", "Radius_1"], [[]]);
      if (!dir || !loc || typeof radius !== "number") return null;
      return {
        origin: this.pointToArray(loc),
        axis: this.dirToArray(dir),
        xDir,
        yDir,
        radius,
      };
    } catch {
      return null;
    }
  }

  private cylinderReferenceXDirection(cylinder: {
    axis: [number, number, number];
    xDir?: [number, number, number];
    yDir?: [number, number, number];
  }): [number, number, number] {
    const axis = normalizeVector(cylinder.axis);
    if (!isFiniteVec(axis)) return [1, 0, 0];

    const candidates: Array<[number, number, number] | undefined> = [
      cylinder.xDir,
      cylinder.yDir ? cross(cylinder.yDir, axis) : undefined,
      Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0],
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const projected = this.subVec(candidate, this.scaleVec(axis, dot(candidate, axis)));
      const normalized = normalizeVector(projected);
      if (isFiniteVec(normalized)) return normalized;
    }
    return [1, 0, 0];
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

  private surfaceUvExtents(
    face: any
  ): { uMin: number; uMax: number; vMin: number; vMax: number } | null {
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const u0 = this.callNumber(adaptor, "FirstUParameter");
      const u1 = this.callNumber(adaptor, "LastUParameter");
      const v0 = this.callNumber(adaptor, "FirstVParameter");
      const v1 = this.callNumber(adaptor, "LastVParameter");
      if (![u0, u1, v0, v1].every((value) => Number.isFinite(value))) {
        return null;
      }
      return {
        uMin: Math.min(u0, u1),
        uMax: Math.max(u0, u1),
        vMin: Math.min(v0, v1),
        vMax: Math.max(v0, v1),
      };
    } catch {
      return null;
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

  private throughAllDepth(
    shape: any,
    axisDir: [number, number, number],
    origin?: [number, number, number]
  ): number {
    if (origin) {
      const byBounds = this.depthToBodyLimitByBounds(shape, axisDir, origin, "last");
      if (byBounds !== null) return byBounds;
    }
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

  private countSolids(shape: any): number {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_SOLID,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    let count = 0;
    for (; explorer.More(); explorer.Next()) {
      count += 1;
    }
    return count;
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
    return this.countSolids(shape) > 0;
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

  private deleteFacesWithDefeaturing(shape: any, removeFaces: any[]): any | null {
    let builder: any;
    try {
      builder = this.newOcct("BRepAlgoAPI_Defeaturing", shape);
    } catch {
      try {
        builder = this.newOcct("BRepAlgoAPI_Defeaturing");
      } catch {
        return null;
      }
      try {
        this.callWithFallback(builder, ["SetShape", "SetShape_1"], [[shape]]);
      } catch {
        return null;
      }
    }

    const faceList = this.makeShapeList(removeFaces.map((face) => this.toFace(face)));
    let added = false;
    try {
      this.callWithFallback(
        builder,
        ["AddFacesToRemove", "AddFacesToRemove_1", "SetFacesToRemove", "SetFacesToRemove_1"],
        [[faceList]]
      );
      added = true;
    } catch {
      // Fall back to adding faces one-by-one.
    }
    if (!added) {
      for (const face of removeFaces) {
        try {
          this.callWithFallback(
            builder,
            ["AddFaceToRemove", "AddFaceToRemove_1", "AddFace", "AddFace_1", "Add", "Add_1"],
            [[this.toFace(face)]]
          );
          added = true;
        } catch {
          // Try next method/face.
        }
      }
    }
    if (!added) return null;

    try {
      this.tryBuild(builder);
      return this.readShape(builder);
    } catch {
      return null;
    }
  }

  private deleteFacesBySewing(shape: any, removeFaces: any[]): any | null {
    const occt = this.occt as any;
    let sewing: any;
    try {
      sewing = this.newOcct("BRepBuilderAPI_Sewing", 1e-6, true, true, true, false);
    } catch {
      try {
        sewing = this.newOcct("BRepBuilderAPI_Sewing");
      } catch {
        return null;
      }
    }
    const add =
      typeof sewing.Add_1 === "function"
        ? sewing.Add_1.bind(sewing)
        : typeof sewing.Add === "function"
          ? sewing.Add.bind(sewing)
          : null;
    if (!add) return null;

    let kept = 0;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; explorer.More(); explorer.Next()) {
      const face = this.toFace(explorer.Current());
      if (this.containsShape(removeFaces, face)) {
        continue;
      }
      try {
        add(face);
        kept += 1;
      } catch {
        continue;
      }
    }
    if (kept === 0) return null;

    try {
      const progress = this.makeProgressRange();
      if (progress !== null && progress !== undefined) {
        sewing.Perform(progress);
      } else {
        sewing.Perform();
      }
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

  private replaceFacesWithReshape(
    shape: any,
    replacements: Array<{ from: any; to: any }>
  ): any | null {
    let reshape: any;
    try {
      reshape = this.newOcct("BRepTools_ReShape");
    } catch {
      try {
        reshape = this.newOcct("ShapeBuild_ReShape");
      } catch {
        return null;
      }
    }

    let replacedAny = false;
    for (const replacement of replacements) {
      const fromFace = this.toFace(replacement.from);
      const toFace = this.toFace(replacement.to);
      try {
        this.callWithFallback(reshape, ["Replace", "Replace_1"], [
          [fromFace, toFace],
          [fromFace, toFace, true],
          [fromFace, toFace, false],
        ]);
        replacedAny = true;
      } catch {
        continue;
      }
    }
    if (!replacedAny) return null;

    try {
      return this.callWithFallback(reshape, ["Apply", "Apply_1"], [[shape]]);
    } catch {
      return null;
    }
  }

  private replaceFacesBySewing(
    shape: any,
    removeFaces: any[],
    replacementFaces: any[]
  ): any | null {
    const occt = this.occt as any;
    let sewing: any;
    try {
      sewing = this.newOcct("BRepBuilderAPI_Sewing", 1e-6, true, true, true, false);
    } catch {
      try {
        sewing = this.newOcct("BRepBuilderAPI_Sewing");
      } catch {
        return null;
      }
    }
    const add =
      typeof sewing.Add_1 === "function"
        ? sewing.Add_1.bind(sewing)
        : typeof sewing.Add === "function"
          ? sewing.Add.bind(sewing)
          : null;
    if (!add) return null;

    const facesToRemove = this.uniqueShapeList(removeFaces);
    let added = 0;

    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; explorer.More(); explorer.Next()) {
      const face = this.toFace(explorer.Current());
      if (this.containsShape(facesToRemove, face)) continue;
      try {
        add(face);
        added += 1;
      } catch {
        continue;
      }
    }
    for (const face of replacementFaces) {
      try {
        add(this.toFace(face));
        added += 1;
      } catch {
        continue;
      }
    }
    if (added === 0) return null;

    try {
      const progress = this.makeProgressRange();
      if (progress !== null && progress !== undefined) {
        sewing.Perform(progress);
      } else {
        sewing.Perform();
      }
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

  private uniqueFaceShapes(selections: KernelSelection[]): any[] {
    const faces: any[] = [];
    for (const selection of selections) {
      const shape = selection.meta["shape"];
      if (!shape) continue;
      faces.push(this.toFace(shape));
    }
    return this.uniqueShapeList(faces);
  }

  private collectToolFaces(selections: KernelSelection[]): any[] {
    const faces: any[] = [];
    for (const selection of selections) {
      const shape = selection.meta["shape"];
      if (!shape) continue;
      if (selection.kind === "face") {
        faces.push(this.toFace(shape));
        continue;
      }
      if (selection.kind === "surface") {
        faces.push(...this.collectFacesFromShape(shape));
      }
    }
    return this.uniqueShapeList(faces);
  }

  private collectFacesFromShape(shape: any): any[] {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const faces: any[] = [];
    for (; explorer.More(); explorer.Next()) {
      faces.push(this.toFace(explorer.Current()));
    }
    return faces;
  }

  private collectEdgesFromShape(shape: any): any[] {
    const occt = this.occt as any;
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_EDGE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    const edges: any[] = [];
    for (; explorer.More(); explorer.Next()) {
      edges.push(this.toEdge(explorer.Current()));
    }
    return edges;
  }

  private uniqueShapeList(shapes: any[]): any[] {
    const unique: any[] = [];
    for (const shape of shapes) {
      if (this.containsShape(unique, shape)) continue;
      unique.push(shape);
    }
    return unique;
  }

  private containsShape(candidates: any[], shape: any): boolean {
    const hash = this.shapeHash(shape);
    for (const candidate of candidates) {
      if (this.shapeHash(candidate) !== hash) continue;
      if (this.shapesSame(candidate, shape)) return true;
    }
    return false;
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
      try {
        const target = resolve(planeRef as Selector, upstream);
        if (target.kind !== "face") {
          throw new Error("OCCT backend: plane reference must resolve to a face");
        }
        const face = target.meta["shape"];
        if (!face) {
          throw new Error("OCCT backend: plane reference missing face shape");
        }
        return this.planeBasisFromFace(face);
      } catch (err) {
        if ((planeRef as Selector).kind === "selector.named") {
          const selector = planeRef as { kind: "selector.named"; name: string };
          const fallback = this.namedPlaneBasisFallback(selector.name, upstream);
          if (fallback) return fallback;
        }
        throw err;
      }
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

  private namedPlaneBasisFallback(name: string, upstream: KernelResult): PlaneBasis | null {
    const canonical = this.canonicalPlaneBasis(name);
    if (canonical) return canonical;
    return this.namedDatumPlaneBasis(name, upstream);
  }

  private canonicalPlaneBasis(name: string): PlaneBasis | null {
    const normalized = name.trim().toLowerCase();
    if (normalized === "top") {
      return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 1, 0], normal: [0, 0, 1] };
    }
    if (normalized === "bottom") {
      return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, -1, 0], normal: [0, 0, -1] };
    }
    if (normalized === "front") {
      return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, -1], normal: [0, 1, 0] };
    }
    if (normalized === "back") {
      return { origin: [0, 0, 0], xDir: [1, 0, 0], yDir: [0, 0, 1], normal: [0, -1, 0] };
    }
    if (normalized === "right") {
      return { origin: [0, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, 1], normal: [1, 0, 0] };
    }
    if (normalized === "left") {
      return { origin: [0, 0, 0], xDir: [0, 1, 0], yDir: [0, 0, -1], normal: [-1, 0, 0] };
    }
    return null;
  }

  private namedDatumPlaneBasis(name: string, upstream: KernelResult): PlaneBasis | null {
    const tokens = this.namedDatumKeys(name);
    for (const key of tokens) {
      const datum = upstream.outputs.get(key);
      if (!datum || datum.kind !== "datum") continue;
      const meta = datum.meta as Record<string, unknown>;
      if (meta.type !== "plane" && meta.type !== "frame") continue;
      return {
        origin: meta.origin as [number, number, number],
        xDir: meta.xDir as [number, number, number],
        yDir: meta.yDir as [number, number, number],
        normal: meta.normal as [number, number, number],
      };
    }
    return null;
  }

  private namedDatumKeys(name: string): string[] {
    const trimmed = name.trim();
    if (!trimmed) return [];
    const keys = new Set<string>();
    if (trimmed.startsWith("datum:")) {
      keys.add(trimmed);
    } else {
      keys.add(this.datumKey(trimmed));
    }
    return Array.from(keys);
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
      if (profile.face) {
        const basis = this.planeBasisFromFace(profile.face);
        return normalizeVector(basis.normal);
      }
      if (profile.planeNormal) {
        const normalized = normalizeVector(profile.planeNormal);
        if (isFiniteVec(normalized)) return normalized;
      }
      throw new Error("OCCT backend: sketch normal requires a sketch profile");
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

  private segmentSlotsForLoop(
    loop: ID[],
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis
  ): string[] {
    const slots: string[] = [];
    for (const id of loop) {
      const entity = entityMap.get(id);
      if (!entity) {
        throw new Error(`OCCT backend: sketch entity ${id} not found`);
      }
      for (const segment of this.sketchEntityToSegments(entity, plane)) {
        slots.push(segment.sourceSlot ?? entity.id);
      }
    }
    return slots;
  }

  private withEntitySegmentSlots(entityId: string, segments: EdgeSegment[]): EdgeSegment[] {
    if (segments.length <= 1) {
      return segments.map((segment) => ({ ...segment, sourceSlot: entityId }));
    }
    return segments.map((segment, index) => ({
      ...segment,
      sourceSlot: `${entityId}.${index + 1}`,
    }));
  }

  private sketchEntityToSegments(entity: SketchEntity, plane: PlaneBasis): EdgeSegment[] {
    switch (entity.kind) {
      case "sketch.line": {
        const start = this.point2To3(entity.start, plane);
        const end = this.point2To3(entity.end, plane);
        return this.withEntitySegmentSlots(entity.id, [
          {
            edge: this.makeLineEdge(start, end),
            start,
            end,
          },
        ]);
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
        return this.withEntitySegmentSlots(entity.id, [
          {
            edge: this.makeArcEdge(start, mid, end),
            start,
            end,
          },
        ]);
      }
      case "sketch.circle": {
        const center = this.point2To3(entity.center, plane);
        const radius = expectNumber(entity.radius, "sketch circle radius");
        return this.withEntitySegmentSlots(entity.id, [
          {
            edge: this.makeCircleEdge(center, radius, plane.normal),
            start: center,
            end: center,
            closed: true,
          },
        ]);
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
        return this.withEntitySegmentSlots(entity.id, [
          {
            edge: this.makeEllipseEdge(center, xDir, plane.normal, major, minor),
            start: center,
            end: center,
            closed: true,
          },
        ]);
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
        return this.withEntitySegmentSlots(entity.id, segments);
      }
      case "sketch.slot": {
        return this.withEntitySegmentSlots(entity.id, this.slotSegments(entity, plane));
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
        return this.withEntitySegmentSlots(entity.id, segments);
      }
      case "sketch.spline": {
        const { edge, start, end, closed } = this.makeSplineEdge(entity, plane);
        return this.withEntitySegmentSlots(entity.id, [
          {
            edge,
            start,
            end,
            closed,
          },
        ]);
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

  private transformShapeScale(
    shape: any,
    origin: [number, number, number],
    factor: number
  ) {
    const trsf = this.newOcct("gp_Trsf");
    const pnt = this.makePnt(origin[0], origin[1], origin[2]);
    this.callWithFallback(trsf, ["SetScale", "SetScale_1"], [[pnt, factor]]);
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

  private buildFaceSurfaceMap(shape: any): FaceSurfaceMap | null {
    const occt = this.occt as any;
    if (!occt.TopExp_Explorer_1) return null;
    const surfaces: FaceSurfaceMap = new Map();
    const explorer = new occt.TopExp_Explorer_1();
    explorer.Init(
      shape,
      occt.TopAbs_ShapeEnum.TopAbs_FACE,
      occt.TopAbs_ShapeEnum.TopAbs_SHAPE
    );
    for (; explorer.More(); explorer.Next()) {
      const face = this.toFace(explorer.Current());
      const hash = this.shapeHash(face);
      const bucket = surfaces.get(hash) ?? [];
      if (!bucket.some((entry) => this.shapesSame(entry.face, face))) {
        bucket.push({
          face,
          surface: this.faceSurfaceClass(face),
        });
      }
      if (!surfaces.has(hash)) surfaces.set(hash, bucket);
    }
    return surfaces;
  }

  private faceSurfaceClass(face: any): FaceSurfaceClass {
    try {
      const faceHandle = this.toFace(face);
      const adaptor = this.newOcct("BRepAdaptor_Surface", faceHandle, true);
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const types = (this.occt as any).GeomAbs_SurfaceType;
      if (!types || typeof type?.value !== "number") return "unknown";
      const value = type.value;
      const matches = (entry: { value?: number } | undefined) =>
        typeof entry?.value === "number" && entry.value === value;
      if (matches(types.GeomAbs_Plane)) return "plane";
      if (matches(types.GeomAbs_Cylinder)) return "cylinder";
      if (matches(types.GeomAbs_Cone)) return "cone";
      if (matches(types.GeomAbs_Sphere)) return "sphere";
      if (matches(types.GeomAbs_Torus)) return "torus";
      if (matches(types.GeomAbs_BSplineSurface)) return "bspline";
      if (matches(types.GeomAbs_BezierSurface)) return "bezier";
      if (matches(types.GeomAbs_SurfaceOfExtrusion)) return "extrusion";
      if (matches(types.GeomAbs_SurfaceOfRevolution)) return "revolution";
      if (matches(types.GeomAbs_OffsetSurface)) return "offset";
      return "other";
    } catch {
      return "unknown";
    }
  }

  private surfaceClassForFace(
    surfaces: FaceSurfaceMap | null,
    face: any
  ): FaceSurfaceClass | null {
    if (!surfaces) return null;
    const hash = this.shapeHash(face);
    const bucket = surfaces.get(hash);
    if (!bucket) return null;
    for (const entry of bucket) {
      if (this.shapesSame(entry.face, face)) {
        return entry.surface;
      }
    }
    return null;
  }

  private includeSmoothFeatureEdge(
    faces: any[],
    surfaces: FaceSurfaceMap | null
  ): boolean {
    if (faces.length !== 2) return false;
    const a = this.surfaceClassForFace(surfaces, faces[0]);
    const b = this.surfaceClassForFace(surfaces, faces[1]);
    if (!a || !b) return false;
    if (a === "unknown" || b === "unknown") return false;
    return a !== b;
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
    const includeAllTangentEdges = opts.includeTangentEdges === true;
    const hideAllTangentEdges = opts.hideTangentEdges === true && !includeAllTangentEdges;
    const adjacency = this.buildEdgeAdjacency(shape);
    const surfaces =
      includeAllTangentEdges || hideAllTangentEdges ? null : this.buildFaceSurfaceMap(shape);
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
        if (!includeAllTangentEdges && continuity !== null && continuity > 0) {
          if (hideAllTangentEdges || !this.includeSmoothFeatureEdge(faces, surfaces)) {
            edgeIndex += 1;
            continue;
          }
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
