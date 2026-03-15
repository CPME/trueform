import type {
  BackendCapabilities,
  BackendAsync,
  ExecuteInput,
  KernelObject,
  KernelResult,
  KernelSelection,
  MeshData,
  MeshOptions,
  StepExportOptions,
  StlExportOptions,
} from "./backend.js";
import type { IntentFeature } from "./ir.js";
import { BackendError } from "./errors.js";
import type { PmiPayload } from "./pmi.js";
import { assignStableSelectionIds, type CollectedSubshape } from "./occt/selection_ids.js";
import {
  normalizeSelectionToken,
  numberFingerprint,
  stringArrayFingerprint,
  stringFingerprint,
  vectorFingerprint,
} from "./occt/selection_fingerprint.js";

export type NativeShapeHandle = string;

export type NativeKernelObject = KernelObject & {
  meta: { handle: NativeShapeHandle; [key: string]: unknown };
};

export type NativeKernelSelection = KernelSelection & {
  meta: { handle: NativeShapeHandle; [key: string]: unknown };
};

export type NativeKernelResult = {
  outputs: Array<{ key: string; object: NativeKernelObject }>;
  selections: NativeKernelSelection[];
};

export type NativeExecFeatureRequest = {
  sessionId?: string;
  feature: IntentFeature;
  upstream: NativeKernelResult;
};

export type NativeExecFeatureResponse = {
  result: NativeKernelResult;
};

export type NativeMeshRequest = {
  sessionId?: string;
  handle: NativeShapeHandle;
  options?: MeshOptions;
};

export type NativeExportRequest = {
  sessionId?: string;
  handle: NativeShapeHandle;
  options?: StepExportOptions;
};

export type NativeExportPmiRequest = {
  sessionId?: string;
  handle: NativeShapeHandle;
  options?: StepExportOptions;
  pmi: PmiPayload;
};

export type NativeStlExportRequest = {
  sessionId?: string;
  handle: NativeShapeHandle;
  options?: StlExportOptions;
};

export type NativeOcctTransport = {
  capabilities?(): Promise<BackendCapabilities> | BackendCapabilities;
  execFeature(request: NativeExecFeatureRequest): Promise<NativeExecFeatureResponse>;
  mesh(request: NativeMeshRequest): Promise<MeshData>;
  exportStep(request: NativeExportRequest): Promise<Uint8Array>;
  exportStepWithPmi?(request: NativeExportPmiRequest): Promise<Uint8Array>;
  exportStl?(request: NativeStlExportRequest): Promise<Uint8Array>;
  close?(): Promise<void>;
};

export type OcctNativeBackendOptions = {
  transport: NativeOcctTransport;
  sessionId?: string;
};

export class OcctNativeBackend implements BackendAsync {
  private transport: NativeOcctTransport;
  private sessionId?: string;
  exportStepWithPmi?: (
    target: KernelObject,
    pmi: PmiPayload,
    opts?: StepExportOptions
  ) => Promise<Uint8Array>;

  constructor(options: OcctNativeBackendOptions) {
    this.transport = options.transport;
    this.sessionId = options.sessionId;
    if (this.transport.exportStepWithPmi) {
      this.exportStepWithPmi = async (
        target: KernelObject,
        pmi: PmiPayload,
        opts?: StepExportOptions
      ): Promise<Uint8Array> => {
        const handle = requireHandle(target);
        return this.transport.exportStepWithPmi!(
          this.withSession<NativeExportPmiRequest>({ handle, options: opts, pmi })
        );
      };
    }
  }

  capabilities(): Promise<BackendCapabilities> | BackendCapabilities {
    if (this.transport.capabilities) {
      return this.transport.capabilities();
    }
    return {
      name: "opencascade.native",
      mesh: true,
      exports: { step: true, stl: Boolean(this.transport.exportStl) },
      assertions: [],
    };
  }

  async execute(input: ExecuteInput): Promise<KernelResult> {
    const request: NativeExecFeatureRequest = this.withSession<NativeExecFeatureRequest>({
      feature: input.feature,
      upstream: serializeKernelResult(input.upstream),
    });
    const response = await this.transport.execFeature(request);
    return canonicalizeNativeSelectionIds(deserializeKernelResult(response.result));
  }

