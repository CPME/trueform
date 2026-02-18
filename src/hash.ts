import { IntentFeature } from "./ir.js";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${body.join(",")}}`;
}

export function hashFeature(feature: IntentFeature): string {
  return hashValue(feature);
}

export function hashValue(value: unknown): string {
  const normalized = stableStringify(value);
  // 64-bit FNV-1a keeps this deterministic across runtimes while materially
  // reducing collision risk vs a 32-bit rolling hash.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= BigInt(normalized.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return `h${hash.toString(16).padStart(16, "0")}`;
}
