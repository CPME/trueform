import {
  Backend,
  BackendCapabilities,
  ExecuteInput,
  KernelResult,
  KernelObject,
  KernelSelection,
  KernelSelectionRecord,
  MeshData,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
} from "./backend.js";
import { BackendError } from "./errors.js";
import { TF_STAGED_FEATURES } from "./feature_staging.js";
import { hashValue } from "./hash.js";
import {
  describeBooleanSemanticEdge,
  type BooleanSemanticEdgeDescriptor,
} from "./selection_semantics.js";
import { tryDynamicMethod } from "./occt/dynamic_call.js";
import {
  executeEdgeModifier,
  type EdgeModifierDeps,
} from "./occt/edge_modifiers.js";
import {
  executeVariableEdgeModifier,
  variableChamferEntries,
  variableFilletEntries,
} from "./occt/variable_edge_modifiers.js";
import {
  applySelectionLedgerHint as applyOcctSelectionLedgerHint,
  assignStableSelectionIds as assignOcctStableSelectionIds,
  selectionTieBreakerFingerprint as occtSelectionTieBreakerFingerprint,
  type SelectionFingerprintFns,
} from "./occt/selection_ids.js";
import { collectSelections as collectOcctSelections } from "./occt/selection_collection.js";
import {
  normalizeSelectionToken as normalizeOcctSelectionToken,
  numberFingerprint as occtNumberFingerprint,
  stringArrayFingerprint as occtStringArrayFingerprint,
  stringFingerprint as occtStringFingerprint,
  vectorFingerprint as occtVectorFingerprint,
} from "./occt/selection_fingerprint.js";
import {
  exportStep as exportOcctStep,
  exportStl as exportOcctStl,
} from "./occt/export_ops.js";
import { mesh as buildOcctMesh } from "./occt/mesh_ops.js";
import {
  resolveProfile as resolveOcctProfile,
  type ResolvedProfile,
} from "./occt/profile_resolution.js";
import {
  planeBasisFromNormal as buildPlaneBasisFromNormal,
  type PlaneBasis,
} from "./occt/plane_basis.js";
import {
  buildProfileFaceWithDeps,
  buildProfileWireWithDeps,
  planeBasisFromFaceWithDeps,
  resolvePlaneBasisWithDeps,
  resolveSketchPlaneWithDeps,
  type ProfilePlaneAdapterDeps,
} from "./occt/profile_plane_adapters.js";
import {
  arcMidpoint as occtArcMidpoint,
  dist2 as occtDist2,
  ellipseAxes as occtEllipseAxes,
  point2Numbers as occtPoint2Numbers,
  point2To3 as occtPoint2To3,
  polygonPoints as occtPolygonPoints,
  rectanglePoints as occtRectanglePoints,
  rotateTranslate2 as occtRotateTranslate2,
} from "./occt/sketch_geometry.js";
import {
  addWireEdge as addOcctWireEdge,
  checkLoopContinuity as checkOcctLoopContinuity,
  makeFaceFromWire as makeOcctFaceFromWire,
  pointsClose as occtPointsClose,
  readFace as readOcctFace,
} from "./occt/wire_ops.js";
import {
  sketchEntityToSegments as buildOcctSketchEntitySegments,
  type SketchEdgeSegment,
} from "./occt/sketch_segments.js";
import {
  makePathSplineEdge as makeOcctPathSplineEdge,
  makeSketchSplineEdge as makeOcctSketchSplineEdge,
} from "./occt/spline_edges.js";
import { executeHoleFeature as executeOcctHoleFeature } from "./occt/hole_ops.js";
import { execPattern as execOcctPattern } from "./occt/pattern_ops.js";
import { execThreadFeature as execOcctThreadFeature } from "./occt/thread_ops.js";
import { execUnwrap as execOcctUnwrap } from "./occt/unwrap_ops.js";
import { execThicken as execOcctThicken } from "./occt/thicken_ops.js";
import { execShell as execOcctShell } from "./occt/shell_ops.js";
import { execBoolean as execOcctBoolean } from "./occt/boolean_ops.js";
import { execRib as execOcctRib, execWeb as execOcctWeb } from "./occt/thin_profile_ops.js";
import { execSweep as execOcctSweep } from "./occt/sweep_ops.js";
import { execSketch as execOcctSketch } from "./occt/sketch_ops.js";
import { execDraft as execOcctDraft } from "./occt/draft_ops.js";
import { execMirror as execOcctMirror } from "./occt/mirror_ops.js";
import {
  mirrorShape as mirrorOcctShape,
  transformShapeRotate as rotateOcctShape,
  transformShapeScale as scaleOcctShape,
  transformShapeTranslate as translateOcctShape,
} from "./occt/transform_primitives.js";
import {
  execHexTubeSweep as execOcctHexTubeSweep,
  execPipeSweep as execOcctPipeSweep,
} from "./occt/sweep_feature_ops.js";
import {
  execDeleteFace as execOcctDeleteFace,
  execMoveBody as execOcctMoveBody,
  execMoveFace as execOcctMoveFace,
  execReplaceFace as execOcctReplaceFace,
  execSplitBody as execOcctSplitBody,
  execSplitFace as execOcctSplitFace,
} from "./occt/face_edit_ops.js";
import {
  execCurveIntersect as execOcctCurveIntersect,
  execExtendSurface as execOcctExtendSurface,
  execKnit as execOcctKnit,
  execTrimSurface as execOcctTrimSurface,
} from "./occt/surface_edit_ops.js";
import {
  makeBooleanSelectionLedgerPlan as makeOcctBooleanSelectionLedgerPlan,
  makeDraftSelectionLedgerPlan as makeOcctDraftSelectionLedgerPlan,
  makeEdgeModifierSelectionLedgerPlan as makeOcctEdgeModifierSelectionLedgerPlan,
  makeFaceMutationSelectionLedgerPlan as makeOcctFaceMutationSelectionLedgerPlan,
  makeHoleSelectionLedgerPlan as makeOcctHoleSelectionLedgerPlan,
  makeKnitSelectionLedgerPlan as makeOcctKnitSelectionLedgerPlan,
  makePrismSelectionLedgerPlan as makeOcctPrismSelectionLedgerPlan,
  makeRevolveSelectionLedgerPlan as makeOcctRevolveSelectionLedgerPlan,
  makeSplitFaceSelectionLedgerPlan as makeOcctSplitFaceSelectionLedgerPlan,
} from "./occt/selection_ledger_ops.js";
import {
  annotateEdgeAdjacencyMetadata as annotateOcctEdgeAdjacencyMetadata,
  cylinderFromFace as resolveOcctCylinderFromFace,
  edgeMetadata as resolveOcctEdgeMetadata,
  faceCenter as resolveOcctFaceCenter,
  faceMetadata as resolveOcctFaceMetadata,
  faceProperties as resolveOcctFaceProperties,
} from "./occt/metadata_ops.js";
import type {
  CollectedSubshape,
  FaceEditContext,
  MetadataContext,
  BooleanContext,
  SelectionCollectionOptions,
  SelectionLedgerContext,
  SelectionLedgerHint,
  SelectionLedgerPlan,
  SurfaceEditContext,
  ThickenContext,
  UnwrapContext,
  VariableEdgeModifierContext,
  ShellContext,
  SweepFeatureContext,
  SweepContext,
  ThinProfileContext,
  SketchContext,
  DraftContext,
  MirrorContext,
} from "./occt/operation_contexts.js";
import {
  resolveOwnerKey as resolveSelectionOwnerKey,
  resolveOwnerShape as resolveSelectionOwnerShape,
  resolveSingleSelection as resolveOcctSingleSelection,
  toOcctResolutionContext,
} from "./occt/selection_resolution.js";
import { collectUniqueSubshapes as collectOcctUniqueSubshapes } from "./occt/shape_collection.js";
import {
  axisDirectionFromVector,
  axisVector,
  clamp,
  cross,
  dot,
  expectNumber,
  isFiniteVec,
  normalizeVector,
  rotateAroundAxis,
  vecLength,
} from "./occt/vector_math.js";
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
  TrimSurface,
  ExtendSurface,
  Knit,
  CurveIntersect,
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

