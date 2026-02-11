import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
const exportsMap = packageJson.exports ?? {};
const requiredExportKeys = ["./backend", "./backend-spi", "./experimental", "./export"];
const exportErrors = [];

for (const key of requiredExportKeys) {
  if (!Object.prototype.hasOwnProperty.call(exportsMap, key)) {
    exportErrors.push(`package.json exports missing required key: ${key}`);
  }
}

const rootIndex = await readFile(resolve("src/index.ts"), "utf8");
const forbiddenRootTokens = [
  "buildAssembly",
  "solveAssembly",
  "OcctBackend",
  "MockBackend",
  "backendToAsync",
  "./backend.js",
  "./backend_async.js",
  "./backend_occt.js",
  "./backend_occt_native.js",
  "./backend_occt_native_http.js",
  "./backend_occt_native_local.js",
  "./assembly.js",
  "./experimental.js",
];

const boundaryErrors = [...exportErrors];
for (const token of forbiddenRootTokens) {
  if (rootIndex.includes(token)) {
    boundaryErrors.push(`src/index.ts contains forbidden root export token: ${token}`);
  }
}

const dslFiles = await walkTsFiles(resolve("src/dsl"));
const coreFiles = [
  ...dslFiles.map((f) => relativize(f)),
  "src/compiler.ts",
  "src/ir.ts",
  "src/ir_convert.ts",
  "src/ir_normalize.ts",
  "src/ir_schema.ts",
  "src/ir_validate.ts",
  "src/validate.ts",
  "src/selectors.ts",
];

const forbiddenCoreImportPatterns = [
  /from\s+["']\.\/backend\.js["']/,
  /from\s+["']\.\/backend_async\.js["']/,
  /from\s+["']\.\/backend_occt(?:_native(?:_http|_local)?)?\.js["']/,
  /from\s+["']\.\/mock_backend\.js["']/,
  /from\s+["']\.\/experimental\.js["']/,
  /from\s+["']\.\/backends\.js["']/,
];

for (const file of coreFiles) {
  const content = await readFile(resolve(file), "utf8");
  for (const pattern of forbiddenCoreImportPatterns) {
    if (pattern.test(content)) {
      boundaryErrors.push(`Forbidden core import in ${file}: ${String(pattern)}`);
    }
  }
}

if (boundaryErrors.length > 0) {
  console.error("Boundary guardrail failed:");
  for (const err of boundaryErrors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("Boundary guardrail passed.");

async function walkTsFiles(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkTsFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function relativize(path) {
  const cwd = resolve(".");
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}
