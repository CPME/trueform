import type { KernelResult, KernelSelection, KernelSelectionLineage } from "../backend.js";
import type { AxisDirection, MoveBody, MoveFace } from "../ir.js";
import type { ResolutionContext } from "../selectors.js";
import type { PlaneBasis } from "./plane_basis.js";

export type SelectionLedgerHint = {
  slot?: string;
  role?: string;
  lineage?: KernelSelectionLineage;
  aliases?: string[];
  signature?: string;
  provenance?: Record<string, unknown>;
};

export type CollectedSubshape = {
  shape: unknown;
  meta: Record<string, unknown>;
  ledger?: SelectionLedgerHint;
  occurrenceIndices?: number[];
};

export type SelectionLedgerPlan = {
  solid?: SelectionLedgerHint;
  faces?: (entries: CollectedSubshape[]) => void;
  edges?: (entries: CollectedSubshape[]) => void;
};

export type SelectionCollectionOptions = {
  rootKind?: "solid" | "face";
  ledgerPlan?: SelectionLedgerPlan;
};

export type EdgeAdjacencyEntry = {
  edge: unknown;
  faces: unknown[];
};

export type EdgeAdjacencyMap = Map<number, EdgeAdjacencyEntry[]> | null;

export type SelectionLedgerContext = {
  occt: any;
  applySelectionLedgerHint: (entry: CollectedSubshape, hint: SelectionLedgerHint) => void;
  basisFromNormal: (
    normal: [number, number, number],
    xHint: [number, number, number] | undefined,
    origin: [number, number, number]
  ) => PlaneBasis;
  callWithFallback: (target: any, methods: string[], argSets: any[][]) => any;
  collectEdgesFromShape: (shape: unknown) => unknown[];
  collectFacesFromShape: (shape: unknown) => unknown[];
  defaultAxisForNormal: (normal: [number, number, number]) => [number, number, number];
  numberFingerprint: (value: unknown) => number | undefined;
  scaleVec: (v: [number, number, number], s: number) => [number, number, number];
  selectionTieBreakerFingerprint: (
    kind: "face" | "edge",
    meta: Record<string, unknown>
  ) => Record<string, unknown>;
  shapeHash: (shape: unknown) => number;
  shapesSame: (left: unknown, right: unknown) => boolean;
  subVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  toWire: (shape: unknown) => unknown;
  uniqueKernelSelectionIds: (selections: KernelSelection[]) => string[];
  uniqueShapeList: (shapes: unknown[]) => unknown[];
  vectorFingerprint: (value: unknown) => [number, number, number] | undefined;
};

export type MetadataContext = {
  occt: any;
  adjacentFaces: (adjacency: EdgeAdjacencyMap, edge: unknown) => unknown[];
  buildEdgeAdjacency: (owner: unknown) => EdgeAdjacencyMap;
  call: (target: any, method: string, ...args: any[]) => any;
  callNumber: (target: any, method: string) => number;
  callWithFallback: (target: any, methods: string[], argSets: any[][]) => any;
  dirToArray: (dir: any) => [number, number, number];
  edgeEndpoints: (
    edge: unknown
  ) => { start: [number, number, number]; end: [number, number, number] } | null;
  newOcct: (name: string, ...args: any[]) => any;
  planeBasisFromFace: (face: unknown) => PlaneBasis;
  pointToArray: (point: any) => [number, number, number];
  shapeBounds: (shape: unknown) => { min: [number, number, number]; max: [number, number, number] };
  shapeHash: (shape: unknown) => number;
  shapesSame: (left: unknown, right: unknown) => boolean;
  toEdge: (shape: unknown) => unknown;
  toFace: (shape: unknown) => unknown;
};

