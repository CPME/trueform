import {
  Backend,
  BackendAsync,
  type BackendCapabilities,
  KernelResult,
  KernelSelection,
} from "./backend.js";
import { compileNormalizedPart } from "./compiler.js";
import { normalizePart } from "./ir_normalize.js";
import { type Graph, IntentPart, Selector, Units } from "./ir.js";
import { resolveConnectors, type ConnectorFrame } from "./connectors.js";
import { hashFeature } from "./hash.js";
import { ParamOverrides } from "./params.js";
import { resolveSelector } from "./selectors.js";
import { type ValidationOptions } from "./validate.js";
import { BackendError } from "./errors.js";

export type FeatureStep = {
  featureId: string;
  result: KernelResult;
};

export type BuildResult = {
  partId: string;
  order: string[];
  final: KernelResult;
  steps: FeatureStep[];
  connectors: Map<string, ConnectorFrame>;
  featureHashes: Record<string, string>;
  diagnostics: BuildExecutionDiagnostics;
};

export type BuildExecutionDiagnostics = {
  mode: "full" | "incremental";
  requestedChangedFeatureIds: string[];
  reusedFeatureIds: string[];
  invalidatedFeatureIds: string[];
  failedFeatureId: string | null;
};

export type BuildExecutionOptions = {
  incremental?: {
    previous?: BuildResult;
    changedFeatureIds?: string[];
  };
};

export function buildPart(
  part: IntentPart,
  backend: Backend,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units,
  execution?: BuildExecutionOptions
): BuildResult {
  const normalized = normalizePart(part, overrides, options, units);
  const compiled = compileNormalizedPart(normalized);
  const byId = new Map(normalized.features.map((f) => [f.id, f]));
  const caps = backend.capabilities ? backend.capabilities() : undefined;
  const featureHashes = hashFeatures(normalized);

  const plan = createIncrementalPlan(
    compiled.partId,
    compiled.featureOrder,
    compiled.graph,
    featureHashes,
    execution?.incremental
  );

  let current: KernelResult = plan.baseState;
  const steps: FeatureStep[] = plan.baseSteps;
  let failedFeatureId: string | null = null;

  for (let i = plan.startIndex; i < compiled.featureOrder.length; i += 1) {
    const id = compiled.featureOrder[i] as string;
    const feature = byId.get(id);
    if (!feature) throw new Error(`Missing feature ${id}`);
    ensureBackendSupports(caps, feature.kind);

    let result: KernelResult;
    try {
      result = backend.execute({
        feature,
        upstream: current,
        resolve: (selector: Selector, upstream: KernelResult) =>
          resolveSelector(selector, toResolutionContext(upstream)),
      });
    } catch (err) {
      failedFeatureId = id;
      throw withFeatureId(err, id);
    }

    current = mergeResults(current, result);
    steps.push({ featureId: id, result });
  }

  return {
    partId: compiled.partId,
    order: compiled.featureOrder,
    final: current,
    steps,
    connectors: resolveConnectors(normalized.connectors, current),
    featureHashes,
    diagnostics: {
      mode: plan.mode,
      requestedChangedFeatureIds: plan.requestedChangedFeatureIds,
      reusedFeatureIds: plan.reusedFeatureIds,
      invalidatedFeatureIds: plan.invalidatedFeatureIds,
      failedFeatureId,
    },
  };
}

export async function buildPartAsync(
  part: IntentPart,
  backend: BackendAsync,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units,
  execution?: BuildExecutionOptions
): Promise<BuildResult> {
  const normalized = normalizePart(part, overrides, options, units);
  const compiled = compileNormalizedPart(normalized);
  const byId = new Map(normalized.features.map((f) => [f.id, f]));
  const caps = backend.capabilities ? await backend.capabilities() : undefined;
  const featureHashes = hashFeatures(normalized);

  const plan = createIncrementalPlan(
    compiled.partId,
    compiled.featureOrder,
    compiled.graph,
    featureHashes,
    execution?.incremental
  );

  let current: KernelResult = plan.baseState;
  const steps: FeatureStep[] = plan.baseSteps;
  let failedFeatureId: string | null = null;

  for (let i = plan.startIndex; i < compiled.featureOrder.length; i += 1) {
    const id = compiled.featureOrder[i] as string;
    const feature = byId.get(id);
    if (!feature) throw new Error(`Missing feature ${id}`);
    ensureBackendSupports(caps, feature.kind);

    let result: KernelResult;
    try {
      result = await backend.execute({
        feature,
        upstream: current,
        resolve: (selector: Selector, upstream: KernelResult) =>
          resolveSelector(selector, toResolutionContext(upstream)),
      });
    } catch (err) {
      failedFeatureId = id;
      throw withFeatureId(err, id);
    }

    current = mergeResults(current, result);
    steps.push({ featureId: id, result });
  }

  return {
    partId: compiled.partId,
    order: compiled.featureOrder,
    final: current,
    steps,
    connectors: resolveConnectors(normalized.connectors, current),
    featureHashes,
    diagnostics: {
      mode: plan.mode,
      requestedChangedFeatureIds: plan.requestedChangedFeatureIds,
      reusedFeatureIds: plan.reusedFeatureIds,
      invalidatedFeatureIds: plan.invalidatedFeatureIds,
      failedFeatureId,
    },
  };
}

