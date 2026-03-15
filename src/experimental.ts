export { buildAssembly, solveAssembly } from "./assembly.js";
export type {
  AssemblyInstanceState,
  AssemblySolveOptions,
  AssemblySolveResult,
} from "./assembly.js";

export { InMemoryJobQueue } from "./job_queue.js";
export type { JobError, JobRecord, JobState } from "./job_queue.js";

export { OcctNativeBackend } from "./backend_occt_native.js";
export type {
  NativeKernelObject,
  NativeKernelResult,
  NativeKernelSelection,
  NativeOcctTransport,
  OcctNativeBackendOptions,
} from "./backend_occt_native.js";

export {
  HttpOcctTransport,
  type FetchLike,
  type HttpOcctTransportOptions,
} from "./backend_occt_native_http.js";

export {
  LocalOcctTransport,
  type LocalOcctTransportOptions,
} from "./backend_occt_native_local.js";

export {
  TF_SELECTOR_ERROR_CODES,
  TfServiceClient,
  getEdgeSelection,
  getEdgeSelectionId,
  getMeshSelection,
  getMeshSelectionId,
  getSemanticTopologyContractVersion,
  indexBuildSelectionIds,
  isSelectorError,
  isSelectorErrorCode,
  isSemanticTopologyEnabled,
  type JobState as ServiceClientJobState,
  type PollJobOptions,
  selectionIdToNamedSelector,
  type RuntimeBuildSelectionSource,
  type RuntimeMeshSelectionSource,
  type RuntimeSelectionIdGroups,
  type RuntimeSelectionLookup,
  type RuntimeSelectionRecord,
  type SelectorErrorCode,
  type SelectorNamedRef,
  type SemanticTopologyCapabilities,
  type ServiceJob,
  type ServiceJobAccepted,
  type StreamJobOptions,
  type TfServiceClientOptions,
} from "./service_client.js";
