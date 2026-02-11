import type { BuildContext, ID, IntentPart } from "./ir.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { hashFeature, hashValue } from "./hash.js";
import type { ParamOverrides } from "./params.js";

export type PartCacheKey = {
  partId: ID;
  featureOrder: ID[];
  featureHashes: Record<ID, string>;
  paramsHash: string;
  contextHash: string;
  overridesHash?: string;
};

export function buildPartCacheKey(
  part: IntentPart,
  context: BuildContext,
  overrides?: ParamOverrides
): PartCacheKey {
  const featureHashes: Record<ID, string> = {};
  for (const feature of part.features) {
    featureHashes[feature.id] = hashFeature(feature);
  }
  const graph = buildDependencyGraph(part);
  const order = topoSortDeterministic(part.features, graph);
  return {
    partId: part.id,
    featureOrder: order,
    featureHashes,
    paramsHash: hashValue(part.params ?? []),
    contextHash: hashValue(context),
    overridesHash: overrides ? hashValue(overrides) : undefined,
  };
}
