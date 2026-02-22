import type { KernelResult, KernelSelection } from "../backend.js";
import type { Selector } from "../ir.js";
import { resolveSelectorSet } from "../selectors.js";

export type EdgeModifierFeature = {
  id: string;
  edges: Selector;
  tags?: string[];
};

type ResolutionContext = {
  selections: KernelSelection[];
  named: Map<string, KernelSelection>;
};

export type EdgeModifierDeps = {
  toResolutionContext: (upstream: KernelResult) => ResolutionContext;
  resolveOwnerKey: (selection: KernelSelection, upstream: KernelResult) => string;
  resolveOwnerShape: (
    selection: KernelSelection,
    upstream: KernelResult
  ) => unknown | null;
  toEdge: (edge: unknown) => unknown;
  tryBuild: (builder: unknown) => void;
  readShape: (builder: unknown) => unknown;
  collectSelections: (
    shape: unknown,
    featureId: string,
    ownerKey: string,
    tags?: string[]
  ) => KernelSelection[];
};

export function executeEdgeModifier(
  label: "fillet" | "chamfer",
  feature: EdgeModifierFeature,
  upstream: KernelResult,
  deps: EdgeModifierDeps,
  makeBuilder: (owner: unknown) => unknown,
  addEdge: (builder: unknown, edge: unknown) => boolean
): KernelResult {
  const targets = resolveSelectorSet(feature.edges, deps.toResolutionContext(upstream));
  if (targets.length === 0) {
    throw new Error(`OCCT backend: ${label} selector matched 0 edges`);
  }
  for (const target of targets) {
    if (target.kind !== "edge") {
      throw new Error(`OCCT backend: ${label} selector must resolve to an edge`);
    }
  }

  const ownerKey = deps.resolveOwnerKey(targets[0] as KernelSelection, upstream);
  const owner = deps.resolveOwnerShape(targets[0] as KernelSelection, upstream);
  if (!owner) {
    throw new Error(`OCCT backend: ${label} target missing owner solid`);
  }

  const builder = makeBuilder(owner);
  for (const target of targets) {
    const edge = deps.toEdge(target.meta["shape"]);
    if (!addEdge(builder, edge)) {
      throw new Error(`OCCT backend: failed to add ${label} edge`);
    }
  }

  deps.tryBuild(builder);
  const solid = deps.readShape(builder);
  const outputs = new Map([
    [
      ownerKey,
      {
        id: `${feature.id}:solid`,
        kind: "solid" as const,
        meta: { shape: solid },
      },
    ],
  ]);
  const selections = deps.collectSelections(solid, feature.id, ownerKey, feature.tags);
  return { outputs, selections };
}
