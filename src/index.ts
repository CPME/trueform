export * from "./ir.js";
export * from "./dsl.js";
export { IR_SCHEMA } from "./ir_schema.js";
export type { IrJsonSchema } from "./ir_schema.js";
export { buildPart, buildPartAsync } from "./executor.js";
export { compileDocument, compilePart, emitIrDocument, emitIrPart } from "./compiler.js";
export { buildAssembly, solveAssembly } from "./assembly.js";
export * from "./export/index.js";
export { TF_PMI_SCHEMA, buildPmiPayload, buildPmiJson } from "./pmi.js";
export type { PmiPayload } from "./pmi.js";
export type { BuildResult, FeatureStep } from "./executor.js";
export type {
  AssemblySolveOptions,
  AssemblySolveResult,
  AssemblyInstanceState,
} from "./assembly.js";
export type {
  Backend,
  BackendAsync,
  ExecuteInput,
  KernelObject,
  KernelResult,
  KernelSelection,
  MeshData,
  MeshOptions,
  StlExportOptions,
  StlFormat,
  StepExportOptions,
  StepSchema,
  StepUnit,
} from "./backend.js";
export { backendToAsync } from "./backend_async.js";
export { MockBackend } from "./mock_backend.js";
export type {
  NativeOcctTransport,
  NativeKernelObject,
  NativeKernelSelection,
  NativeKernelResult,
  OcctNativeBackendOptions,
} from "./backend_occt_native.js";
export { OcctNativeBackend } from "./backend_occt_native.js";
export {
  LocalOcctTransport,
  type LocalOcctTransportOptions,
} from "./backend_occt_native_local.js";
export {
  HttpOcctTransport,
  type HttpOcctTransportOptions,
  type FetchLike,
} from "./backend_occt_native_http.js";
export type { ParamOverrides } from "./params.js";
export type { ValidationMode, ValidationOptions } from "./validate.js";
