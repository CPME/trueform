import { FeatureIR } from "./ir.js";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const body = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${body.join(",")}}`;
}

export function hashFeature(feature: FeatureIR): string {
  const normalized = stableStringify(feature);
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const chr = normalized.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return `h${(hash >>> 0).toString(16)}`;
}
