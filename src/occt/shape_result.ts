import type { KernelResult, KernelSelection } from "../backend.js";
import type { SelectionCollectionOptions } from "./operation_contexts.js";

export function publishShapeResult(args: {
  shape: unknown;
  featureId: string;
  ownerKey: string;
  resultKey: string;
  outputKind: "solid" | "surface" | "face";
  tags?: string[];
  opts?: SelectionCollectionOptions;
  collectSelections: (
    shape: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[],
    opts?: SelectionCollectionOptions
  ) => KernelSelection[];
}): KernelResult {
  const outputs = new Map([
    [
      args.resultKey,
      {
        id: `${args.featureId}:${args.outputKind}`,
        kind: args.outputKind,
        meta: { shape: args.shape },
      },
    ],
  ]);
  const selections = args.collectSelections(
    args.shape,
    args.featureId,
    args.ownerKey,
    args.tags,
    args.opts
  );
  return { outputs, selections };
}
