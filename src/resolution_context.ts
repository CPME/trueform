import type { KernelResult } from "./backend.js";
import type { ResolutionContext, Selection } from "./selectors.js";

export function kernelResultToResolutionContext(upstream: KernelResult): ResolutionContext {
  const named = new Map<string, Selection>();
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
