import type { KernelResult, KernelSelection } from "../backend.js";
import type { Selector } from "../ir.js";
import { resolveSelectorSet } from "../selectors.js";
import type { ResolutionContext } from "../selectors.js";

export function toOcctResolutionContext(upstream: KernelResult): ResolutionContext {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (
      obj.kind === "face" ||
      obj.kind === "edge" ||
      obj.kind === "solid" ||
      obj.kind === "surface"
    ) {
      named.set(key, {
        id: obj.id,
        kind: obj.kind,
        meta: {
          ...obj.meta,
          ownerKey:
            typeof obj.meta["ownerKey"] === "string" && obj.meta["ownerKey"].trim().length > 0
              ? obj.meta["ownerKey"]
              : key,
        },
      });
    }
  }
  return { selections: upstream.selections, named };
}

export function resolveOwnerKey(
  selection: KernelSelection,
  upstream: KernelResult
): string {
  const ownerKey = selection.meta["ownerKey"];
  if (typeof ownerKey === "string") return ownerKey;
  for (const [key, output] of upstream.outputs) {
    if (output.kind === "solid") return key;
  }
  return "body:main";
}

export function resolveOwnerShape(
  selection: KernelSelection,
  upstream: KernelResult
): unknown | null {
  const owner = selection.meta["owner"];
  if (owner) return owner;
  if (selection.kind === "solid") {
    const shape = selection.meta["shape"];
    if (shape) return shape;
  }
  const key = resolveOwnerKey(selection, upstream);
  const output = upstream.outputs.get(key);
  return output?.meta["shape"] ?? null;
}

export function resolveSingleSelection(
  selector: Selector,
  upstream: KernelResult,
  label: string
): KernelSelection {
  const matches = resolveSelectorSet(selector, toOcctResolutionContext(upstream));
  if (matches.length === 0) {
    throw new Error(`OCCT backend: ${label} selector matched 0 entities`);
  }
  if (matches.length !== 1) {
    throw new Error(`OCCT backend: ${label} selector must resolve to exactly 1 entity`);
  }
  const [match] = matches;
  if (!match) {
    throw new Error(`OCCT backend: ${label} selector matched no entity`);
  }
  return match as KernelSelection;
}
