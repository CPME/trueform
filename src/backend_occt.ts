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
  makeAx1 as makeOcctAx1,
  makeAx2 as makeOcctAx2,
  makeAx2WithXDir as makeOcctAx2WithXDir,
  makeAxis as makeOcctAxis,
  makeCirc as makeOcctCirc,
  makeDir as makeOcctDir,
  makePln as makeOcctPln,
  makePnt as makeOcctPnt,
  makePrism as makeOcctPrism,
  makeRevol as makeOcctRevol,
  makeVec as makeOcctVec,
  type ShapePrimitiveDeps,
} from "./occt/shape_primitives.js";
import {
  makeCircleFace as makeOcctCircleFace,
  makeCircleWire as makeOcctCircleWire,
  makePolygonWire as makeOcctPolygonWire,
  makeRectangleFace as makeOcctRectangleFace,
  makeRectangleWire as makeOcctRectangleWire,
  makeRegularPolygonFace as makeOcctRegularPolygonFace,
  makeRegularPolygonWire as makeOcctRegularPolygonWire,
  regularPolygonPoints as buildOcctRegularPolygonPoints,
  makeWireFromEdges as makeOcctWireFromEdges,
  type ProfilePrimitiveDeps,
} from "./occt/profile_primitives.js";
import {
  makeArcEdge as makeOcctArcEdge,
  makeCircleEdge as makeOcctCircleEdge,
  makeEllipseEdge as makeOcctEllipseEdge,
  makeLineEdge as makeOcctLineEdge,
  type CurveEdgePrimitiveDeps,
} from "./occt/curve_edge_primitives.js";
import {
  addLoftWire as addOcctLoftWire,
  makeBoolean as makeOcctBoolean,
  makeChamferBuilder as makeOcctChamferBuilder,
  makeDraftBuilder as makeOcctDraftBuilder,
  makeFilletBuilder as makeOcctFilletBuilder,
  makeLoftBuilder as makeOcctLoftBuilder,
  makeSection as makeOcctSection,
  makeShapeList as makeOcctShapeList,
  type BuilderPrimitiveDeps,
} from "./occt/builder_primitives.js";
import {
  execExtrude as execOcctExtrude,
  execLoft as execOcctLoft,
  execPipe as execOcctPipe,
  execPlane as execOcctPlane,
  execRevolve as execOcctRevolve,
  execSurface as execOcctSurface,
  type ModelingFeatureContext,
} from "./occt/modeling_feature_ops.js";
import {
  resolveHoleDepth as resolveOcctHoleDepth,
  resolveHoleEndCondition as resolveOcctHoleEndCondition,
  type HoleDepthDeps,
} from "./occt/hole_depth_ops.js";
import {
  makePipeSolid as makeOcctPipeSolid,
  makeRingFace as makeOcctRingFace,
  makeSweepSolid as makeOcctSweepSolid,
  makeThickSolid as makeOcctThickSolid,
  type PipeShellPrimitiveDeps,
} from "./occt/pipe_shell_primitives.js";
import {
  collectEdgesFromShape as collectOcctEdgesFromShape,
  collectFacesFromShape as collectOcctFacesFromShape,
  collectToolFaces as collectOcctToolFaces,
  containsShape as containsOcctShape,
  deleteFacesBySewing as deleteOcctFacesBySewing,
  deleteFacesWithDefeaturing as deleteOcctFacesWithDefeaturing,
  isValidShape as isOcctValidShape,
  makeSolidFromShells as makeOcctSolidFromShells,
  replaceFacesBySewing as replaceOcctFacesBySewing,
  replaceFacesWithReshape as replaceOcctFacesWithReshape,
  solidVolume as resolveOcctSolidVolume,
  uniqueFaceShapes as collectOcctUniqueFaceShapes,
  uniqueShapeList as collectOcctUniqueShapeList,
  type ShapeMutationPrimitiveDeps,
} from "./occt/shape_mutation_primitives.js";
import {
  axisBounds as resolveOcctAxisBounds,
  countFaces as countOcctFaces,
  cylinderReferenceXDirection as resolveOcctCylinderReferenceXDirection,
  cylinderVExtents as resolveOcctCylinderVExtents,
  firstFace as resolveOcctFirstFace,
  listFaces as resolveOcctListFaces,
  makeCompoundFromShapes as makeOcctCompoundFromShapes,
  shapeBounds as resolveOcctShapeBounds,
  shapeCenter as resolveOcctShapeCenter,
  surfaceUvExtents as resolveOcctSurfaceUvExtents,
  type ShapeAnalysisPrimitiveDeps,
} from "./occt/shape_analysis_primitives.js";
import {
  basisFromNormal as buildOcctBasisFromNormal,
  execDatumAxis as execOcctDatumAxis,
  execDatumFrame as execOcctDatumFrame,
  execDatumPlane as execOcctDatumPlane,
  offsetFromPlane as buildOcctOffsetFromPlane,
  patternCenters as buildOcctPatternCenters,
  resolveAxisSpec as resolveOcctAxisSpec,
  resolveExtrudeAxis as resolveOcctExtrudeAxis,
  resolvePattern as resolveOcctPattern,
  resolveThinFeatureAxisSpan as resolveOcctThinFeatureAxisSpan,
  type DatumPatternDeps,
} from "./occt/datum_pattern_ops.js";
import {
  buildSketchWire as buildOcctSketchWire,
  buildSketchWireWithStatus as buildOcctSketchWireWithStatus,
  segmentSlotsForLoop as collectOcctSegmentSlotsForLoop,
  type SketchWireBuilderDeps,
} from "./occt/sketch_wire_builder.js";
import {
  buildPathWire as buildOcctPathWire,
  pathEndTangent as buildOcctPathEndTangent,
  pathStartTangent as buildOcctPathStartTangent,
  type PathWireBuilderDeps,
} from "./occt/path_wire_builder.js";
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
  makePipeSelectionLedgerPlan as makeOcctPipeSelectionLedgerPlan,
  makePipeSweepSelectionLedgerPlan as makeOcctPipeSweepSelectionLedgerPlan,
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
import { OcctBackendMeshSupport } from "./occt_backend_mesh_support.js";

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