export type FaceEditContext = {
  collectSelections: (
    shape: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[],
    opts?: SelectionCollectionOptions
  ) => KernelSelection[];
  collectToolFaces: (tools: KernelSelection[]) => unknown[];
  deleteFacesBySewing: (shape: unknown, removeFaces: unknown[]) => unknown | null;
  deleteFacesWithDefeaturing: (shape: unknown, removeFaces: unknown[]) => unknown | null;
  isValidShape: (shape: unknown) => boolean;
  makeFaceMutationSelectionLedgerPlan: (
    upstream: KernelResult,
    ownerShape: unknown,
    replacements: Array<{ from: KernelSelection; to: unknown }>
  ) => SelectionLedgerPlan;
  makeSolidFromShells: (shape: unknown) => unknown | null;
  makeSplitFaceSelectionLedgerPlan: (
    upstream: KernelResult,
    ownerShape: unknown,
    faceTargets: KernelSelection[]
  ) => SelectionLedgerPlan;
  normalizeSolid: (shape: unknown) => unknown;
  ownerFaceSelectionsForShape: (upstream: KernelResult, ownerShape: unknown) => KernelSelection[];
  replaceFacesBySewing: (
    shape: unknown,
    removeFaces: unknown[],
    replacements: unknown[]
  ) => unknown | null;
  replaceFacesWithReshape: (
    shape: unknown,
    replacements: Array<{ from: unknown; to: unknown }>
  ) => unknown | null;
  resolveAxisSpec: (
    axis: MoveFace["rotationAxis"] | MoveBody["rotationAxis"],
    upstream: KernelResult,
    label: string
  ) => [number, number, number];
  resolveOwnerKey: (selection: KernelSelection, upstream: KernelResult) => string;
  resolveOwnerShape: (selection: KernelSelection, upstream: KernelResult) => unknown | null;
  shapeHasSolid: (shape: unknown) => boolean;
  shapeHash: (shape: unknown) => number;
  splitByTools: (shape: unknown, tools: unknown[]) => unknown;
  toResolutionContext: (upstream: KernelResult) => ResolutionContext;
  transformShapeRotate: (
    shape: unknown,
    origin: [number, number, number],
    axis: [number, number, number],
    angleRad: number
  ) => unknown;
  transformShapeScale: (
    shape: unknown,
    origin: [number, number, number],
    scale: number
  ) => unknown;
  transformShapeTranslate: (shape: unknown, delta: [number, number, number]) => unknown;
  unifySameDomain: (shape: unknown) => unknown;
  uniqueFaceShapes: (selections: KernelSelection[]) => unknown[];
};

export type SurfaceEditContext = {
  applySelectionLedgerHint: (entry: CollectedSubshape, hint: SelectionLedgerHint) => void;
  collectEdgesFromShape: (shape: unknown) => unknown[];
  collectSelections: (
    shape: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[],
    opts?: SelectionCollectionOptions
  ) => KernelSelection[];
  containsShape: (shapes: unknown[], candidate: unknown) => boolean;
  countFaces: (shape: unknown) => number;
  edgeDirection: (edge: unknown, label: string) => [number, number, number];
  faceSelectionsForTarget: (target: KernelSelection, upstream: KernelResult) => KernelSelection[];
  isValidShape: (shape: unknown, kindHint?: "face" | "solid") => boolean;
  makeBoolean: (op: "cut" | "intersect", left: unknown, right: unknown) => unknown;
  makeCompoundFromShapes: (shapes: unknown[]) => unknown;
  makeFaceMutationSelectionLedgerPlan: (
    upstream: KernelResult,
    ownerShape: unknown,
    replacements: Array<{ from: KernelSelection; to: unknown }>
  ) => SelectionLedgerPlan;
  makeKnitSelectionLedgerPlan: (sourceFaces: KernelSelection[]) => SelectionLedgerPlan;
  makePlanarRectFace: (
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number],
    extents: { uMin: number; uMax: number; vMin: number; vMax: number }
  ) => unknown;
  makeSection: (first: unknown, second: unknown) => unknown;
  makeSolidFromShells: (shape: unknown) => unknown | null;
  makeSplitFaceSelectionLedgerPlan: (
    upstream: KernelResult,
    ownerShape: unknown,
    faceTargets: KernelSelection[]
  ) => SelectionLedgerPlan;
  normalizeSolid: (shape: unknown) => unknown;
  planeBasisFromFace: (face: unknown) => PlaneBasis;
  projectBoundsOnBasis: (
    points: [number, number, number][],
    origin: [number, number, number],
    xDir: [number, number, number],
    yDir: [number, number, number]
  ) => { uMin: number; uMax: number; vMin: number; vMax: number };
  readShape: (shape: unknown) => unknown;
  resolveSingleSelection: (selector: unknown, upstream: KernelResult, label: string) => KernelSelection;
  sampleEdgePoints: (
    edge: unknown,
    opts: { edgeSegmentLength?: number; edgeMaxSegments?: number }
  ) => [number, number, number][];
  selectionTieBreakerFingerprint: (
    kind: "edge",
    meta: Record<string, unknown>
  ) => Record<string, unknown>;
  sewShapeFaces: (shape: unknown, tolerance?: number) => unknown | null;
  shapeBoundsOverlap: (left: unknown, right: unknown) => boolean;
  shapeHasSolid: (shape: unknown) => boolean;
  shapeHash: (shape: unknown) => number;
  splitByTools: (shape: unknown, tools: unknown[]) => unknown;
  toFace: (shape: unknown) => unknown;
  toResolutionContext: (upstream: KernelResult) => ResolutionContext;
  uniqueKernelSelectionsById: (selections: KernelSelection[]) => KernelSelection[];
  uniqueShapeList: (shapes: unknown[]) => unknown[];
};

