import { IntentFeature, ID, Selector } from "./ir.js";
import type { PmiPayload } from "./pmi.js";
import type { FeatureStageEntry } from "./feature_staging.js";

export type KernelResult = {
  outputs: Map<string, KernelObject>;
  selections: KernelSelection[];
};

export type KernelObject = {
  id: ID;
  kind:
    | "solid"
    | "surface"
    | "face"
    | "edge"
    | "datum"
    | "pattern"
    | "profile"
    | "unknown";
  meta: Record<string, unknown>;
};

export type KernelSelection = {
  id: ID;
  kind: "face" | "edge" | "solid" | "surface";
  meta: Record<string, unknown>;
};

export type BackendCapabilities = {
  name?: string;
  featureKinds?: string[];
  featureStages?: Record<string, FeatureStageEntry>;
  mesh?: boolean;
  exports?: {
    step?: boolean;
    stl?: boolean;
  };
  assertions?: string[];
};

export type MeshOptions = {
  linearDeflection?: number;
  angularDeflection?: number;
  relative?: boolean;
  parallel?: boolean;
  includeEdges?: boolean;
  includeTangentEdges?: boolean;
  edgeSegmentLength?: number;
  edgeMaxSegments?: number;
};

export type StepSchema = "AP203" | "AP214" | "AP242";
export type StepUnit = "mm" | "cm" | "m" | "in";
export type StepExportOptions = {
  schema?: StepSchema;
  unit?: StepUnit;
  precision?: number;
};

export type StlFormat = "binary" | "ascii";
export type StlExportOptions = {
  format?: StlFormat;
  linearDeflection?: number;
  angularDeflection?: number;
  relative?: boolean;
};

export type MeshData = {
  positions: number[];
  indices?: number[];
  normals?: number[];
  faceIds?: number[];
  edgePositions?: number[];
  edgeIndices?: number[];
};

export type ExecuteInput = {
  feature: IntentFeature;
  upstream: KernelResult;
  resolve: (selector: Selector, upstream: KernelResult) => KernelSelection;
};

export interface Backend {
  capabilities?(): BackendCapabilities;
  execute(input: ExecuteInput): KernelResult;
  mesh(target: KernelObject, opts?: MeshOptions): MeshData;
  exportStep(target: KernelObject, opts?: StepExportOptions): Uint8Array;
  checkValid?(target: KernelObject): boolean;
  exportStepWithPmi?(
    target: KernelObject,
    pmi: PmiPayload,
    opts?: StepExportOptions
  ): Uint8Array;
  exportStl?(target: KernelObject, opts?: StlExportOptions): Uint8Array;
}

export interface BackendAsync {
  capabilities?(): Promise<BackendCapabilities> | BackendCapabilities;
  execute(input: ExecuteInput): Promise<KernelResult>;
  mesh(target: KernelObject, opts?: MeshOptions): Promise<MeshData>;
  exportStep(target: KernelObject, opts?: StepExportOptions): Promise<Uint8Array>;
  checkValid?(target: KernelObject): Promise<boolean> | boolean;
  exportStepWithPmi?(
    target: KernelObject,
    pmi: PmiPayload,
    opts?: StepExportOptions
  ): Promise<Uint8Array>;
  exportStl?(target: KernelObject, opts?: StlExportOptions): Promise<Uint8Array>;
}
