import type { BuildContext, ID, IntentPart } from "./ir.js";
import { hashValue } from "./hash.js";
import type { ParamOverrides } from "./params.js";
import { preparePart } from "./part_preparation.js";

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
  const prepared = preparePart(part, overrides, undefined, context.units);
  return {
    partId: prepared.normalized.id,
    featureOrder: prepared.featureOrder as ID[],
    featureHashes: prepared.featureHashes as Record<ID, string>,
    paramsHash: hashValue(part.params ?? []),
    contextHash: hashValue(context),
    overridesHash: overrides ? hashValue(overrides) : undefined,
  };
}
