import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { resolve } from "node:path";

const DOCS_MAP = resolve("specs/docs-map.md");
const REQUIRED_SNIPPETS = [
  {
    file: "README.md",
    includes: "Core compile is part-centric",
    label: "README assembly/compile contract",
  },
  {
    file: "docs/reference/dsl/assembly.md",
    includes: "experimental rather than part of the deterministic part compile pipeline",
    label: "Assembly DSL experimental status",
  },
  {
    file: "specs/v1-contract.md",
    includes: "Assembly intent is stored in a separate assembly file/document.",
    label: "V1 contract assembly storage",
  },
];

const FORBIDDEN_SNIPPETS = [
  {
    file: "specs/docs-map.md",
    includes: "backend-interface.md",
    label: "stale backend-interface pointer",
  },
];

const docsMapRaw = await readFile(DOCS_MAP, "utf8");
const pathRegex = /`([^`]+)`/g;
const candidates = [];
let match = pathRegex.exec(docsMapRaw);
while (match) {
  const value = match[1]?.trim() ?? "";
  if (value) candidates.push(value);
  match = pathRegex.exec(docsMapRaw);
}

const pathLike = candidates.filter((value) =>
  /^(docs|specs|tools|src|native|aidocs)\//.test(value)
);
const uniquePaths = Array.from(new Set(pathLike));

const errors = [];

for (const relPath of uniquePaths) {
  const fullPath = resolve(relPath);
  try {
    await access(fullPath, fsConstants.F_OK);
  } catch {
    errors.push(`Missing path referenced by specs/docs-map.md: ${relPath}`);
  }
}

for (const rule of REQUIRED_SNIPPETS) {
  const content = await readFile(resolve(rule.file), "utf8");
  if (!content.includes(rule.includes)) {
    errors.push(`Drift check failed (${rule.label}) in ${rule.file}`);
  }
}

for (const rule of FORBIDDEN_SNIPPETS) {
  const content = await readFile(resolve(rule.file), "utf8");
  if (content.includes(rule.includes)) {
    errors.push(`Forbidden stale reference found (${rule.label}) in ${rule.file}`);
  }
}

if (errors.length > 0) {
  console.error("Docs drift guardrail failed:");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log("Docs drift guardrail passed.");