export type UnwrapContext = {
  buildEdgeAdjacency: (owner: unknown) => EdgeAdjacencyMap;
  collectSelections: (
    shape: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[],
    opts?: SelectionCollectionOptions
  ) => KernelSelection[];
  countFaces: (shape: unknown) => number;
  cylinderFromFace: (
    face: unknown
  ) => {
    origin: [number, number, number];
    axis: [number, number, number];
    xDir?: [number, number, number];
    yDir?: [number, number, number];
    radius: number;
  } | null;
  cylinderReferenceXDirection: (cylinder: {
    origin: [number, number, number];
    axis: [number, number, number];
    xDir?: [number, number, number];
    yDir?: [number, number, number];
    radius: number;
  }) => [number, number, number];
  edgeEndpoints: (
    edge: unknown
  ) => { start: [number, number, number]; end: [number, number, number] } | null;
  faceProperties: (face: unknown) => {
    area: number;
    center: [number, number, number];
    planar: boolean;
    normal?: AxisDirection;
    normalVec?: [number, number, number];
    surfaceType?: string;
  };
  firstFace: (shape: unknown) => unknown | null;
  isValidShape: (shape: unknown, kindHint?: "face" | "solid") => boolean;
  listFaces: (shape: unknown) => unknown[];
  makeCircleFace: (radius: number, center?: [number, number, number]) => unknown;
  makeCompoundFromShapes: (shapes: unknown[]) => unknown;
  makeFaceFromWire: (wire: unknown) => unknown;
  makePolygonWire: (points: [number, number, number][]) => unknown;
  planeBasisFromFace: (face: unknown) => PlaneBasis;
  readShape: (shape: unknown) => unknown;
  scaleVec: (v: [number, number, number], s: number) => [number, number, number];
  sewShapeFaces: (shape: unknown, tolerance?: number) => unknown | null;
  shapeBounds: (shape: unknown) => { min: [number, number, number]; max: [number, number, number] };
  shapeHasSolid: (shape: unknown) => boolean;
  shapeHash: (shape: unknown) => number;
  shapesSame: (left: unknown, right: unknown) => boolean;
  subVec: (a: [number, number, number], b: [number, number, number]) => [number, number, number];
  surfaceUvExtents: (face: unknown) => { uMin: number; uMax: number; vMin: number; vMax: number } | null;
  toFace: (shape: unknown) => unknown;
  toResolutionContext: (upstream: KernelResult) => ResolutionContext;
  transformShapeRotate: (
    shape: unknown,
    origin: [number, number, number],
    axis: [number, number, number],
    angleRad: number
  ) => unknown;
  transformShapeTranslate: (shape: unknown, delta: [number, number, number]) => unknown;
};
