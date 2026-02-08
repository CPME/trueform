import type { BuildContext, FTIConstraint, FTIDatum, ID, IntentPart } from "./dsl.js";

export const TF_PMI_SCHEMA = "trueform.pmi.v1";

export type PmiPayload = {
  schema: typeof TF_PMI_SCHEMA;
  partId: ID;
  datums?: FTIDatum[];
  constraints: FTIConstraint[];
  context?: BuildContext;
};

export function buildPmiPayload(part: IntentPart, context?: BuildContext): PmiPayload {
  return {
    schema: TF_PMI_SCHEMA,
    partId: part.id,
    datums: part.datums ?? [],
    constraints: part.constraints ?? [],
    ...(context ? { context } : {}),
  };
}

export function buildPmiJson(part: IntentPart, context?: BuildContext): string {
  return JSON.stringify(buildPmiPayload(part, context));
}
