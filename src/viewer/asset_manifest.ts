export function collectMeshAssets(files: string[]): string[] {
  const seen = new Set<string>();
  for (const entry of files) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (!lower.endsWith(".mesh.json") && !lower.endsWith(".assembly.json")) continue;
    seen.add(name);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}
