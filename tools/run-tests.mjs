import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const srcTestsDir = resolve("src/tests");
const distTestsDir = resolve("dist/tests");
const entries = await readdir(srcTestsDir, { withFileTypes: true });
const tests = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".e2e.test.ts"))
  .map((entry) => entry.name.replace(/\.ts$/, ".js"))
  .sort();

if (tests.length === 0) {
  console.error(`No test files found in ${srcTestsDir}`);
  process.exit(1);
}

for (const testFile of tests) {
  const fullPath = resolve(distTestsDir, testFile);
  const result = spawnSync("node", [fullPath], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
