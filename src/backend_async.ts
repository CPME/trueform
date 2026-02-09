import type {
  Backend,
  BackendAsync,
  ExecuteInput,
  KernelObject,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
  MeshData,
  KernelResult,
} from "./backend.js";

export function backendToAsync(backend: Backend): BackendAsync {
  return {
    execute: async (input: ExecuteInput): Promise<KernelResult> => backend.execute(input),
    mesh: async (target: KernelObject, opts?: MeshOptions): Promise<MeshData> =>
      backend.mesh(target, opts),
    exportStep: async (
      target: KernelObject,
      opts?: StepExportOptions
    ): Promise<Uint8Array> => backend.exportStep(target, opts),
    exportStl: backend.exportStl
      ? async (target: KernelObject, opts?: StlExportOptions): Promise<Uint8Array> =>
          backend.exportStl!(target, opts)
      : undefined,
  };
}