type SelectionIdAssignment = {
  id: string;
  aliases?: string[];
  record: KernelSelectionRecord;
};

type FaceSelectionBinding = {
  shape: any;
  id: string;
  slot?: string;
  role?: string;
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
        "feature.trim.surface",
        "feature.extend.surface",
        "feature.knit",
        "feature.curve.intersect",
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
      case "feature.trim.surface":
        return this.execTrimSurface(
          input.feature as TrimSurface,
          input.upstream
        );
      case "feature.extend.surface":
        return this.execExtendSurface(
          input.feature as ExtendSurface,
          input.upstream
        );
      case "feature.knit":
        return this.execKnit(
          input.feature as Knit,
          input.upstream
        );
      case "feature.curve.intersect":
        return this.execCurveIntersect(
          input.feature as CurveIntersect,
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
    return buildOcctMesh({
      target,
      opts,
      occt: this.occt as any,
      deps: {
        ensureTriangulation: (shape, options) => this.ensureTriangulation(shape, options),
        getTriangulation: (face) => this.getTriangulation(face),
        faceOrientationValue: (face) => this.faceOrientationValue(face),
        callNumber: (targetObj, method) => this.callNumber(targetObj, method),
        call: (targetObj, method, ...args) => this.call(targetObj, method, ...args),
        applyLocation: (point, location) => this.applyLocation(point, location),
        pointToArray: (point) => this.pointToArray(point),
        triangleNodes: (triangle) => this.triangleNodes(triangle),
        computeNormals: (positions, indices) => this.computeNormals(positions, indices),
        buildEdgeLines: (shape, options) => this.buildEdgeLines(shape, options),
      },
    });
  }

  exportStep(target: KernelObject, opts: StepExportOptions = {}): Uint8Array {
    return exportOcctStep({
      target,
      opts,
      occt: this.occt as any,
      deps: this.exportOpsDeps(),
    });
  }

  exportStl(target: KernelObject, opts: StlExportOptions = {}): Uint8Array {
    return exportOcctStl({
      target,
      opts,
      occt: this.occt as any,
      deps: this.exportOpsDeps(),
    });
  }

  private exportOpsDeps() {
    return {
      configureStepExport: (module: any, options: StepExportOptions) =>
        this.configureStepExport(module, options),
      newOcct: (name: string, ...args: any[]) => this.newOcct(name, ...args),
      resolveStepModelType: (module: any, kind: KernelObject["kind"]) =>
        this.resolveStepModelType(module, kind),
      makeProgressRange: () => this.makeProgressRange(),
      callWithFallback: (targetObj: any, names: string[], argSets: any[][]) =>
        this.callWithFallback(targetObj, names, argSets),
      assertStepStatus: (module: any, status: any, context: string) =>
        this.assertStepStatus(module, status, context),
      makeStepPath: (fs: any) => this.makeStepPath(fs),
      makeStlPath: (fs: any) => this.makeStlPath(fs),
      ensureTriangulation: (
        shape: any,
        options: {
          linearDeflection?: number;
          angularDeflection?: number;
          relative?: boolean;
          includeEdges?: boolean;
        }
      ) => this.ensureTriangulation(shape, options),
    };
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
    return execOcctSweep(this.sweepContext(resolve), feature, upstream, resolve);
  }

  private execRib(feature: Rib, upstream: KernelResult): KernelResult {
    return execOcctRib(this.thinProfileContext(), feature, upstream);
  }

  private execWeb(feature: Web, upstream: KernelResult): KernelResult {
    return execOcctWeb(this.thinProfileContext(), feature, upstream);
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
    return execOcctPipeSweep(this.sweepFeatureContext(), feature);
  }

  private execHexTubeSweep(feature: HexTubeSweep, _upstream: KernelResult): KernelResult {
    return execOcctHexTubeSweep(this.sweepFeatureContext(), feature);
  }

  private execMirror(
    feature: Mirror,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctMirror(this.mirrorContext(resolve), feature, upstream, resolve);
  }

  private selectionLedgerContext(): SelectionLedgerContext {
    return {
      occt: this.occt,
      applySelectionLedgerHint: (entry, hint) =>
        this.applySelectionLedgerHint(entry as CollectedSubshape, hint),
      basisFromNormal: (normal, xHint, origin) => this.basisFromNormal(normal, xHint, origin),
      callWithFallback: (target, methods, argSets) => this.callWithFallback(target, methods, argSets),
      collectEdgesFromShape: (shape) => this.collectEdgesFromShape(shape),
      collectFacesFromShape: (shape) => this.collectFacesFromShape(shape),
      defaultAxisForNormal: (normal) => this.defaultAxisForNormal(normal),
      numberFingerprint: (value) => this.numberFingerprint(value),
      scaleVec: (v, s) => this.scaleVec(v, s),
      selectionTieBreakerFingerprint: (kind, meta) =>
        this.selectionTieBreakerFingerprint(kind, meta),
      shapeHash: (shape) => this.shapeHash(shape),
      shapesSame: (left, right) => this.shapesSame(left, right),
      subVec: (a, b) => this.subVec(a, b),
      toWire: (shape) => this.toWire(shape),
      uniqueKernelSelectionIds: (selections) => this.uniqueKernelSelectionIds(selections),
      uniqueShapeList: (shapes) => this.uniqueShapeList(shapes as any[]),
      vectorFingerprint: (value) => this.vectorFingerprint(value),
    };
  }

  private metadataContext(): MetadataContext {
    return {
      occt: this.occt,
      adjacentFaces: (adjacency, edge) => this.adjacentFaces(adjacency as any, edge),
      buildEdgeAdjacency: (owner) => this.buildEdgeAdjacency(owner),
      call: (target, method, ...args) => this.call(target, method, ...args),
      callNumber: (target, method) => this.callNumber(target, method),
      callWithFallback: (target, methods, argSets) => this.callWithFallback(target, methods, argSets),
      dirToArray: (dir) => this.dirToArray(dir),
      edgeEndpoints: (edge) => this.edgeEndpoints(edge),
      newOcct: (name, ...args) => this.newOcct(name, ...args),
      planeBasisFromFace: (face) => this.planeBasisFromFace(face),
      pointToArray: (point) => this.pointToArray(point),
      shapeBounds: (shape) => this.shapeBounds(shape),
      shapeHash: (shape) => this.shapeHash(shape),
      shapesSame: (left, right) => this.shapesSame(left, right),
      toEdge: (shape) => this.toEdge(shape),
      toFace: (shape) => this.toFace(shape),
    };
  }

  private faceEditContext(): FaceEditContext {
    return {
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      collectToolFaces: (tools) => this.collectToolFaces(tools),
      deleteFacesBySewing: (shape, removeFaces) => this.deleteFacesBySewing(shape, removeFaces as any[]),
      deleteFacesWithDefeaturing: (shape, removeFaces) =>
        this.deleteFacesWithDefeaturing(shape, removeFaces as any[]),
      isValidShape: (shape) => this.isValidShape(shape),
      makeFaceMutationSelectionLedgerPlan: (upstream, ownerShape, replacements) =>
        this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, replacements as any),
      makeSolidFromShells: (shape) => this.makeSolidFromShells(shape),
      makeSplitFaceSelectionLedgerPlan: (upstream, ownerShape, faceTargets) =>
        this.makeSplitFaceSelectionLedgerPlan(upstream, ownerShape, faceTargets),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      ownerFaceSelectionsForShape: (upstream, ownerShape) =>
        this.ownerFaceSelectionsForShape(upstream, ownerShape),
      replaceFacesBySewing: (shape, removeFaces, replacements) =>
        this.replaceFacesBySewing(shape, removeFaces as any[], replacements as any[]),
      replaceFacesWithReshape: (shape, replacements) =>
        this.replaceFacesWithReshape(shape, replacements as any),
      resolveAxisSpec: (axis, upstream, label) =>
        this.resolveAxisSpec(axis as AxisSpec, upstream, label),
      resolveOwnerKey: (selection, upstream) => this.resolveOwnerKey(selection, upstream),
      resolveOwnerShape: (selection, upstream) => this.resolveOwnerShape(selection, upstream),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
      shapeHash: (shape) => this.shapeHash(shape),
      splitByTools: (shape, tools) => this.splitByTools(shape, tools as any[]),
      toResolutionContext: (upstream) => this.toResolutionContext(upstream),
      transformShapeRotate: (shape, origin, axis, angleRad) =>
        this.transformShapeRotate(shape, origin, axis, angleRad),
      transformShapeScale: (shape, origin, scale) => this.transformShapeScale(shape, origin, scale),
      transformShapeTranslate: (shape, delta) => this.transformShapeTranslate(shape, delta),
      unifySameDomain: (shape) => this.unifySameDomain(shape),
      uniqueFaceShapes: (selections) => this.uniqueFaceShapes(selections),
    };
  }

  private surfaceEditContext(): SurfaceEditContext {
    return {
      applySelectionLedgerHint: (entry, hint) =>
        this.applySelectionLedgerHint(entry as CollectedSubshape, hint),
      collectEdgesFromShape: (shape) => this.collectEdgesFromShape(shape),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      containsShape: (shapes, candidate) => this.containsShape(shapes as any[], candidate),
      countFaces: (shape) => this.countFaces(shape),
      edgeDirection: (edge, label) => this.edgeDirection(edge, label),
      faceSelectionsForTarget: (target, upstream) => this.faceSelectionsForTarget(target, upstream),
      isValidShape: (shape, kindHint) => this.isValidShape(shape, kindHint),
      makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
      makeCompoundFromShapes: (shapes) => this.makeCompoundFromShapes(shapes as any[]),
      makeFaceMutationSelectionLedgerPlan: (upstream, ownerShape, replacements) =>
        this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, replacements as any),
      makeKnitSelectionLedgerPlan: (sourceFaces) => this.makeKnitSelectionLedgerPlan(sourceFaces),
      makePlanarRectFace: (origin, xDir, yDir, extents) =>
        this.makePlanarRectFace(origin, xDir, yDir, extents),
      makeSection: (first, second) => this.makeSection(first, second),
      makeSolidFromShells: (shape) => this.makeSolidFromShells(shape),
      makeSplitFaceSelectionLedgerPlan: (upstream, ownerShape, faceTargets) =>
        this.makeSplitFaceSelectionLedgerPlan(upstream, ownerShape, faceTargets),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      planeBasisFromFace: (face) => this.planeBasisFromFace(face),
      projectBoundsOnBasis: (points, origin, xDir, yDir) =>
        this.projectBoundsOnBasis(points, origin, xDir, yDir),
      readShape: (shape) => this.readShape(shape),
      resolveSingleSelection: (selector, upstream, label) =>
        this.resolveSingleSelection(selector as Selector, upstream, label),
      sampleEdgePoints: (edge, opts) => this.sampleEdgePoints(edge, opts),
      selectionTieBreakerFingerprint: (kind, meta) =>
        this.selectionTieBreakerFingerprint(kind, meta),
      sewShapeFaces: (shape, tolerance) => this.sewShapeFaces(shape, tolerance),
      shapeBoundsOverlap: (left, right) => this.shapeBoundsOverlap(left, right),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
      shapeHash: (shape) => this.shapeHash(shape),
      splitByTools: (shape, tools) => this.splitByTools(shape, tools as any[]),
      toFace: (shape) => this.toFace(shape),
      toResolutionContext: (upstream) => this.toResolutionContext(upstream),
      uniqueKernelSelectionsById: (selections) => this.uniqueKernelSelectionsById(selections),
      uniqueShapeList: (shapes) => this.uniqueShapeList(shapes as any[]),
    };
  }

  private unwrapContext(): UnwrapContext {
    return {
      buildEdgeAdjacency: (owner) => this.buildEdgeAdjacency(owner),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      countFaces: (shape) => this.countFaces(shape),
      cylinderFromFace: (face) => this.cylinderFromFace(face),
      cylinderReferenceXDirection: (cylinder) => this.cylinderReferenceXDirection(cylinder),
      edgeEndpoints: (edge) => this.edgeEndpoints(edge),
      faceProperties: (face) => this.faceProperties(face),
      firstFace: (shape) => this.firstFace(shape),
      isValidShape: (shape, kindHint) => this.isValidShape(shape, kindHint),
      listFaces: (shape) => this.listFaces(shape),
      makeCircleFace: (radius, center) => this.makeCircleFace(radius, center),
      makeCompoundFromShapes: (shapes) => this.makeCompoundFromShapes(shapes as any[]),
      makeFaceFromWire: (wire) => this.makeFaceFromWire(wire),
      makePolygonWire: (points) => this.makePolygonWire(points),
      planeBasisFromFace: (face) => this.planeBasisFromFace(face),
      readShape: (shape) => this.readShape(shape),
      scaleVec: (v, s) => this.scaleVec(v, s),
      sewShapeFaces: (shape, tolerance) => this.sewShapeFaces(shape, tolerance),
      shapeBounds: (shape) => this.shapeBounds(shape),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
      shapeHash: (shape) => this.shapeHash(shape),
      shapesSame: (left, right) => this.shapesSame(left, right),
      subVec: (a, b) => this.subVec(a, b),
      surfaceUvExtents: (face) => this.surfaceUvExtents(face),
      toFace: (shape) => this.toFace(shape),
      toResolutionContext: (upstream) => this.toResolutionContext(upstream),
      transformShapeRotate: (shape, origin, axis, angleRad) =>
        this.transformShapeRotate(shape, origin, axis, angleRad),
      transformShapeTranslate: (shape, delta) => this.transformShapeTranslate(shape, delta),
    };
  }

  private thickenContext(resolve: ExecuteInput["resolve"]): ThickenContext {
    return {
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      cylinderFromFace: (face) => this.cylinderFromFace(face),
      cylinderVExtents: (face, cylinder) => this.cylinderVExtents(face, cylinder),
      faceProperties: (face) => this.faceProperties(face),
      firstFace: (shape) => this.firstFace(shape),
      isValidShape: (shape) => this.isValidShape(shape),
      makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
      makeCylinder: (radius, height, axis, center) =>
        this.makeCylinder(radius, height, axis, center),
      makePrism: (face, vec) => this.makePrism(face, vec),
      makeSolidFromShells: (shape) => this.makeSolidFromShells(shape),
      makeThickSolid: (shape, removeFaces, offset, tolerance, opts) =>
        this.makeThickSolid(shape, removeFaces as any[], offset, tolerance, opts),
      makeVec: (x, y, z) => this.makeVec(x, y, z),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      planeBasisFromFace: (face) => this.planeBasisFromFace(face),
      readShape: (shape) => this.readShape(shape),
      resolve: (selector, upstream) => resolve(selector as Selector, upstream),
      scaleVec: (v, s) => this.scaleVec(v, s),
      sewShapeFaces: (shape, tolerance) => this.sewShapeFaces(shape, tolerance),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
      addVec: (a, b) => this.addVec(a, b),
    };
  }

  private variableEdgeModifierContext(): VariableEdgeModifierContext {
    return {
      toResolutionContext: (state) => this.toResolutionContext(state),
      resolveOwnerKey: (selection, state) => this.resolveOwnerKey(selection, state),
      resolveOwnerShape: (selection, state) => this.resolveOwnerShape(selection, state),
      toEdge: (edge) => this.toEdge(edge),
      containsShape: (shapes, candidate) => this.containsShape(shapes as any[], candidate),
      tryBuild: (builder) => this.tryBuild(builder),
      readShape: (builder) => this.readShape(builder),
      collectSelections: (shape, featureId, ownerKey, tags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, tags, opts),
    };
  }

  private shellContext(resolve: ExecuteInput["resolve"]): ShellContext {
    return {
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      isValidShape: (shape) => this.isValidShape(shape),
      makeFaceMutationSelectionLedgerPlan: (upstream, ownerShape, replacements) =>
        this.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, replacements as any),
      makeSolidFromShells: (shape) => this.makeSolidFromShells(shape),
      makeThickSolid: (shape, removeFaces, offset, tolerance, opts) =>
        this.makeThickSolid(shape, removeFaces as any[], offset, tolerance, opts),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      resolve: (selector, upstream) => resolve(selector as Selector, upstream),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
    };
  }

  private sweepFeatureContext(): SweepFeatureContext {
    return {
      buildPathWire: (path) => this.buildPathWire(path),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      countSolids: (shape) => this.countSolids(shape),
      isValidShape: (shape) => this.isValidShape(shape),
      makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
      makeCircleEdge: (center, radius, normal) => this.makeCircleEdge(center, radius, normal),
      makeFaceFromWire: (wire) => this.makeFaceFromWire(wire),
      makePipeSolid: (spine, profile, frameOrOpts, maybeOpts) =>
        this.invokePipeSolid(spine, profile, frameOrOpts, maybeOpts),
      makePolygonWire: (points) => this.makePolygonWire(points),
      makeRingFace: (center, normal, outerRadius, innerRadius) =>
        this.makeRingFace(center, normal, outerRadius, innerRadius),
      makeWireFromEdges: (edges) => this.makeWireFromEdges(edges as any[]),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      pathStartTangent: (path) => this.pathStartTangent(path),
      planeBasisFromNormal: (origin, normal) => this.planeBasisFromNormal(origin, normal),
      readFace: (shape) => this.readFace(shape),
      readShape: (shape) => this.readShape(shape),
      regularPolygonPoints: (center, xDir, yDir, radius, sides) =>
        this.regularPolygonPoints(center, xDir, yDir, radius, sides),
      splitByTools: (shape, tools) => this.splitByTools(shape, tools as any[]),
    };
  }

  private booleanContext(resolve: ExecuteInput["resolve"]): BooleanContext {
    return {
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
      makeBooleanSelectionLedgerPlan: (op, upstream, left, right, builder) =>
        this.makeBooleanSelectionLedgerPlan(op, upstream, left, right, builder),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      readShape: (shape) => this.readShape(shape),
      resolve: (selector, upstream) => resolve(selector as Selector, upstream),
      resolveOwnerShape: (selection, upstream) => this.resolveOwnerShape(selection, upstream),
      splitByTools: (shape, tools) => this.splitByTools(shape, tools as any[]),
    };
  }

  private thinProfileContext(): ThinProfileContext {
    return {
      addVec: (a, b) => this.addVec(a, b),
      buildProfileWire: (profile) => this.buildProfileWire(profile),
      collectEdgesFromShape: (shape) => this.collectEdgesFromShape(shape),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      edgeEndpoints: (edge) => this.edgeEndpoints(edge),
      isValidShape: (shape) => this.isValidShape(shape),
      makeFaceFromWire: (wire) => this.makeFaceFromWire(wire),
      makePolygonWire: (points) => this.makePolygonWire(points),
      makePrism: (face, vec) => this.makePrism(face, vec),
      makeSolidFromShells: (shape) => this.makeSolidFromShells(shape),
      makeVec: (x, y, z) => this.makeVec(x, y, z),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
      readShape: (shape) => this.readShape(shape),
      resolveExtrudeAxis: (axis, profile, upstream) =>
        this.resolveExtrudeAxis(axis, profile, upstream),
      resolveProfile: (profileRef, upstream) => this.resolveProfile(profileRef, upstream),
      resolveThinFeatureAxisSpan: (axis, origin, requestedDepth, upstream) =>
        this.resolveThinFeatureAxisSpan(axis, origin, requestedDepth, upstream),
      scaleVec: (v, s) => this.scaleVec(v, s),
      shapeHasSolid: (shape) => this.shapeHasSolid(shape),
      subVec: (a, b) => this.subVec(a, b),
      transformShapeTranslate: (shape, delta) => this.transformShapeTranslate(shape, delta),
    };
  }

  private sweepContext(resolve: ExecuteInput["resolve"]): SweepContext {
    return {
      buildPathWire: (path) => this.buildPathWire(path),
      buildProfileFace: (profile) => this.buildProfileFace(profile),
      buildProfileWire: (profile) => this.buildProfileWire(profile),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      makePipeSolid: (spine, profile, frameOrOpts, maybeOpts) =>
        this.invokePipeSolid(spine, profile, frameOrOpts, maybeOpts),
      resolvePlaneBasis: (planeRef, upstream, resolver) =>
        this.resolvePlaneBasis(planeRef as PlaneRef, upstream, resolver as ExecuteInput["resolve"]),
      resolveProfile: (profileRef, upstream) => this.resolveProfile(profileRef, upstream),
    };
  }

  private sketchContext(): SketchContext {
    return {
      buildSketchProfileFaceFromWires: (outer, holes) =>
        this.buildSketchProfileFaceFromWires(outer, holes as any[]),
      buildSketchWire: (loop, entityMap, plane) => this.buildSketchWire(loop, entityMap, plane),
      buildSketchWireWithStatus: (loop, entityMap, plane, allowOpen) =>
        this.buildSketchWireWithStatus(loop, entityMap, plane, allowOpen),
      resolveSketchPlane: (feature, upstream, resolve) =>
        this.resolveSketchPlane(feature, upstream, resolve),
      segmentSlotsForLoop: (loop, entityMap, plane) =>
        this.segmentSlotsForLoop(loop, entityMap, plane),
    };
  }

  private mirrorContext(resolve: ExecuteInput["resolve"]): MirrorContext {
    return {
      ...this.transformPrimitiveContext(),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      resolvePlaneBasis: (planeRef, upstream, resolver) =>
        this.resolvePlaneBasis(planeRef as PlaneRef, upstream, resolver as ExecuteInput["resolve"]),
    };
  }

  private draftContext(): DraftContext {
    return {
      callWithFallback: (target, methods, argSets) => this.callWithFallback(target, methods, argSets as any),
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      makeDir: (x, y, z) => this.makeDir(x, y, z),
      makeDraftBuilder: (owner) => this.makeDraftBuilder(owner),
      makeDraftSelectionLedgerPlan: (upstream, ownerShape, faceTargets, builder) =>
        this.makeDraftSelectionLedgerPlan(upstream, ownerShape, faceTargets, builder),
      makePln: (origin, normal) => this.makePln(origin, normal),
      readShape: (shape) => this.readShape(shape),
      resolveAxisSpec: (axis, upstream, label) => this.resolveAxisSpec(axis, upstream, label),
      resolveOwnerKey: (selection, upstream) => this.resolveOwnerKey(selection, upstream),
      resolveOwnerShape: (selection, upstream) => this.resolveOwnerShape(selection, upstream),
      resolvePlaneBasis: (planeRef, upstream, resolve) =>
        this.resolvePlaneBasis(planeRef as PlaneRef, upstream, resolve),
      toFace: (shape) => this.toFace(shape),
      toResolutionContext: (upstream) => this.toResolutionContext(upstream),
      tryBuild: (builder) => this.tryBuild(builder),
    };
  }

  private transformPrimitiveContext() {
    return {
      callWithFallback: (target: unknown, methods: string[], argSets: unknown[][]) =>
        this.callWithFallback(target, methods, argSets as any),
      makeAx1: (origin: unknown, axis: unknown) => this.makeAx1(origin, axis),
      makeAx2WithXDir: (origin: unknown, normal: unknown, xDir: unknown) =>
        this.makeAx2WithXDir(origin, normal, xDir),
      makeDir: (x: number, y: number, z: number) => this.makeDir(x, y, z),
      makePnt: (x: number, y: number, z: number) => this.makePnt(x, y, z),
      makeVec: (x: number, y: number, z: number) => this.makeVec(x, y, z),
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
      readShape: (shape: unknown) => this.readShape(shape),
      tryBuild: (builder: unknown) => this.tryBuild(builder),
    };
  }

  private invokePipeSolid(
    spine: unknown,
    profile: unknown,
    frameOrOpts?: PlaneBasis | { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean },
    maybeOpts?: { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean }
  ): unknown {
    if (maybeOpts !== undefined) {
      return this.makePipeSolid(spine, profile, frameOrOpts as PlaneBasis, maybeOpts);
    }
    if (
      frameOrOpts &&
      typeof frameOrOpts === "object" &&
      "origin" in frameOrOpts &&
      "normal" in frameOrOpts
    ) {
      return this.makePipeSolid(spine, profile, frameOrOpts as PlaneBasis);
    }
    return this.makePipeSolid(
      spine,
      profile,
      frameOrOpts as { makeSolid?: boolean; allowFallback?: boolean; frenet?: boolean } | undefined
    );
  }

  private execDeleteFace(
    feature: DeleteFace,
    upstream: KernelResult
  ): KernelResult {
    return execOcctDeleteFace(this.faceEditContext(), feature, upstream);
  }

  private execReplaceFace(
    feature: ReplaceFace,
    upstream: KernelResult
  ): KernelResult {
    return execOcctReplaceFace(this.faceEditContext(), feature, upstream);
  }

  private execMoveFace(
    feature: MoveFace,
    upstream: KernelResult
  ): KernelResult {
    return execOcctMoveFace(this.faceEditContext(), feature, upstream);
  }

  private execMoveBody(
    feature: MoveBody,
    upstream: KernelResult
  ): KernelResult {
    return execOcctMoveBody(this.faceEditContext(), feature, upstream);
  }

  private execSplitBody(
    feature: SplitBody,
    upstream: KernelResult
  ): KernelResult {
    return execOcctSplitBody(this.faceEditContext(), feature, upstream);
  }

  private execSplitFace(
    feature: SplitFace,
    upstream: KernelResult
  ): KernelResult {
    return execOcctSplitFace(this.faceEditContext(), feature, upstream);
  }

  private execTrimSurface(
    feature: TrimSurface,
    upstream: KernelResult
  ): KernelResult {
    return execOcctTrimSurface(this.surfaceEditContext(), feature, upstream);
  }

  private execExtendSurface(
    feature: ExtendSurface,
    upstream: KernelResult
  ): KernelResult {
    return execOcctExtendSurface(this.surfaceEditContext(), feature, upstream);
  }

  private execKnit(
    feature: Knit,
    upstream: KernelResult
  ): KernelResult {
    return execOcctKnit(this.surfaceEditContext(), feature, upstream);
  }

  private execCurveIntersect(
    feature: CurveIntersect,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctCurveIntersect(this.surfaceEditContext(), feature, upstream, resolve);
  }

  private execThicken(
    feature: Thicken,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctThicken(this.thickenContext(resolve), feature, upstream, resolve);
  }

  private execUnwrap(
    feature: Unwrap,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctUnwrap(this.unwrapContext(), feature, upstream, resolve);
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

  private execDraft(
    feature: Draft,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctDraft(this.draftContext(), feature, upstream, resolve);
  }

  private execShell(
    feature: Shell,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctShell(this.shellContext(resolve), feature, upstream);
  }

  private execThread(feature: Thread, upstream: KernelResult): KernelResult {
    return execOcctThreadFeature(this, feature, upstream);
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

    const {
      solid,
      outputKey,
      centers,
      axisDir,
      radius,
      counterboreRadius,
      countersink,
    } = executeOcctHoleFeature({
      feature,
      upstream,
      context: {
        target: target as KernelSelection,
        face,
        owner,
        ownerKey,
      },
      deps: {
        faceCenter: (shape) => this.faceCenter(shape),
        planeBasisFromFace: (shape) => this.planeBasisFromFace(shape),
        offsetFromPlane: (offset, xDir, yDir) => this.offsetFromPlane(offset, xDir, yDir),
        patternCenters: (patternRef, position, holePlane, context) =>
          this.patternCenters(patternRef as ID, position, holePlane, context),
        addVec: (a, b) => this.addVec(a, b),
        resolveHoleEndCondition: (holeFeature) => this.resolveHoleEndCondition(holeFeature),
        resolveHoleDepth: (holeFeature, ownerShape, holeAxis, origin, holeRadius, endCondition) =>
          this.resolveHoleDepth(holeFeature, ownerShape, holeAxis, origin, holeRadius, endCondition),
        readShape: (shape) => this.readShape(shape),
        makeCylinder: (rad, height, holeAxis, origin) =>
          this.makeCylinder(rad, height, holeAxis, origin),
        makeCone: (r1, r2, height, holeAxis, origin) =>
          this.makeCone(r1, r2, height, holeAxis, origin),
        makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
        splitByTools: (result, tools) => this.splitByTools(result, tools),
        normalizeSolid: (shape) => this.normalizeSolid(shape),
      },
    });
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
            countersink,
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
    return execOcctBoolean(this.booleanContext(resolve), feature, upstream);
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
    return executeVariableEdgeModifier({
      label: "variable fillet",
      feature,
      upstream,
      ctx: this.variableEdgeModifierContext(),
      makeBuilder: (owner) => this.makeFilletBuilder(owner),
      entries: variableFilletEntries(feature),
      addEdge: (builder, edge, radius) =>
        tryDynamicMethod(builder, [
          { name: "Add_2", args: [edge, radius] },
          { name: "Add_2", args: [radius, edge] },
          { name: "Add_1", args: [edge] },
        ]),
    });
  }

  private execVariableChamfer(
    feature: VariableChamfer,
    upstream: KernelResult
  ): KernelResult {
    return executeVariableEdgeModifier({
      label: "variable chamfer",
      feature,
      upstream,
      ctx: this.variableEdgeModifierContext(),
      makeBuilder: (owner) => this.makeChamferBuilder(owner),
      entries: variableChamferEntries(feature),
      addEdge: (builder, edge, distance) =>
        tryDynamicMethod(builder, [
          { name: "Add_2", args: [distance, edge] },
          { name: "Add_1", args: [edge] },
        ]),
    });
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
    return execOcctPattern({
      feature,
      upstream,
      resolve,
      deps: {
        planeBasisFromFace: (face) => this.planeBasisFromFace(face),
        faceCenter: (face) => this.faceCenter(face),
        patternKey: (id) => this.patternKey(id),
        resolveOwnerShape: (selection, context) => this.resolveOwnerShape(selection, context),
        transformShapeTranslate: (shape, delta) => this.transformShapeTranslate(shape, delta),
        transformShapeRotate: (shape, origin, axis, angle) =>
          this.transformShapeRotate(shape, origin, axis, angle),
        unionShapesBalanced: (shapes) => this.unionShapesBalanced(shapes),
        collectSelections: (shape, featureId, ownerKey, featureTags) =>
          this.collectSelections(shape, featureId, ownerKey, featureTags),
      },
    });
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
    return execOcctSketch(this.sketchContext(), feature, upstream, resolve);
  }

  private collectSelections(
    shape: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[],
    opts?: SelectionCollectionOptions
  ): KernelSelection[] {
    return collectOcctSelections({
      shape,
      featureId,
      ownerKey,
      featureTags,
      opts: opts as any,
      deps: {
        occt: this.occt as any,
        shapeCenter: (target: any) => this.shapeCenter(target),
        applySelectionLedgerHint: (entry: any, hint: any) =>
          this.applySelectionLedgerHint(entry, hint),
        collectUniqueSubshapes: (
          target: any,
          shapeKind: any,
          metaFactory: (subshape: any) => Record<string, unknown>
        ) =>
          this.collectUniqueSubshapes(target, shapeKind, metaFactory),
        assignStableSelectionIds: (kind: KernelSelection["kind"], entries: any) =>
          this.assignStableSelectionIds(kind, entries),
        faceMetadata: (
          face: any,
          owner: any,
          createdBy: string,
          key: string,
          tags?: string[]
        ) =>
          this.faceMetadata(face, owner, createdBy, key, tags),
        edgeMetadata: (
          edge: any,
          owner: any,
          createdBy: string,
          key: string,
          tags?: string[]
        ) =>
          this.edgeMetadata(edge, owner, createdBy, key, tags),
        annotateEdgeAdjacencyMetadata: (
          target: any,
          edgeEntries: any[],
          faceBindings: FaceSelectionBinding[]
        ) =>
          this.annotateEdgeAdjacencyMetadata(target, edgeEntries, faceBindings),
      },
    } as any);
  }

  private applySelectionLedgerHint(
    entry: CollectedSubshape,
    hint: SelectionLedgerHint
  ): void {
    applyOcctSelectionLedgerHint(entry, hint);
  }

  private collectUniqueSubshapes(
    shape: any,
    shapeKind: any,
    metaFactory: (subshape: any) => Record<string, unknown>
  ): CollectedSubshape[] {
    return collectOcctUniqueSubshapes({
      occt: this.occt,
      shape,
      shapeKind,
      metaFactory,
      shapeHash: (subshape) => this.shapeHash(subshape),
      shapesSame: (a, b) => this.shapesSame(a, b),
    }) as CollectedSubshape[];
  }

  private assignStableSelectionIds(
    kind: KernelSelection["kind"],
    entries: CollectedSubshape[]
  ): SelectionIdAssignment[] {
    return assignOcctStableSelectionIds(kind, entries, this.selectionFingerprintFns());
  }

  private selectionFingerprintFns(): SelectionFingerprintFns {
    return {
      normalizeSelectionToken: (value) => this.normalizeSelectionToken(value),
      stringFingerprint: (value) => this.stringFingerprint(value),
      stringArrayFingerprint: (value) => this.stringArrayFingerprint(value),
      numberFingerprint: (value) => this.numberFingerprint(value),
      vectorFingerprint: (value) => this.vectorFingerprint(value),
    };
  }

  private selectionTieBreakerFingerprint(
    kind: KernelSelection["kind"],
    meta: Record<string, unknown>
  ): Record<string, unknown> {
    return occtSelectionTieBreakerFingerprint(kind, meta, this.selectionFingerprintFns());
  }

  private makePrismSelectionLedgerPlan(
    axis: [number, number, number],
    opts?: {
      prism?: any;
      wire?: any;
      wireSegmentSlots?: string[];
    }
  ): SelectionLedgerPlan {
    return makeOcctPrismSelectionLedgerPlan(this.selectionLedgerContext(), axis, opts);
  }

  private makeRevolveSelectionLedgerPlan(
    angleRad: number,
    opts: {
      revol: any;
      wire: any;
      wireSegmentSlots: string[];
    }
  ): SelectionLedgerPlan {
    return makeOcctRevolveSelectionLedgerPlan(this.selectionLedgerContext(), angleRad, opts);
  }

  private makeFaceMutationSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    replacements: Array<{ from: KernelSelection; to: any }>
  ): SelectionLedgerPlan {
    return makeOcctFaceMutationSelectionLedgerPlan(
      this.selectionLedgerContext(),
      upstream,
      ownerShape,
      replacements
    );
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
    return makeOcctHoleSelectionLedgerPlan(
      this.selectionLedgerContext(),
      upstream,
      ownerShape,
      target,
      centers,
      axisDir,
      opts
    );
  }

  private makeDraftSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[],
    builder: any
  ): SelectionLedgerPlan {
    return makeOcctDraftSelectionLedgerPlan(
      this.selectionLedgerContext(),
      upstream,
      ownerShape,
      faceTargets,
      builder
    );
  }

  private makeEdgeModifierSelectionLedgerPlan(
    label: "fillet" | "chamfer",
    upstream: KernelResult,
    ownerShape: any,
    edgeTargets: KernelSelection[],
    builder: any
  ): SelectionLedgerPlan {
    return makeOcctEdgeModifierSelectionLedgerPlan(
      this.selectionLedgerContext(),
      label,
      upstream,
      ownerShape,
      edgeTargets,
      builder
    );
  }

  private makeSplitFaceSelectionLedgerPlan(
    upstream: KernelResult,
    ownerShape: any,
    faceTargets: KernelSelection[]
  ): SelectionLedgerPlan {
    return makeOcctSplitFaceSelectionLedgerPlan(
      this.selectionLedgerContext(),
      upstream,
      ownerShape,
      faceTargets
    );
  }

  private makeKnitSelectionLedgerPlan(sourceFaces: KernelSelection[]): SelectionLedgerPlan {
    return makeOcctKnitSelectionLedgerPlan(this.selectionLedgerContext(), sourceFaces);
  }

  private makeBooleanSelectionLedgerPlan(
    op: "union" | "subtract" | "intersect",
    upstream: KernelResult,
    leftShape: any,
    rightShape: any,
    builder: any
  ): SelectionLedgerPlan {
    return makeOcctBooleanSelectionLedgerPlan(
      this.selectionLedgerContext(),
      op,
      upstream,
      leftShape,
      rightShape,
      builder
    );
  }

  private ownerFaceSelectionsForShape(upstream: KernelResult, ownerShape: any): KernelSelection[] {
    const faces = this.collectFacesFromShape(ownerShape);
    if (faces.length === 0) return [];
    const selections = (upstream.selections ?? []).filter(
      (selection): selection is KernelSelection => selection.kind === "face"
    );
    return selections.filter((selection) => {
      const shape = selection.meta["shape"];
      return !!shape && this.containsShape(faces, shape);
    });
  }

  private normalizeSelectionToken(value: string): string {
    return normalizeOcctSelectionToken(value);
  }

  private stringFingerprint(value: unknown): string | undefined {
    return occtStringFingerprint(value);
  }

  private stringArrayFingerprint(value: unknown): string[] | undefined {
    return occtStringArrayFingerprint(value);
  }

  private numberFingerprint(value: unknown): number | undefined {
    return occtNumberFingerprint(value);
  }

  private vectorFingerprint(value: unknown): [number, number, number] | undefined {
    return occtVectorFingerprint(value);
  }

  private faceMetadata(
    face: any,
    owner: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ): Record<string, unknown> {
    return resolveOcctFaceMetadata(
      this.metadataContext(),
      face,
      owner,
      featureId,
      ownerKey,
      featureTags
    );
  }

  private edgeMetadata(
    edge: any,
    owner: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ): Record<string, unknown> {
    return resolveOcctEdgeMetadata(
      this.metadataContext(),
      edge,
      owner,
      featureId,
      ownerKey,
      featureTags
    );
  }

  private faceProperties(face: any): {
    area: number;
    center: [number, number, number];
    planar: boolean;
    normal?: AxisDirection;
    normalVec?: [number, number, number];
    surfaceType?: string;
  } {
    return resolveOcctFaceProperties(this.metadataContext(), face);
  }

  private faceCenter(face: any): [number, number, number] {
    return resolveOcctFaceCenter(this.metadataContext(), face);
  }

  private resolveOwnerKey(selection: KernelSelection, upstream: KernelResult): string {
    return resolveSelectionOwnerKey(selection, upstream);
  }

  private resolveOwnerShape(selection: KernelSelection, upstream: KernelResult): any | null {
    return resolveSelectionOwnerShape(selection, upstream);
  }

  private toResolutionContext(upstream: KernelResult) {
    return toOcctResolutionContext(upstream);
  }

  private resolveSingleSelection(
    selector: Selector,
    upstream: KernelResult,
    label: string
  ): KernelSelection {
    return resolveOcctSingleSelection(selector, upstream, label);
  }

  private faceSelectionsForTarget(
    target: KernelSelection,
    upstream: KernelResult
  ): KernelSelection[] {
    const shape = target.meta["shape"];
    if (!shape) return [];
    const matches = this.uniqueKernelSelectionsById(
      upstream.selections.filter(
        (selection): selection is KernelSelection =>
          selection.kind === "face" &&
          !!selection.meta["shape"] &&
          (this.shapesSame(selection.meta["shape"], shape) ||
            (!!selection.meta["owner"] && this.shapesSame(selection.meta["owner"], shape)))
      )
    );
    if (matches.length > 0) {
      return matches.slice().sort((a, b) => a.id.localeCompare(b.id));
    }
    if (target.kind === "face") {
      return [target];
    }
    return [];
  }

  private uniqueKernelSelectionsById(selections: KernelSelection[]): KernelSelection[] {
    const byId = new Map<string, KernelSelection>();
    for (const selection of selections) {
      if (!byId.has(selection.id)) {
        byId.set(selection.id, selection);
      }
    }
    return Array.from(byId.values());
  }

  private uniqueKernelSelectionIds(selections: KernelSelection[]): ID[] {
    return Array.from(new Set(selections.map((selection) => selection.id)));
  }

  private shapeBoundsOverlap(a: any, b: any, tolerance = 1e-6): boolean {
    const left = this.shapeBounds(a);
    const right = this.shapeBounds(b);
    return !(
      left.max[0] < right.min[0] - tolerance ||
      right.max[0] < left.min[0] - tolerance ||
      left.max[1] < right.min[1] - tolerance ||
      right.max[1] < left.min[1] - tolerance ||
      left.max[2] < right.min[2] - tolerance ||
      right.max[2] < left.min[2] - tolerance
    );
  }

  private edgeDirection(edge: any, label: string): [number, number, number] {
    const points = this.sampleEdgePoints(edge, { edgeSegmentLength: 0.5, edgeMaxSegments: 8 });
    if (points.length < 2) {
      throw new Error(`OCCT backend: ${label} edge has insufficient sample points`);
    }
    const start = points[0];
    const end = points[points.length - 1];
    if (!start || !end) {
      throw new Error(`OCCT backend: ${label} edge points are missing`);
    }
    const direction = normalizeVector(this.subVec(end, start));
    if (!isFiniteVec(direction)) {
      throw new Error(`OCCT backend: ${label} edge direction is degenerate`);
    }
    return direction;
  }

  private projectBoundsOnBasis(
    points: Array<[number, number, number]>,
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number]
  ): { uMin: number; uMax: number; vMin: number; vMax: number } {
    let uMin = Infinity;
    let uMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const point of points) {
      const delta = this.subVec(point, origin);
      const u = dot(delta, xDir);
      const v = dot(delta, yDir);
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
      if (v < vMin) vMin = v;
      if (v > vMax) vMax = v;
    }
    if (![uMin, uMax, vMin, vMax].every((value) => Number.isFinite(value))) {
      throw new Error("OCCT backend: failed to project planar bounds");
    }
    return { uMin, uMax, vMin, vMax };
  }

  private classifyPlanarBoundaryEdge(
    edge: any,
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    extents: { uMin: number; uMax: number; vMin: number; vMax: number },
    tolerance: number
  ): "uMin" | "uMax" | "vMin" | "vMax" | null {
    const points = this.sampleEdgePoints(edge, { edgeSegmentLength: 0.5, edgeMaxSegments: 8 });
    if (points.length < 2) return null;
    const projected = this.projectBoundsOnBasis(points, origin, xDir, yDir);
    const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
    const uSpan = projected.uMax - projected.uMin;
    const vSpan = projected.vMax - projected.vMin;
    const uMid = (projected.uMin + projected.uMax) / 2;
    const vMid = (projected.vMin + projected.vMax) / 2;
    const axisTolerance = tolerance * 4;
    if (uSpan <= axisTolerance && near(uMid, extents.uMin)) {
      return "uMin";
    }
    if (uSpan <= axisTolerance && near(uMid, extents.uMax)) {
      return "uMax";
    }
    if (vSpan <= axisTolerance && near(vMid, extents.vMin)) {
      return "vMin";
    }
    if (vSpan <= axisTolerance && near(vMid, extents.vMax)) {
      return "vMax";
    }
    return null;
  }

  private makePlanarRectFace(
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    extents: { uMin: number; uMax: number; vMin: number; vMax: number }
  ): any {
    const corner = (u: number, v: number): [number, number, number] => [
      origin[0] + xDir[0] * u + yDir[0] * v,
      origin[1] + xDir[1] * u + yDir[1] * v,
      origin[2] + xDir[2] * u + yDir[2] * v,
    ];
    const corners: Array<[number, number, number]> = [
      corner(extents.uMin, extents.vMin),
      corner(extents.uMax, extents.vMin),
      corner(extents.uMax, extents.vMax),
      corner(extents.uMin, extents.vMax),
    ];
    const wire = this.makeWireFromEdges([
      this.makeLineEdge(corners[0] as [number, number, number], corners[1] as [number, number, number]),
      this.makeLineEdge(corners[1] as [number, number, number], corners[2] as [number, number, number]),
      this.makeLineEdge(corners[2] as [number, number, number], corners[3] as [number, number, number]),
      this.makeLineEdge(corners[3] as [number, number, number], corners[0] as [number, number, number]),
    ]);
    return this.readFace(this.makeFaceFromWire(wire));
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
    return resolveOcctCylinderFromFace(this.metadataContext(), face);
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

  private makeSection(left: any, right: any) {
    const progress = this.makeProgressRange();
    const candidates: Array<unknown[]> = [
      [left, right, false, progress],
      [left, right, false],
      [left, right, progress],
      [left, right],
    ];
    for (const args of candidates) {
      try {
        const builder = this.newOcct("BRepAlgoAPI_Section", ...args);
        this.tryBuild(builder);
        return builder;
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to construct BRepAlgoAPI_Section");
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

  private annotateEdgeAdjacencyMetadata(
    shape: any,
    edgeEntries: CollectedSubshape[],
    faceBindings: FaceSelectionBinding[]
  ): void {
    annotateOcctEdgeAdjacencyMetadata(this.metadataContext(), shape, edgeEntries, faceBindings);
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
    return resolveOcctProfile(profileRef, upstream);
  }

  private buildProfileFace(profile: ResolvedProfile) {
    return buildProfileFaceWithDeps(profile, this.profilePlaneAdapterDeps());
  }

  private buildProfileWire(profile: ResolvedProfile): { wire: any; closed: boolean } {
    return buildProfileWireWithDeps(profile, this.profilePlaneAdapterDeps());
  }

  private profilePlaneAdapterDeps(): ProfilePlaneAdapterDeps {
    return {
      datumKey: (id: string) => this.datumKey(id),
      occt: this.occt as any,
      toFace: (target: unknown) => this.toFace(target),
      newOcct: (name: string, ...args: any[]) => this.newOcct(name, ...args),
      call: (target: unknown, name: string, ...args: any[]) =>
        this.call(target, name, ...args),
      pointToArray: (point: unknown) => this.pointToArray(point),
      dirToArray: (dir: unknown) => this.dirToArray(dir),
      makeRectangleFace: (width: number, height: number, center: any) =>
        this.makeRectangleFace(width, height, center),
      makeCircleFace: (radius: number, center: any) => this.makeCircleFace(radius, center),
      makeRegularPolygonFace: (sides: number, radius: number, center: any, rotation?: number) =>
        this.makeRegularPolygonFace(sides, radius, center, rotation),
      makeRectangleWire: (width: number, height: number, center: any) =>
        this.makeRectangleWire(width, height, center),
      makeCircleWire: (radius: number, center: any) => this.makeCircleWire(radius, center),
      makeRegularPolygonWire: (sides: number, radius: number, center: any, rotation?: number) =>
        this.makeRegularPolygonWire(sides, radius, center, rotation),
    };
  }

  private resolveSketchPlane(
    feature: Sketch2D,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): PlaneBasis {
    return resolveSketchPlaneWithDeps(feature, upstream, resolve, this.profilePlaneAdapterDeps());
  }

  private resolvePlaneBasis(
    planeRef: PlaneRef,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): PlaneBasis {
    return resolvePlaneBasisWithDeps(planeRef, upstream, resolve, this.profilePlaneAdapterDeps());
  }

  private planeBasisFromFace(face: any): PlaneBasis {
    return planeBasisFromFaceWithDeps(face, this.profilePlaneAdapterDeps());
  }

  private planeBasisFromNormal(
    origin: [number, number, number],
    normal: [number, number, number]
  ): PlaneBasis {
    return buildPlaneBasisFromNormal(origin, normal);
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
    return buildOcctSketchEntitySegments({
      entity,
      plane,
      deps: this.sketchSegmentDeps(),
    }) as EdgeSegment[];
  }

  private sketchSegmentDeps() {
    return {
      withEntitySegmentSlots: (entityId: string, segments: SketchEdgeSegment[]) =>
        this.withEntitySegmentSlots(entityId, segments as EdgeSegment[]) as SketchEdgeSegment[],
      point2To3: (point: Point2D, sketchPlane: PlaneBasis) => this.point2To3(point, sketchPlane),
      point2Numbers: (point: Point2D, label: string) => this.point2Numbers(point, label),
      dist2: (a: Point2D, b: Point2D) => this.dist2(a, b),
      arcMidpoint: (start: Point2D, end: Point2D, center: Point2D, direction: "cw" | "ccw") =>
        this.arcMidpoint(start, end, center, direction),
      ellipseAxes: (sketchPlane: PlaneBasis, radiusX: number, radiusY: number, rotation: number) =>
        this.ellipseAxes(sketchPlane, radiusX, radiusY, rotation),
      rectanglePoints: (entity: Extract<SketchEntity, { kind: "sketch.rectangle" }>) =>
        this.rectanglePoints(entity),
      polygonPoints: (entity: Extract<SketchEntity, { kind: "sketch.polygon" }>) =>
        this.polygonPoints(entity),
      rotateTranslate2: (point: Point2D, origin: Point2D, angle: number) =>
        this.rotateTranslate2(point, origin, angle),
      makeLineEdge: (start: [number, number, number], end: [number, number, number]) =>
        this.makeLineEdge(start, end),
      makeArcEdge: (
        start: [number, number, number],
        mid: [number, number, number],
        end: [number, number, number]
      ) => this.makeArcEdge(start, mid, end),
      makeCircleEdge: (
        center: [number, number, number],
        radius: number,
        normal: [number, number, number]
      ) => this.makeCircleEdge(center, radius, normal),
      makeEllipseEdge: (
        center: [number, number, number],
        xDir: [number, number, number],
        normal: [number, number, number],
        major: number,
        minor: number
      ) => this.makeEllipseEdge(center, xDir, normal, major, minor),
      makeSplineEdge: (
        entity: Extract<SketchEntity, { kind: "sketch.spline" }>,
        sketchPlane: PlaneBasis
      ) => this.makeSplineEdge(entity, sketchPlane),
    };
  }

  private polygonPoints(entity: Extract<SketchEntity, { kind: "sketch.polygon" }>): Point2D[] {
    return occtPolygonPoints(entity);
  }

  private rectanglePoints(entity: Extract<SketchEntity, { kind: "sketch.rectangle" }>): Point2D[] {
    return occtRectanglePoints(entity);
  }

  private rotateTranslate2(point: Point2D, origin: Point2D, angle: number): Point2D {
    return occtRotateTranslate2(point, origin, angle);
  }

  private point2To3(point: Point2D, plane: PlaneBasis): [number, number, number] {
    return occtPoint2To3(point, plane);
  }

  private point2Numbers(point: Point2D, label: string): [number, number] {
    return occtPoint2Numbers(point, label);
  }

  private ellipseAxes(
    plane: PlaneBasis,
    radiusX: number,
    radiusY: number,
    rotation: number
  ): { major: number; minor: number; xDir: [number, number, number] } {
    return occtEllipseAxes(plane, radiusX, radiusY, rotation);
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
    return makeOcctSketchSplineEdge({
      entity,
      plane,
      deps: this.splineEdgeDeps(),
    });
  }

  private makeSplineEdge3D(path: Extract<Path3D, { kind: "path.spline" }>): {
    edge: any;
    start: [number, number, number];
    end: [number, number, number];
    closed: boolean;
  } {
    return makeOcctPathSplineEdge({
      path,
      deps: this.splineEdgeDeps(),
    });
  }

  private splineEdgeDeps() {
    return {
      newOcct: (name: string, ...args: any[]) => this.newOcct(name, ...args),
      call: (target: any, method: string, ...args: any[]) => this.call(target, method, ...args),
      makePnt: (x: number, y: number, z: number) => this.makePnt(x, y, z),
      readShape: (builder: any) => this.readShape(builder),
      point2Numbers: (point: Point2D, label: string) => this.point2Numbers(point, label),
      point2To3: (point: Point2D, plane: PlaneBasis) => this.point2To3(point, plane),
      point3Numbers: (point: Point3D, label: string) => this.point3Numbers(point, label),
      pointsClose: (a: [number, number, number], b: [number, number, number], tol?: number) =>
        this.pointsClose(a, b, tol),
      continuityC2: (this.occt as any).GeomAbs_Shape?.GeomAbs_C2,
    };
  }

  private makeFaceFromWire(wire: any) {
    return makeOcctFaceFromWire({
      wire,
      newOcct: (name, ...args) => this.newOcct(name, ...args),
    });
  }

  private readFace(builder: any) {
    return readOcctFace({
      builder,
      readShape: (target) => this.readShape(target),
    });
  }

  private addWireEdge(builder: any, edge: any): boolean {
    return addOcctWireEdge({ builder, edge: this.toEdge(edge) });
  }

  private checkLoopContinuity(
    segments: EdgeSegment[],
    allowOpen: boolean
  ): boolean {
    return checkOcctLoopContinuity(segments, allowOpen, {
      pointsClose: (a, b, tol) => this.pointsClose(a, b, tol),
    });
  }

  private pointsClose(
    a: [number, number, number],
    b: [number, number, number],
    tol = 1e-6
  ): boolean {
    return occtPointsClose(a, b, tol);
  }

  private dist2(a: Point2D, b: Point2D): number {
    return occtDist2(a, b);
  }

  private arcMidpoint(
    start: Point2D,
    end: Point2D,
    center: Point2D,
    direction: "cw" | "ccw"
  ): Point2D {
    return occtArcMidpoint(start, end, center, direction);
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
    return translateOcctShape(this.transformPrimitiveContext(), shape, delta);
  }

  private transformShapeScale(
    shape: any,
    origin: [number, number, number],
    factor: number
  ) {
    return scaleOcctShape(this.transformPrimitiveContext(), shape, origin, factor);
  }

  private transformShapeRotate(
    shape: any,
    origin: [number, number, number],
    axis: [number, number, number],
    angle: number
  ) {
    return rotateOcctShape(this.transformPrimitiveContext(), shape, origin, axis, angle);
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