function mergeResults(a: KernelResult, b: KernelResult): KernelResult {
  const outputs = new Map(a.outputs);
  for (const [key, value] of b.outputs) outputs.set(key, value);
  const ownerKeys = new Set<string>();
  for (const selection of b.selections) {
    const ownerKey = selection.meta["ownerKey"];
    if (typeof ownerKey === "string") ownerKeys.add(ownerKey);
  }
  const baseSelections =
    ownerKeys.size === 0
      ? a.selections
      : a.selections.filter((selection) => {
          const ownerKey = selection.meta["ownerKey"];
          return typeof ownerKey !== "string" || !ownerKeys.has(ownerKey);
        });
  const selections = baseSelections.concat(b.selections);
  return { outputs, selections };
}

type IncrementalPlan = {
  mode: "full" | "incremental";
  startIndex: number;
  baseState: KernelResult;
  baseSteps: FeatureStep[];
  requestedChangedFeatureIds: string[];
  reusedFeatureIds: string[];
  invalidatedFeatureIds: string[];
};

function createIncrementalPlan(
  partId: string,
  featureOrder: string[],
  graph: Graph,
  featureHashes: Record<string, string>,
  incremental: BuildExecutionOptions["incremental"] | undefined
): IncrementalPlan {
  const requestedChangedFeatureIds = sanitizeFeatureIds(
    incremental?.changedFeatureIds ?? [],
    new Set(featureOrder)
  );
  const full: IncrementalPlan = {
    mode: "full",
    startIndex: 0,
    baseState: { outputs: new Map(), selections: [] },
    baseSteps: [],
    requestedChangedFeatureIds,
    reusedFeatureIds: [],
    invalidatedFeatureIds: featureOrder.slice(),
  };
  const previous = incremental?.previous;
  if (!previous || requestedChangedFeatureIds.length === 0) return full;
  if (previous.partId !== partId) return full;
  if (!sameOrder(previous.order, featureOrder)) return full;
  if (!Array.isArray(previous.steps) || previous.steps.length !== previous.order.length) return full;

  const changed = new Set<string>(requestedChangedFeatureIds);
  for (const id of featureOrder) {
    const nextHash = featureHashes[id];
    const prevHash = previous.featureHashes?.[id];
    if (typeof prevHash === "string" && prevHash === nextHash) continue;
    if (typeof prevHash !== "string" && nextHash === undefined) continue;
    if (prevHash !== nextHash) changed.add(id);
  }
  if (changed.size === 0) {
    return {
      mode: "incremental",
      startIndex: featureOrder.length,
      baseState: previous.final,
      baseSteps: previous.steps.slice(),
      requestedChangedFeatureIds,
      reusedFeatureIds: featureOrder.slice(),
      invalidatedFeatureIds: [],
    };
  }

  const downstream = downstreamClosure(changed, graph);
  let startIndex = featureOrder.length;
  for (let i = 0; i < featureOrder.length; i += 1) {
    const id = featureOrder[i];
    if (id && downstream.has(id)) {
      startIndex = i;
      break;
    }
  }
  if (startIndex <= 0) {
    return {
      ...full,
      mode: "incremental",
      requestedChangedFeatureIds,
    };
  }
  const reusedFeatureIds = featureOrder.slice(0, startIndex);
  const invalidatedFeatureIds = featureOrder.slice(startIndex);
  return {
    mode: "incremental",
    startIndex,
    baseState: reconstructStateFromSteps(previous.steps, startIndex),
    baseSteps: previous.steps.slice(0, startIndex),
    requestedChangedFeatureIds,
    reusedFeatureIds,
    invalidatedFeatureIds,
  };
}

function reconstructStateFromSteps(steps: FeatureStep[], count: number): KernelResult {
  let current: KernelResult = { outputs: new Map(), selections: [] };
  for (let i = 0; i < count; i += 1) {
    const step = steps[i];
    if (!step) continue;
    current = mergeResults(current, step.result);
  }
  return current;
}

function downstreamClosure(changed: Set<string>, graph: Graph): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const out = new Set<string>();
  const queue = Array.from(changed);
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || out.has(id)) continue;
    out.add(id);
    const next = adjacency.get(id) ?? [];
    for (const child of next) {
      if (!out.has(child)) queue.push(child);
    }
  }
  return out;
}

function sanitizeFeatureIds(ids: string[], known: Set<string>): string[] {
  return Array.from(
    new Set(
      ids
        .filter((id) => typeof id === "string")
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && known.has(id))
    )
  );
}

function sameOrder(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hashFeatures(part: IntentPart): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const feature of part.features) {
    hashes[feature.id] = hashFeature(feature);
  }
  return hashes;
}

function withFeatureId(err: unknown, featureId: string): unknown {
  if (!err || typeof err !== "object") return err;
  const target = err as { featureId?: string };
  if (typeof target.featureId !== "string") target.featureId = featureId;
  return target;
}

function ensureBackendSupports(caps: BackendCapabilities | undefined, featureKind: string): void {
  if (!caps || !caps.featureKinds) return;
  if (caps.featureKinds.includes(featureKind)) return;
  const name = caps.name ? ` (${caps.name})` : "";
  throw new BackendError(
    "backend_unsupported_feature",
    `Backend${name} does not support feature ${featureKind}`
  );
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (
      obj.kind === "face" ||
      obj.kind === "edge" ||
      obj.kind === "solid" ||
      obj.kind === "surface"
    ) {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}
