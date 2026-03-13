import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export function isDefaultTestEntry(entryName) {
  return /\.(?:e2e|module)\.test\.ts$/i.test(entryName);
}

export async function listDefaultTestFiles(
  srcTestsDir = resolve("src/tests"),
  distTestsDir = resolve("dist/tests")
) {
  const entries = await readdir(srcTestsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isDefaultTestEntry(entry.name))
    .map((entry) => resolve(distTestsDir, entry.name.replace(/\.ts$/i, ".js")))
    .sort();
}

export async function main() {
  const tests = await listDefaultTestFiles();

  if (tests.length === 0) {
    console.error("No default test files found in src/tests");
    process.exit(1);
  }

  for (const fullPath of tests) {
    const result = spawnSync("node", [fullPath], { stdio: "inherit" });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  await main();
}
