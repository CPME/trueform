import { IntentFeature, ID, Selector } from "./dsl.js";

export type KernelResult = {
  outputs: Map<string, KernelObject>;
  selections: KernelSelection[];
};

export type KernelObject = {
  id: ID;
  kind: "solid" | "face" | "edge" | "datum" | "pattern" | "profile" | "unknown";
  meta: Record<string, unknown>;
};

export type KernelSelection = {
  id: ID;
  kind: "face" | "edge" | "solid";
  meta: Record<string, unknown>;
};

export type MeshOptions = {
  linearDeflection?: number;
  angularDeflection?: number;
  relative?: boolean;
  parallel?: boolean;
  includeEdges?: boolean;
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
  execute(input: ExecuteInput): KernelResult;
  mesh(target: KernelObject, opts?: MeshOptions): MeshData;
  exportStep(target: KernelObject, opts?: StepExportOptions): Uint8Array;
  exportStl?(target: KernelObject, opts?: StlExportOptions): Uint8Array;
}