  async mesh(target: KernelObject, opts?: MeshOptions): Promise<MeshData> {
    const handle = requireHandle(target);
    return this.transport.mesh(
      this.withSession<NativeMeshRequest>({ handle, options: opts })
    );
  }

  async exportStep(
    target: KernelObject,
    opts?: StepExportOptions
  ): Promise<Uint8Array> {
    const handle = requireHandle(target);
    return this.transport.exportStep(
      this.withSession<NativeExportRequest>({ handle, options: opts })
    );
  }

  async exportStl(
    target: KernelObject,
    opts?: StlExportOptions
  ): Promise<Uint8Array> {
    if (!this.transport.exportStl) {
      throw new BackendError(
        "backend_missing_capability",
        "Native OCCT transport does not support STL export"
      );
    }
    const handle = requireHandle(target);
    return this.transport.exportStl(
      this.withSession<NativeStlExportRequest>({ handle, options: opts })
    );
  }

  async close(): Promise<void> {
    await this.transport.close?.();
  }

  private withSession<T extends { sessionId?: string }>(payload: T): T {
    if (!this.sessionId) return payload;
    return { ...payload, sessionId: this.sessionId };
  }
}

function serializeKernelResult(result: KernelResult): NativeKernelResult {
  const outputs: Array<{ key: string; object: NativeKernelObject }> = [];
  for (const [key, obj] of result.outputs) {
    outputs.push({ key, object: obj as NativeKernelObject });
  }
  return {
    outputs,
    selections: result.selections as NativeKernelSelection[],
  };
}

function deserializeKernelResult(result: NativeKernelResult): KernelResult {
  const outputs = new Map<string, KernelObject>();
  for (const entry of result.outputs) outputs.set(entry.key, entry.object);
  return { outputs, selections: result.selections };
}

function requireHandle(target: KernelObject): NativeShapeHandle {
  const handle = target.meta["handle"];
  if (typeof handle !== "string" || handle.length === 0) {
    throw new Error("Native OCCT backend requires a shape handle in target.meta.handle");
  }
  return handle;
}

function canonicalizeNativeSelectionIds(result: KernelResult): KernelResult {
  const selections = result.selections.slice();
  for (const kind of ["face", "edge"] as const) {
    const indexed = selections
      .map((selection, index) => ({ selection, index }))
      .filter(({ selection }) => selection.kind === kind && selection.id === kind);
    if (indexed.length === 0) continue;
    const assignments = assignStableSelectionIds(
      kind,
      indexed.map(({ selection }) => nativeSelectionEntry(selection)),
      {
        normalizeSelectionToken,
        stringFingerprint,
        stringArrayFingerprint,
        numberFingerprint,
        vectorFingerprint,
      }
    );
    for (let i = 0; i < indexed.length; i += 1) {
      const target = indexed[i];
      const assignment = assignments[i];
      if (!target || !assignment) continue;
      selections[target.index] = {
        ...target.selection,
        id: assignment.id,
        record: assignment.record,
        meta: target.selection.meta,
      };
    }
  }
  return { ...result, selections };
}

function nativeSelectionEntry(selection: KernelSelection): CollectedSubshape {
  const entry: CollectedSubshape = {
    meta: { ...selection.meta },
  };
  const slot =
    typeof selection.meta["selectionSlot"] === "string" &&
    selection.meta["selectionSlot"].trim().length > 0
      ? (selection.meta["selectionSlot"] as string)
      : undefined;
  const role =
    typeof selection.meta["role"] === "string" && selection.meta["role"].trim().length > 0
      ? (selection.meta["role"] as string)
      : undefined;
  const lineage =
    selection.meta["selectionLineage"] &&
    typeof selection.meta["selectionLineage"] === "object"
      ? (selection.meta["selectionLineage"] as any)
      : undefined;
  if (slot || role || lineage) {
    entry.ledger = {
      slot,
      role,
      lineage,
    };
  }
  return entry;
}
