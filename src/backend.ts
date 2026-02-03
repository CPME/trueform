import { FeatureIR, ID, Selector } from "./ir.js";

export type KernelResult = {
  outputs: Map<string, KernelObject>;
  selections: KernelSelection[];
};

export type KernelObject = {
  id: ID;
  kind: "solid" | "face" | "edge" | "datum" | "profile" | "unknown";
  meta: Record<string, unknown>;
};

export type KernelSelection = {
  id: ID;
  kind: "face" | "edge" | "solid";
  meta: Record<string, unknown>;
};

export type ExecuteInput = {
  feature: FeatureIR;
  upstream: KernelResult;
  resolve: (selector: Selector, upstream: KernelResult) => KernelSelection;
};

export interface Backend {
  execute(input: ExecuteInput): KernelResult;
}
