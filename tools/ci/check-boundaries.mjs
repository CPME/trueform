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

const dslFiles = await walkFiles(resolve("src/dsl"), [".ts"]);
const coreFiles = [
  ...dslFiles.map((f) => relativize(f)),
  "src/compiler.ts",
  "src/ir.ts",
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

const srcFiles = (await walkFiles(resolve("src"), [".ts"])).map((file) => relativize(file));
const appFiles = (await walkFiles(resolve("apps"), [".mjs", ".ts", ".js"])).map((file) =>
  relativize(file)
);
const projectSourceFiles = [...srcFiles, ...appFiles];

await checkResolutionContextUtilityBoundaries(projectSourceFiles, boundaryErrors);
await checkSelectionSlotUtilityBoundaries(projectSourceFiles, boundaryErrors);
await checkTfServiceBoundaries(boundaryErrors);
await checkWorkspacePackageBoundaries(boundaryErrors);

if (boundaryErrors.length > 0) {
  console.error("Boundary guardrail failed:");
  for (const err of boundaryErrors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("Boundary guardrail passed.");

async function walkFiles(dir, extensions) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, extensions)));
      continue;
    }
    if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function relativize(path) {
  const cwd = resolve(".");
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

async function checkResolutionContextUtilityBoundaries(files, boundaryErrors) {
  const allowedFiles = new Set([
    "src/resolution_context.ts",
    "src/occt/selection_resolution.ts",
  ]);

  for (const file of files) {
    if (allowedFiles.has(file)) continue;
    const content = await readFile(resolve(file), "utf8");
    if (
      content.includes("const named = new Map") &&
      content.includes("upstream.outputs") &&
      content.includes('obj.kind === "face"')
    ) {
      boundaryErrors.push(
        `Resolution-context builder logic should live in src/resolution_context.ts or src/occt/selection_resolution.ts, found in ${file}`
      );
    }
  }
}

async function checkSelectionSlotUtilityBoundaries(files, boundaryErrors) {
  for (const file of files) {
    if (file === "src/selection_slots.ts") continue;
    const content = await readFile(resolve(file), "utf8");
    if (/\bfunction\s+parseSplitBranchSlot\b/.test(content)) {
      boundaryErrors.push(
        `parseSplitBranchSlot must stay centralized in src/selection_slots.ts, found in ${file}`
      );
    }
    if (/\bfunction\s+semanticBaseSlot\b/.test(content)) {
      boundaryErrors.push(
        `semanticBaseSlot must stay centralized in src/selection_slots.ts, found in ${file}`
      );
    }
  }
}

async function checkTfServiceBoundaries(boundaryErrors) {
  const tfServiceFiles = (await walkFiles(resolve("apps/tf-service"), [".mjs"])).map((file) =>
    relativize(file)
  );

  for (const file of tfServiceFiles) {
    const content = await readFile(resolve(file), "utf8");
    const imports = [...content.matchAll(/from\s+["'](.+?)["']/g)].map((match) => match[1]);

    if (file.startsWith("apps/tf-service/route_")) {
      for (const specifier of imports) {
        if (specifier === "./server.mjs" || specifier.startsWith("./route_")) {
          boundaryErrors.push(
            `tf-service route modules must not import server or peer routes: ${file} -> ${specifier}`
          );
        }
      }
    }

    if (file.startsWith("apps/tf-service/service_") || file === "apps/tf-service/job_runtime.mjs") {
      for (const specifier of imports) {
        if (specifier === "./server.mjs" || specifier.startsWith("./route_")) {
          boundaryErrors.push(
            `tf-service services/job runtime must not import server or routes: ${file} -> ${specifier}`
          );
        }
      }
    }
  }
}

async function checkWorkspacePackageBoundaries(boundaryErrors) {
  const workspacePackageFiles = (
    await walkFiles(resolve("packages"), [".ts"])
  ).map((file) => relativize(file));

  for (const file of workspacePackageFiles) {
    if (!file.includes("/src/")) continue;
    const content = await readFile(resolve(file), "utf8");
    const imports = [...content.matchAll(/from\s+["'](.+?)["']/g)].map((match) => match[1]);

    for (const specifier of imports) {
      if (specifier.includes("/src/")) {
        boundaryErrors.push(
          `workspace package source must not import root src modules directly: ${file} -> ${specifier}`
        );
      }
    }
  }
}