export class OcctBackend extends OcctBackendMeshSupport implements Backend {
  protected occt: OcctModule;

  constructor(options: OcctBackendOptions) {
    super();
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

  private modelingFeatureContext(): ModelingFeatureContext {
    return {
      collectSelections: (shape, featureId, ownerKey, featureTags, opts) =>
        this.collectSelections(shape, featureId, ownerKey, featureTags, opts),
      resolveProfile: (profileRef, upstream) => this.resolveProfile(profileRef as ProfileRef, upstream),
      buildProfileFace: (profile) => this.buildProfileFace(profile as ResolvedProfile),
      buildProfileWire: (profile) => this.buildProfileWire(profile as ResolvedProfile),
      resolveExtrudeAxis: (axis, profile, upstream) =>
        this.resolveExtrudeAxis(axis as ExtrudeAxis | undefined, profile as ResolvedProfile, upstream),
      makeVec: (x, y, z) => this.makeVec(x, y, z),
      makePrism: (faceOrWire, vec) => this.makePrism(faceOrWire, vec),
      readShape: (builder) => this.readShape(builder),
      makePrismSelectionLedgerPlan: (axis, ctx) =>
        this.makePrismSelectionLedgerPlan(axis, ctx as {
          prism: any;
          wire?: any;
          wireSegmentSlots?: string[];
        }),
      resolvePlaneBasis: (planeRef, upstream, resolve) =>
        this.resolvePlaneBasis(planeRef as PlaneRef, upstream, resolve),
      scaleVec: (v, s) => this.scaleVec(v, s),
      addVec: (a, b) => this.addVec(a, b),
      subVec: (a, b) => this.subVec(a, b),
      makePolygonWire: (points) => this.makePolygonWire(points as [number, number, number][]),
      makeFaceFromWire: (wire) => this.makeFaceFromWire(wire),
      makeAxis: (dir, origin) => this.makeAxis(dir as Revolve["axis"], origin as Revolve["origin"]),
      makeRevol: (faceOrWire, axis, angleRad) => this.makeRevol(faceOrWire, axis, angleRad),
      tryBuild: (builder) => this.tryBuild(builder),
      makeRevolveSelectionLedgerPlan: (angleRad, ctx) =>
        this.makeRevolveSelectionLedgerPlan(angleRad, ctx as {
          revol: any;
          wire: any;
          wireSegmentSlots: string[];
        }),
      makeLoftBuilder: (isSolid) => this.makeLoftBuilder(isSolid),
      addLoftWire: (builder, wire) => this.addLoftWire(builder, wire),
      callWithFallback: (target, methods, argSets) =>
        this.callWithFallback(target, methods, argSets as any),
      makeCylinder: (radius, height, axis, center) => this.makeCylinder(radius, height, axis, center),
      makePipeSelectionLedgerPlan: (opts) => this.makePipeSelectionLedgerPlan(opts),
      makeBoolean: (op, left, right) => this.makeBoolean(op, left, right),
      splitByTools: (shape, tools) => this.splitByTools(shape, tools as any[]),
      normalizeSolid: (shape) => this.normalizeSolid(shape),
    };
  }

  private holeDepthDeps(): HoleDepthDeps {
    return {
      occt: this.occt as any,
      shapeBounds: (shape: any) => this.shapeBounds(shape),
      axisBounds: (axis: [number, number, number], bounds) => this.axisBounds(axis, bounds),
      throughAllDepth: (shape: any, axisDir: [number, number, number], origin: [number, number, number]) =>
        this.throughAllDepth(shape, axisDir, origin),
      readShape: (shape: any) => this.readShape(shape),
      makeCylinder: (
        radius: number,
        height: number,
        axisDir: [number, number, number],
        origin: [number, number, number]
      ) => this.makeCylinder(radius, height, axisDir, origin),
      makeBoolean: (op: "intersect", left: any, right: any) => this.makeBoolean(op, left, right),
    };
  }

  private execExtrude(feature: Extrude, upstream: KernelResult): KernelResult {
    return execOcctExtrude(this.modelingFeatureContext(), feature, upstream);
  }

  private execPlane(
    feature: Plane,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctPlane(this.modelingFeatureContext(), feature, upstream, resolve);
  }

  private execSurface(feature: Surface, upstream: KernelResult): KernelResult {
    return execOcctSurface(this.modelingFeatureContext(), feature, upstream);
  }

  private execRevolve(feature: Revolve, upstream: KernelResult): KernelResult {
    return execOcctRevolve(this.modelingFeatureContext(), feature, upstream);
  }

  private execLoft(feature: Loft, upstream: KernelResult): KernelResult {
    return execOcctLoft(this.modelingFeatureContext(), feature, upstream);
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
    return resolveOcctThinFeatureAxisSpan(this.datumPatternDeps(), axis, origin, requestedDepth, upstream);
  }

  private execPipe(feature: Pipe, _upstream: KernelResult): KernelResult {
    return execOcctPipe(this.modelingFeatureContext(), feature);
  }

  private execDatumPlane(feature: DatumPlane, upstream: KernelResult): KernelResult {
    return execOcctDatumPlane(this.datumPatternDeps(), feature, upstream, (axis, state, label) =>
      this.resolveAxisSpec(axis, state, label)
    );
  }

  private execDatumAxis(feature: DatumAxis, upstream: KernelResult): KernelResult {
    return execOcctDatumAxis(this.datumPatternDeps(), feature, upstream, (axis, state, label) =>
      this.resolveAxisSpec(axis, state, label)
    );
  }

  private execDatumFrame(
    feature: DatumFrame,
    upstream: KernelResult,
    resolve: ExecuteInput["resolve"]
  ): KernelResult {
    return execOcctDatumFrame(this.datumPatternDeps(), feature, upstream, resolve);
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

  protected metadataContext(): MetadataContext {
    return {
      occt: this.occt,
      adjacentFaces: (adjacency, edge) => this.adjacentFaces(adjacency as any, edge),
      buildEdgeAdjacency: (owner) => this.buildEdgeAdjacency(owner),
      call: (target, method, ...args) => this.call(target, method, ...args),
      callNumber: (target, method) => this.callNumber(target, method),
      callWithFallback: (target, methods, argSets) => this.callWithFallback(target, methods, argSets),
      dirToArray: (dir) => this.dirToArray(dir),
      edgeEndpoints: (edge) => this.edgeEndpoints(edge),
      faceOrientationValue: (face) => this.faceOrientationValue(face),
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
      makePipeSweepSelectionLedgerPlan: (opts) => this.makePipeSweepSelectionLedgerPlan(opts),
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
      pathEndTangent: (path) => this.pathEndTangent(path),
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
      makePipeSweepSelectionLedgerPlan: (opts) => this.makePipeSweepSelectionLedgerPlan(opts),
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
        resolveHoleEndCondition: (holeFeature) => resolveOcctHoleEndCondition(holeFeature),
        resolveHoleDepth: (holeFeature, ownerShape, holeAxis, origin, holeRadius, endCondition) =>
          resolveOcctHoleDepth(
            this.holeDepthDeps(),
            holeFeature,
            ownerShape,
            holeAxis,
            origin,
            holeRadius,
            endCondition
          ),
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

  private makePipeSelectionLedgerPlan(opts: {
    axis: [number, number, number];
    origin: [number, number, number];
    innerRadius: number;
    length: number;
  }): SelectionLedgerPlan {
    return makeOcctPipeSelectionLedgerPlan(this.selectionLedgerContext(), opts);
  }

  private makePipeSweepSelectionLedgerPlan(opts: {
    startCenter: [number, number, number];
    endCenter: [number, number, number];
    hasInnerWall: boolean;
  }): SelectionLedgerPlan {
    return makeOcctPipeSweepSelectionLedgerPlan(this.selectionLedgerContext(), opts);
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
    return resolveOcctAxisSpec(this.datumPatternDeps(), axis, upstream, label);
  }

  private resolveExtrudeAxis(
    axis: ExtrudeAxis | undefined,
    profile: ResolvedProfile,
    upstream: KernelResult
  ): [number, number, number] {
    return resolveOcctExtrudeAxis(this.datumPatternDeps(), axis, profile, upstream);
  }

  private basisFromNormal(
    normal: [number, number, number],
    xHint: [number, number, number] | undefined,
    origin: [number, number, number]
  ): PlaneBasis {
    return buildOcctBasisFromNormal(this.datumPatternDeps(), normal, xHint, origin);
  }

  private defaultAxisForNormal(normal: [number, number, number]): [number, number, number] {
    return buildOcctBasisFromNormal(
      this.datumPatternDeps(),
      normal,
      undefined,
      [0, 0, 0]
    ).xDir;
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
    return buildOcctOffsetFromPlane(offset, xDir, yDir);
  }

  private addVec(
    a: [number, number, number],
    b: [number, number, number]
  ): [number, number, number] {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  protected subVec(
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
    return buildOcctPatternCenters(this.datumPatternDeps(), patternRef, position, holePlane, upstream);
  }

  private resolvePattern(patternRef: ID, upstream: KernelResult): Record<string, unknown> {
    return resolveOcctPattern(this.datumPatternDeps(), patternRef, upstream);
  }

  private buildPathWire(path: Path3D) {
    return buildOcctPathWire(path, this.pathWireBuilderDeps());
  }

  private pathStartTangent(path: Path3D): {
    start: [number, number, number];
    tangent: [number, number, number];
  } {
    return buildOcctPathStartTangent(path, {
      point3Numbers: (point: Point3D, label: string) => this.point3Numbers(point, label),
    });
  }

  private pathEndTangent(path: Path3D): {
    end: [number, number, number];
    tangent: [number, number, number];
  } {
    return buildOcctPathEndTangent(path, {
      point3Numbers: (point: Point3D, label: string) => this.point3Numbers(point, label),
    });
  }

  private makeShapeList(shapes: any[]): any {
    return makeOcctShapeList(this.builderPrimitiveDeps(), shapes);
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
    return makeOcctThickSolid(this.pipeShellPrimitiveDeps(), shape, removeFaces, offset, tolerance, opts);
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
    return makeOcctPipeSolid(this.pipeShellPrimitiveDeps(), spine, profile, frame as any, opts);
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
    return makeOcctSweepSolid(this.pipeShellPrimitiveDeps(), spine, profile, frame as any, opts);
  }

  private makeRingFace(
    center: [number, number, number],
    normal: [number, number, number],
    outerRadius: number,
    innerRadius: number
  ) {
    return makeOcctRingFace(this.pipeShellPrimitiveDeps(), center, normal, outerRadius, innerRadius);
  }

  protected makeWireFromEdges(edges: any[]) {
    return makeOcctWireFromEdges(this.profilePrimitiveDeps(), edges);
  }

  private makePolygonWire(points: [number, number, number][]) {
    return makeOcctPolygonWire(this.profilePrimitiveDeps(), points);
  }

  private regularPolygonPoints(
    center: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    radius: number,
    sides: number,
    rotation = 0
  ): [number, number, number][] {
    return buildOcctRegularPolygonPoints(center, xDir, yDir, radius, sides, rotation);
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
    return buildOcctSketchWire(loop, entityMap, plane, this.sketchWireBuilderDeps());
  }

  private buildSketchWireWithStatus(
    loop: ID[],
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis,
    allowOpen: boolean
  ): { wire: any; closed: boolean } {
    return buildOcctSketchWireWithStatus(
      loop,
      entityMap,
      plane,
      allowOpen,
      this.sketchWireBuilderDeps()
    );
  }

  private segmentSlotsForLoop(
    loop: ID[],
    entityMap: Map<ID, SketchEntity>,
    plane: PlaneBasis
  ): string[] {
    return collectOcctSegmentSlotsForLoop(loop, entityMap, plane, this.sketchWireBuilderDeps());
  }

  private sketchWireBuilderDeps(): SketchWireBuilderDeps {
    return {
      newOcct: (name: string, ...args: any[]) => this.newOcct(name, ...args),
      addWireEdge: (builder: any, edge: any) => this.addWireEdge(builder, edge),
      checkLoopContinuity: (segments: SketchEdgeSegment[], allowOpen: boolean) =>
        this.checkLoopContinuity(segments as EdgeSegment[], allowOpen),
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

  protected makeLineEdge(start: [number, number, number], end: [number, number, number]) {
    return makeOcctLineEdge(this.curveEdgePrimitiveDeps(), start, end);
  }

  private makeArcEdge(
    start: [number, number, number],
    mid: [number, number, number],
    end: [number, number, number]
  ) {
    return makeOcctArcEdge(this.curveEdgePrimitiveDeps(), start, mid, end);
  }

  private makeCircleEdge(
    center: [number, number, number],
    radius: number,
    normal: [number, number, number]
  ) {
    return makeOcctCircleEdge(this.curveEdgePrimitiveDeps(), center, radius, normal);
  }

  private makeEllipseEdge(
    center: [number, number, number],
    xDir: [number, number, number],
    normal: [number, number, number],
    major: number,
    minor: number
  ) {
    return makeOcctEllipseEdge(this.curveEdgePrimitiveDeps(), center, xDir, normal, major, minor);
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

  protected makeFaceFromWire(wire: any) {
    return makeOcctFaceFromWire({
      wire,
      newOcct: (name, ...args) => this.newOcct(name, ...args),
    });
  }

  protected readFace(builder: any) {
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
    return makeOcctRectangleWire(this.profilePrimitiveDeps(), width, height, center);
  }

  private makeRectangleFace(width: number, height: number, center?: Point3D) {
    return makeOcctRectangleFace(this.profilePrimitiveDeps(), width, height, center);
  }

  private makeCircleWire(radius: number, center?: Point3D) {
    return makeOcctCircleWire(this.profilePrimitiveDeps(), radius, center);
  }

  private makeCircleFace(radius: number, center?: Point3D) {
    return makeOcctCircleFace(this.profilePrimitiveDeps(), radius, center);
  }

  private makeRegularPolygonWire(
    sides: number,
    radius: number,
    center?: Point3D,
    rotation?: number
  ) {
    return makeOcctRegularPolygonWire(this.profilePrimitiveDeps(), sides, radius, center, rotation);
  }

  private makeRegularPolygonFace(
    sides: number,
    radius: number,
    center?: Point3D,
    rotation?: number
  ) {
    return makeOcctRegularPolygonFace(this.profilePrimitiveDeps(), sides, radius, center, rotation);
  }

  private readShape(builder: any) {
    if (builder.Shape) return builder.Shape();
    if (builder.shape) return builder.shape();
    throw new Error("OCCT backend: builder has no Shape()");
  }

  private makePrism(face: any, vec: any) {
    return makeOcctPrism(this.shapePrimitiveDeps(), face, vec);
  }

  private makeRevol(face: any, axis: any, angleRad: number) {
    return makeOcctRevol(this.shapePrimitiveDeps(), face, axis, angleRad);
  }

  protected newOcct(name: string, ...args: unknown[]) {
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

  protected makePnt(x: number, y: number, z: number) {
    return makeOcctPnt(this.shapePrimitiveDeps(), x, y, z);
  }

  protected makeDir(x: number, y: number, z: number) {
    return makeOcctDir(this.shapePrimitiveDeps(), x, y, z);
  }

  private makeVec(x: number, y: number, z: number) {
    return makeOcctVec(this.shapePrimitiveDeps(), x, y, z);
  }

  protected makeAx2(pnt: any, dir: any) {
    return makeOcctAx2(this.shapePrimitiveDeps(), pnt, dir);
  }

  private makeAx2WithXDir(pnt: any, dir: any, xDir: any) {
    return makeOcctAx2WithXDir(this.shapePrimitiveDeps(), pnt, dir, xDir);
  }

  private makeAx1(pnt: any, dir: any) {
    return makeOcctAx1(this.shapePrimitiveDeps(), pnt, dir);
  }

  private makePln(origin: [number, number, number], normal: [number, number, number]) {
    return makeOcctPln(this.shapePrimitiveDeps(), origin, normal);
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
    return makeOcctAxis(this.shapePrimitiveDeps(), dir, origin);
  }

  private makeCirc(ax2: any, radius: number) {
    return makeOcctCirc(this.shapePrimitiveDeps(), ax2, radius);
  }

  private shapePrimitiveDeps(): ShapePrimitiveDeps {
    return {
      occt: this.occt as any,
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
    };
  }

  private curveEdgePrimitiveDeps(): CurveEdgePrimitiveDeps {
    return {
      ...this.shapePrimitiveDeps(),
      readShape: (builder: any) => this.readShape(builder),
      call: (target: any, method: string, ...args: any[]) => this.call(target, method, ...args),
    };
  }

  private pathWireBuilderDeps(): PathWireBuilderDeps {
    return {
      newOcct: (name: string, ...args: any[]) => this.newOcct(name, ...args),
      addWireEdge: (builder: any, edge: any) => this.addWireEdge(builder, edge),
      point3Numbers: (point: Point3D, label: string) => this.point3Numbers(point, label),
      makeLineEdge: (start: [number, number, number], end: [number, number, number]) =>
        this.makeLineEdge(start, end),
      makeArcEdge: (
        start: [number, number, number],
        mid: [number, number, number],
        end: [number, number, number]
      ) => this.makeArcEdge(start, mid, end),
      makeSplineEdge3D: (path: Extract<Path3D, { kind: "path.spline" }>) => this.makeSplineEdge3D(path),
      pointsClose: (left: [number, number, number], right: [number, number, number], tol?: number) =>
        this.pointsClose(left, right, tol),
    };
  }

  protected builderPrimitiveDeps(): BuilderPrimitiveDeps {
    return {
      occt: this.occt as Record<string, any>,
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
      tryBuild: (builder: any) => this.tryBuild(builder),
      makeProgressRange: () => this.makeProgressRange(),
      callWithFallback: (target: any, methods: string[], argSets: unknown[][]) =>
        this.callWithFallback(target, methods, argSets as any),
      toWire: (wire: any) => this.toWire(wire),
    };
  }

  protected makeFilletBuilder(shape: any) {
    return makeOcctFilletBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeChamferBuilder(shape: any) {
    return makeOcctChamferBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeDraftBuilder(shape: any) {
    return makeOcctDraftBuilder(this.builderPrimitiveDeps(), shape);
  }

  protected makeLoftBuilder(isSolid: boolean) {
    return makeOcctLoftBuilder(this.builderPrimitiveDeps(), isSolid);
  }

  protected addLoftWire(builder: any, wire: any) {
    return addOcctLoftWire(this.builderPrimitiveDeps(), builder, wire);
  }

  protected makeBoolean(
    op: "union" | "subtract" | "intersect" | "cut",
    left: any,
    right: any
  ) {
    return makeOcctBoolean(this.builderPrimitiveDeps(), op, left, right);
  }

  protected makeSection(left: any, right: any) {
    return makeOcctSection(this.builderPrimitiveDeps(), left, right);
  }

  protected splitByTools(result: any, tools: any[]): any {
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
      const shape = this.callWithFallback(splitter, ["Shape", "Shape_1"], [[]]);
      return shape ?? result;
    } catch {
      return result;
    }
  }

  protected normalizeSolid(shape: any): any {
    const unified = this.unifySameDomain(shape);
    if (this.shapeHasSolid(unified)) return unified;
    const solidified = this.makeSolidFromShells(unified);
    if (solidified && this.shapeHasSolid(solidified)) return solidified;

    const solids = this.collectUniqueSubshapes(
      unified,
      (this.occt as any).TopAbs_ShapeEnum.TopAbs_SOLID,
      () => ({})
    ).map((entry) => entry.shape);
    if (solids.length === 0) return unified;

    let bestSolid = solids[0];
    let bestVolume = -Infinity;
    for (const solid of solids) {
      const volume = this.solidVolume(solid);
      if (volume > bestVolume) {
        bestVolume = volume;
        bestSolid = solid;
      }
    }
    return bestSolid;
  }

  protected countSolids(shape: any): number {
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

  protected reverseShape(shape: any): any {
    const candidates = ["Reverse_1", "Reverse"];
    for (const name of candidates) {
      const fn = shape?.[name];
      if (typeof fn !== "function") continue;
      try {
        const candidate = fn.call(shape);
        if (candidate) return candidate;
      } catch {
        continue;
      }
    }
    for (const name of candidates) {
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

  protected shapeHasSolid(shape: any): boolean {
    return this.countSolids(shape) > 0;
  }

  protected tryBuild(builder: any) {
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

  private pipeShellPrimitiveDeps(): PipeShellPrimitiveDeps {
    return {
      occt: this.occt as any,
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
      tryBuild: (builder: any) => this.tryBuild(builder),
      readShape: (shape: any) => this.readShape(shape),
      readFace: (shape: any) => this.readFace(shape),
      callWithFallback: (target: any, methods: string[], argSets: unknown[][]) =>
        this.callWithFallback(target, methods, argSets as any),
      makeProgressRange: () => this.makeProgressRange(),
      makeShapeList: (shapes: any[]) => this.makeShapeList(shapes),
      toFace: (face: any) => this.toFace(face),
      toWire: (wire: any) => this.toWire(wire),
      makePnt: (x: number, y: number, z: number) => this.makePnt(x, y, z),
      makeDir: (x: number, y: number, z: number) => this.makeDir(x, y, z),
      makeAx2WithXDir: (origin: any, normal: any, xDir: any) =>
        this.makeAx2WithXDir(origin, normal, xDir),
      makeCircleEdge: (center: [number, number, number], radius: number, normal: [number, number, number]) =>
        this.makeCircleEdge(center, radius, normal),
      makeWireFromEdges: (edges: any[]) => this.makeWireFromEdges(edges),
      makeFaceFromWire: (wire: any) => this.makeFaceFromWire(wire),
    };
  }

  protected shapeMutationPrimitiveDeps(): ShapeMutationPrimitiveDeps {
    return {
      occt: this.occt as any,
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
      callWithFallback: (target: any, methods: string[], argSets: unknown[][]) =>
        this.callWithFallback(target, methods, argSets as any),
      tryBuild: (builder: any) => this.tryBuild(builder),
      readShape: (shape: any) => this.readShape(shape),
      makeProgressRange: () => this.makeProgressRange(),
      toFace: (face: any) => this.toFace(face),
      toEdge: (edge: any) => this.toEdge(edge),
      toShell: (shell: any) => this.toShell(shell),
      shapeHash: (shape: any) => this.shapeHash(shape),
      shapesSame: (left: any, right: any) => this.shapesSame(left, right),
      checkValid: (target: KernelObject) => this.checkValid(target),
      countSolids: (shape: any) => this.countSolids(shape),
      makeShapeList: (shapes: any[]) => this.makeShapeList(shapes),
    };
  }

  protected shapeAnalysisDeps(): ShapeAnalysisPrimitiveDeps {
    return {
      occt: this.occt as any,
      newOcct: (name: string, ...args: unknown[]) => this.newOcct(name, ...args),
      pointToArray: (point: any) => this.pointToArray(point),
      toFace: (face: any) => this.toFace(face),
      callWithFallback: (target: any, methods: string[], argSets: unknown[][]) =>
        this.callWithFallback(target, methods, argSets as any),
      callNumber: (target: any, name: string) => this.callNumber(target, name),
    };
  }

  private datumPatternDeps(): DatumPatternDeps {
    const shapeAnalysis = this.shapeAnalysisDeps();
    return {
      datumKey: (id: string) => this.datumKey(id),
      patternKey: (id: string) => this.patternKey(id),
      addVec: (a, b) => this.addVec(a, b),
      subVec: (a, b) => this.subVec(a, b),
      scaleVec: (v, s) => this.scaleVec(v, s),
      planeBasisFromFace: (face: unknown) => this.planeBasisFromFace(face),
      axisBounds: resolveOcctAxisBounds,
      shapeBounds: (shape: unknown) => resolveOcctShapeBounds(shapeAnalysis, shape),
    };
  }

  private profilePrimitiveDeps(): ProfilePrimitiveDeps {
    return {
      ...this.shapePrimitiveDeps(),
      point3Numbers: (point: Point3D, label: string) => this.point3Numbers(point, label),
      readShape: (builder: any) => this.readShape(builder),
      makeFaceFromWire: (wire: any) => this.makeFaceFromWire(wire),
      readFace: (builder: any) => this.readFace(builder),
      addWireEdge: (builder: any, edge: any) => this.addWireEdge(builder, edge),
    };
  }

}
