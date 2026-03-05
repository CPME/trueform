import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(".");
const workDir = resolve(repoRoot, "temp/package-verify");
const artifactDir = resolve(workDir, "artifacts");
const unpackDir = resolve(workDir, "unpacked");
const consumerDir = resolve(workDir, "consumer");
const npmCacheDir = resolve(workDir, "npm-cache");

await rm(workDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await mkdir(unpackDir, { recursive: true });
await mkdir(npmCacheDir, { recursive: true });

logStep("Building dist output");
run("npm", ["run", "build", "--", "--pretty", "false"]);

logStep("Packing module tarball");
run("npm", ["pack", "--pack-destination", artifactDir], { includeStderr: true });

const tarballs = (await readdir(artifactDir))
  .filter((name) => name.endsWith(".tgz"))
  .sort();
if (tarballs.length === 0) {
  throw new Error("npm pack did not return a tarball entry");
}
const tarballName = tarballs[tarballs.length - 1];
const tarballPath = resolve(artifactDir, tarballName);
const packedFilePaths = new Set(
  run("tar", ["-tzf", tarballPath])
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) =>
      entry.startsWith("package/") ? entry.slice("package/".length) : entry
    )
);

if (![...packedFilePaths].some((path) => path.startsWith("dist/"))) {
  throw new Error("Packed tarball is missing dist/* files");
}

for (const requiredPath of [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/dsl/geometry.js",
  "dist/dsl/geometry.d.ts",
]) {
  if (!packedFilePaths.has(requiredPath)) {
    throw new Error(`Packed tarball missing required file: ${requiredPath}`);
  }
}

logStep("Validating exports map targets against packed files");
const packedPackageJsonRaw = await readFile(resolve(repoRoot, "package.json"), "utf8");
const packedPackageJson = JSON.parse(packedPackageJsonRaw);
const exportErrors = validateExportTargets(packedPackageJson.exports ?? {}, packedFilePaths);
if (exportErrors.length > 0) {
  throw new Error(`Export target validation failed:\n- ${exportErrors.join("\n- ")}`);
}

logStep("Extracting tarball");
run("tar", ["-xzf", tarballPath, "-C", unpackDir]);
const unpackedPackageRoot = resolve(unpackDir, "package");

logStep("Running consumer import probe from packaged output");
await mkdir(resolve(consumerDir, "node_modules"), { recursive: true });
await cp(unpackedPackageRoot, resolve(consumerDir, "node_modules/trueform"), {
  recursive: true,
});
await writeFile(
  resolve(consumerDir, "package.json"),
  `${JSON.stringify({ name: "trueform-package-verify-consumer", private: true, type: "module" }, null, 2)}\n`
);
await writeFile(
  resolve(consumerDir, "probe.mjs"),
  [
    'import { solveSketchConstraintsDetailed } from "trueform";',
    'import { sketchConstraintCoincident } from "trueform/dsl/geometry";',
    "",
    'if (typeof solveSketchConstraintsDetailed !== "function") {',
    '  throw new Error("Expected solveSketchConstraintsDetailed export from trueform");',
    "}",
    'if (typeof sketchConstraintCoincident !== "function") {',
    '  throw new Error("Expected sketchConstraintCoincident export from trueform/dsl/geometry");',
    "}",
    'console.log("Consumer import probe passed.");',
    "",
  ].join("\n")
);
run("node", ["probe.mjs"], { cwd: consumerDir });

console.log("Package verification passed.");
console.log(`Tarball: ${tarballPath}`);
console.log("Verified imports:");
console.log('- import { solveSketchConstraintsDetailed } from "trueform"');
console.log('- import { sketchConstraintCoincident } from "trueform/dsl/geometry"');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NPM_CONFIG_CACHE: npmCacheDir,
      ...options.env,
    },
  });

  if (result.status !== 0) {
    const stdout = result.stdout?.trim() ?? "";
    const stderr = result.stderr?.trim() ?? "";
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (options.includeStderr) {
    return `${result.stdout ?? ""}${result.stderr ?? ""}`;
  }
  return result.stdout ?? "";
}

function validateExportTargets(exportsMap, packedFilePaths) {
  const errors = [];
  for (const [exportKey, target] of Object.entries(exportsMap)) {
    errors.push(...validateExportTarget(exportKey, target, packedFilePaths));
  }
  return errors;
}

function validateExportTarget(exportKey, target, packedFilePaths) {
  if (typeof target === "string") {
    return validateExportPath(exportKey, target, packedFilePaths);
  }
  if (target && typeof target === "object") {
    const errors = [];
    for (const [condition, conditionTarget] of Object.entries(target)) {
      errors.push(
        ...validateExportTarget(
          `${exportKey} (${condition})`,
          conditionTarget,
          packedFilePaths
        )
      );
    }
    return errors;
  }
  return [`Unsupported export target for ${exportKey}`];
}

function validateExportPath(exportKey, targetPath, packedFilePaths) {
  if (!targetPath.startsWith("./")) {
    return [`Export ${exportKey} target must start with ./ but found ${targetPath}`];
  }
  const normalized = targetPath.slice(2);
  if (!normalized.includes("*")) {
    return packedFilePaths.has(normalized)
      ? []
      : [`Export ${exportKey} points to missing file ${targetPath}`];
  }

  const pattern = new RegExp(
    `^${normalized
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")}$`
  );
  return [...packedFilePaths].some((path) => pattern.test(path))
    ? []
    : [`Export ${exportKey} wildcard target matches no packed files: ${targetPath}`];
}

function logStep(message) {
  console.log(`\n[verify:package] ${message}`);
}
