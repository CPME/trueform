import type {
  KernelObject,
  KernelResult,
  KernelSelection,
  MeshData,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
} from "./backend.js";
import { resolveSelector } from "./selectors.js";
import { OcctBackend, type OcctModule } from "./backend_occt.js";
import type {
  NativeExecFeatureRequest,
  NativeExecFeatureResponse,
  NativeExportRequest,
  NativeKernelObject,
  NativeKernelResult,
  NativeKernelSelection,
  NativeMeshRequest,
  NativeOcctTransport,
  NativeStlExportRequest,
  NativeShapeHandle,
} from "./backend_occt_native.js";

export type LocalOcctTransportOptions = {
  occt: OcctModule;
  backend?: OcctBackend;
};

type InflateContext = {
  registry: ShapeRegistry;
};

type DeflateContext = {
  registry: ShapeRegistry;
};

class ShapeRegistry {
  private counter = 0;
  private shapes = new Map<NativeShapeHandle, any>();

  register(shape: any): NativeShapeHandle {
    const handle = `shape:${this.counter}`;
    this.counter += 1;
    this.shapes.set(handle, shape);
    return handle;
  }

  get(handle: NativeShapeHandle): any {
    const shape = this.shapes.get(handle);
    if (!shape) {
      throw new Error(`Missing shape handle ${handle}`);
    }
    return shape;
  }

  clear(): void {
    this.shapes.clear();
  }
}

export class LocalOcctTransport implements NativeOcctTransport {
  private backend: OcctBackend;
  private registry: ShapeRegistry;

  constructor(options: LocalOcctTransportOptions) {
    this.backend = options.backend ?? new OcctBackend({ occt: options.occt });
    this.registry = new ShapeRegistry();
  }

  async execFeature(
    request: NativeExecFeatureRequest
  ): Promise<NativeExecFeatureResponse> {
    const upstream = inflateKernelResult(request.upstream, {
      registry: this.registry,
    });
    const result = this.backend.execute({
      feature: request.feature,
      upstream,
      resolve: (selector, current) =>
        resolveSelector(selector, toResolutionContext(current)),
    });
    return {
      result: deflateKernelResult(result, { registry: this.registry }),
    };
  }

  async mesh(request: NativeMeshRequest): Promise<MeshData> {
    const shape = this.registry.get(request.handle);
    const target: KernelObject = {
      id: request.handle,
      kind: "solid",
      meta: { shape },
    };
    return this.backend.mesh(target, request.options);
  }

  async exportStep(request: NativeExportRequest): Promise<Uint8Array> {
    const shape = this.registry.get(request.handle);
    const target: KernelObject = {
      id: request.handle,
      kind: "solid",
      meta: { shape },
    };
    return this.backend.exportStep(target, request.options);
  }

  async exportStl(request: NativeStlExportRequest): Promise<Uint8Array> {
    if (!this.backend.exportStl) {
      throw new Error("Local OCCT transport: STL export not supported by backend");
    }
    const shape = this.registry.get(request.handle);
    const target: KernelObject = {
      id: request.handle,
      kind: "solid",
      meta: { shape },
    };
    return this.backend.exportStl(target, request.options);
  }

  async close(): Promise<void> {
    this.registry.clear();
  }
}

function inflateKernelResult(
  result: NativeKernelResult,
  ctx: InflateContext
): KernelResult {
  const outputs = new Map<string, KernelObject>();
  for (const entry of result.outputs) {
    outputs.set(entry.key, inflateKernelObject(entry.object, ctx));
  }
  const selections = result.selections.map((selection) =>
    inflateKernelSelection(selection, ctx)
  );
  return { outputs, selections };
}

function inflateKernelObject(
  obj: NativeKernelObject,
  ctx: InflateContext
): KernelObject {
  const meta = inflateMeta(obj.meta ?? {}, ctx);
  return { ...obj, meta };
}

function inflateKernelSelection(
  selection: NativeKernelSelection,
  ctx: InflateContext
): KernelSelection {
  const meta = inflateMeta(selection.meta ?? {}, ctx);
  return { ...selection, meta };
}

function inflateMeta(
  meta: Record<string, unknown>,
  ctx: InflateContext
): Record<string, unknown> {
  const next = { ...meta };
  const handle = next["handle"];
  if (typeof handle === "string") {
    next["shape"] = ctx.registry.get(handle);
  }
  const ownerHandle = next["ownerHandle"];
  if (typeof ownerHandle === "string") {
    next["owner"] = ctx.registry.get(ownerHandle);
  }
  const faceHandle = next["faceHandle"];
  if (typeof faceHandle === "string") {
    next["face"] = ctx.registry.get(faceHandle);
  }
  const wireHandle = next["wireHandle"];
  if (typeof wireHandle === "string") {
    next["wire"] = ctx.registry.get(wireHandle);
  }
  return next;
}

function deflateKernelResult(
  result: KernelResult,
  ctx: DeflateContext
): NativeKernelResult {
  const outputs: Array<{ key: string; object: NativeKernelObject }> = [];
  for (const [key, obj] of result.outputs) {
    outputs.push({ key, object: deflateKernelObject(obj, ctx) });
  }
  const selections = result.selections.map((selection) =>
    deflateKernelSelection(selection, ctx)
  );
  return { outputs, selections };
}

function deflateKernelObject(
  obj: KernelObject,
  ctx: DeflateContext
): NativeKernelObject {
  const meta = deflateMeta(obj.meta ?? {}, ctx);
  return { ...obj, meta } as NativeKernelObject;
}

function deflateKernelSelection(
  selection: KernelSelection,
  ctx: DeflateContext
): NativeKernelSelection {
  const meta = deflateMeta(selection.meta ?? {}, ctx);
  return { ...selection, meta } as NativeKernelSelection;
}

function deflateMeta(
  meta: Record<string, unknown>,
  ctx: DeflateContext
): Record<string, unknown> {
  const next = { ...meta };
  const shape = next["shape"];
  if (shape) {
    next["handle"] = ctx.registry.register(shape);
    delete next["shape"];
  }
  const owner = next["owner"];
  if (owner) {
    next["ownerHandle"] = ctx.registry.register(owner);
    delete next["owner"];
  }
  const face = next["face"];
  if (face) {
    next["faceHandle"] = ctx.registry.register(face);
    delete next["face"];
  }
  const wire = next["wire"];
  if (wire) {
    next["wireHandle"] = ctx.registry.register(wire);
    delete next["wire"];
  }
  return next;
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (obj.kind === "face" || obj.kind === "edge" || obj.kind === "solid") {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}
