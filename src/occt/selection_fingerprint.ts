export function normalizeSelectionToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 96);
}

export function stringFingerprint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stringArrayFingerprint(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim())
    .slice()
    .sort();
  return normalized.length > 0 ? normalized : undefined;
}

export function numberFingerprint(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Number(value.toFixed(6));
}

export function vectorFingerprint(
  value: unknown
): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const out: number[] = [];
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) return undefined;
    out.push(Number(entry.toFixed(6)));
  }
  return out as [number, number, number];
}
