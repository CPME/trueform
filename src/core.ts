export * from "./ir.js";
export * from "./dsl.js";
export { IR_SCHEMA } from "./ir_schema.js";
export type { IrJsonSchema } from "./ir_schema.js";
export * from "./assertions.js";
export * from "./dimensions.js";
export * from "./build_cache.js";
export * from "./mesh_profiles.js";
export {
  TF_STAGED_FEATURES,
  listStagedFeatureKeys,
  featureStageKey,
  getFeatureStage,
} from "./feature_staging.js";
export type { FeatureStage, FeatureStageEntry } from "./feature_staging.js";
export { buildPart, buildPartAsync } from "./executor.js";
export { compileDocument, compilePart, emitIrDocument, emitIrPart } from "./compiler.js";
export { TF_PMI_SCHEMA, buildPmiPayload, buildPmiJson } from "./pmi.js";
export type { PmiPayload } from "./pmi.js";
export type { BuildResult, FeatureStep } from "./executor.js";
export type { ParamOverrides } from "./params.js";
export type {
  ValidationMode,
  ValidationOptions,
  StagedFeaturePolicy,
} from "./validate.js";
