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
    capabilities: backend.capabilities ? async () => backend.capabilities!() : undefined,
    execute: async (input: ExecuteInput): Promise<KernelResult> => backend.execute(input),
    mesh: async (target: KernelObject, opts?: MeshOptions): Promise<MeshData> =>
      backend.mesh(target, opts),
    exportStep: async (
      target: KernelObject,
      opts?: StepExportOptions
    ): Promise<Uint8Array> => backend.exportStep(target, opts),
    checkValid: backend.checkValid
      ? async (target: KernelObject): Promise<boolean> => backend.checkValid!(target)
      : undefined,
    exportStl: backend.exportStl
      ? async (target: KernelObject, opts?: StlExportOptions): Promise<Uint8Array> =>
          backend.exportStl!(target, opts)
      : undefined,
  };
}
