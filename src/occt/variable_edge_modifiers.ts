import type { KernelResult, KernelSelection } from "../backend.js";
import type { VariableChamfer, VariableFillet } from "../ir.js";
import { resolveSelectorSet } from "../selectors.js";
import { expectNumber } from "./vector_math.js";
import type { VariableEdgeModifierContext } from "./operation_contexts.js";

type VariableModifierLabel = "variable fillet" | "variable chamfer";

type VariableEntrySpec = {
  edge: VariableFillet["entries"][number]["edge"] | VariableChamfer["entries"][number]["edge"];
  value: number;
};

export function executeVariableEdgeModifier(params: {
  label: VariableModifierLabel;
  feature: VariableFillet | VariableChamfer;
  upstream: KernelResult;
  ctx: VariableEdgeModifierContext;
  makeBuilder: (owner: unknown) => unknown;
  entries: VariableEntrySpec[];
  addEdge: (builder: unknown, edge: unknown, value: number) => boolean;
}): KernelResult {
  const { label, feature, upstream, ctx, makeBuilder, entries, addEdge } = params;
  const source = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (source.length !== 1 || source[0]?.kind !== "solid") {
    throw new Error(`OCCT backend: ${label} source selector must resolve to one solid`);
  }
  const sourceSelection = source[0] as KernelSelection;
  const ownerKey = ctx.resolveOwnerKey(sourceSelection, upstream);
  const ownerShape = ctx.resolveOwnerShape(sourceSelection, upstream);
  if (!ownerShape) {
    throw new Error(`OCCT backend: ${label} source missing owner solid`);
  }

  const builder = makeBuilder(ownerShape);
  const addedEdges: unknown[] = [];
  let addedAny = false;
  for (const [index, entry] of entries.entries()) {
    const targets = resolveSelectorSet(entry.edge, ctx.toResolutionContext(upstream));
    if (targets.length === 0) {
      throw new Error(`OCCT backend: ${label} entry ${index} matched 0 edges`);
    }
    for (const target of targets) {
      if (target.kind !== "edge") {
        throw new Error(`OCCT backend: ${label} entries must resolve to edges`);
      }
      const targetOwner = ctx.resolveOwnerKey(target as KernelSelection, upstream);
      if (targetOwner !== ownerKey) {
        throw new Error(`OCCT backend: ${label} edges must belong to source solid`);
      }
      const edge = ctx.toEdge(target.meta["shape"]);
      if (ctx.containsShape(addedEdges, edge)) continue;
      if (!addEdge(builder, edge, entry.value)) {
        throw new Error(`OCCT backend: failed to add ${label} edge`);
      }
      addedEdges.push(edge);
      addedAny = true;
    }
  }

  if (!addedAny) {
    throw new Error(`OCCT backend: ${label} resolved no unique edges`);
  }

  ctx.tryBuild(builder);
  const solid = ctx.readShape(builder);
  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:solid`,
        kind: "solid" as const,
        meta: { shape: solid },
      },
    ],
  ]);
  const selections = ctx.collectSelections(solid, feature.id, feature.result, feature.tags);
  return { outputs, selections };
}

export function variableFilletEntries(feature: VariableFillet): VariableEntrySpec[] {
  return feature.entries.map((entry, index) => ({
    edge: entry.edge,
    value: (() => {
      const radius = expectNumber(entry.radius, `variable fillet radius[${index}]`);
      if (!(radius > 0)) {
        throw new Error("OCCT backend: variable fillet radius must be positive");
      }
      return radius;
    })(),
  }));
}

export function variableChamferEntries(feature: VariableChamfer): VariableEntrySpec[] {
  return feature.entries.map((entry, index) => ({
    edge: entry.edge,
    value: (() => {
      const distance = expectNumber(entry.distance, `variable chamfer distance[${index}]`);
      if (!(distance > 0)) {
        throw new Error("OCCT backend: variable chamfer distance must be positive");
      }
      return distance;
    })(),
  }));
}
