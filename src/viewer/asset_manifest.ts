export function collectMeshAssets(files: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of files) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    if (!name.toLowerCase().endsWith(".mesh.json")) continue;
    seen.add(name);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
