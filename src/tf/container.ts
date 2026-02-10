import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { TF_IR_SCHEMA } from "../ir.js";
import type { IntentDocument } from "../ir.js";

export const TF_CONTAINER_SCHEMA = "trueform.container.v1";
export const TF_DOCUMENT_SCHEMA = TF_IR_SCHEMA;

export type TfBuildContext = {
  kernel: { name: string; version: string };
  tolerance: { linear: number; angular: number };
};

export type TfArtifactInput = {
  type: string;
  path: string;
  data: Uint8Array | string;
  hash?: string;
  bytes?: number;
  build?: TfBuildContext;
};

export type TfManifestDocument = {
  path: string;
  schema: typeof TF_DOCUMENT_SCHEMA;
  hash: string;
  bytes: number;
};

export type TfManifestArtifact = {
  type: string;
  path: string;
  hash: string;
  bytes: number;
  build?: TfBuildContext;
};

export type TfManifest = {
  schema: typeof TF_CONTAINER_SCHEMA;
  createdAt: string;
  document: TfManifestDocument;
  artifacts?: TfManifestArtifact[];
};

export type TfDocumentFile = {
  schema: typeof TF_DOCUMENT_SCHEMA;
  document: IntentDocument;
};

export type TfContainerReadResult = {
  manifest: TfManifest;
  document: IntentDocument;
  artifacts: Map<string, Uint8Array>;
};

export type TfContainerOptions = {
  createdAt?: string;
};

export async function createTfContainer(
  document: IntentDocument,
  artifacts: TfArtifactInput[] = [],
  options: TfContainerOptions = {}
): Promise<Uint8Array> {
  const documentFile: TfDocumentFile = {
    schema: TF_DOCUMENT_SCHEMA,
    document,
  };
  const documentJson = stableStringify(documentFile);
  const documentBytes = strToU8(documentJson);
  const documentHash = await sha256Hex(documentBytes);

  const files: Record<string, Uint8Array> = {
    "document.json": documentBytes,
  };

  const manifestArtifacts: TfManifestArtifact[] = [];
  const seenPaths = new Set<string>(["document.json", "manifest.json"]);

  for (const artifact of artifacts) {
    assertRelativePath(artifact.path, "artifact path");
    if (seenPaths.has(artifact.path)) {
      throw new Error(`Duplicate artifact path: ${artifact.path}`);
    }
    seenPaths.add(artifact.path);

    const dataBytes = toBytes(artifact.data);
    files[artifact.path] = dataBytes;
    const hash = artifact.hash ?? (await sha256Hex(dataBytes));
    manifestArtifacts.push({
      type: artifact.type,
      path: artifact.path,
      hash,
      bytes: artifact.bytes ?? dataBytes.byteLength,
      build: artifact.build,
    });
  }

  const manifest: TfManifest = {
    schema: TF_CONTAINER_SCHEMA,
    createdAt: options.createdAt ?? new Date().toISOString(),
    document: {
      path: "document.json",
      schema: TF_DOCUMENT_SCHEMA,
      hash: documentHash,
      bytes: documentBytes.byteLength,
    },
    artifacts: manifestArtifacts.length ? manifestArtifacts : undefined,
  };

  const manifestJson = stableStringify(manifest);
  files["manifest.json"] = strToU8(manifestJson);

  return zipSync(files, { level: 0 });
}

export async function readTfContainer(
  bytes: Uint8Array
): Promise<TfContainerReadResult> {
  const files = unzipSync(bytes);
  const manifestBytes = files["manifest.json"];
  const documentBytes = files["document.json"];

  if (!manifestBytes) {
    throw new Error("Missing manifest.json in .tfp container");
  }
  if (!documentBytes) {
    throw new Error("Missing document.json in .tfp container");
  }

  const manifest = parseJson<TfManifest>(manifestBytes, "manifest.json");
  if (manifest.schema !== TF_CONTAINER_SCHEMA) {
    throw new Error(
      `Unsupported container schema: ${String(manifest.schema)}`
    );
  }

  const documentFile = parseJson<TfDocumentFile>(documentBytes, "document.json");
  if (documentFile.schema !== TF_DOCUMENT_SCHEMA) {
    throw new Error(
      `Unsupported document schema: ${String(documentFile.schema)}`
    );
  }

  const documentHash = await sha256Hex(documentBytes);
  if (documentHash !== manifest.document.hash) {
    throw new Error(
      `Document hash mismatch. manifest=${manifest.document.hash} computed=${documentHash}`
    );
  }

  const artifacts = new Map<string, Uint8Array>();
  const manifestArtifacts = manifest.artifacts ?? [];
  for (const artifact of manifestArtifacts) {
    assertRelativePath(artifact.path, "artifact path");
    const data = files[artifact.path];
    if (!data) {
      throw new Error(`Missing artifact ${artifact.path} in .tfp container`);
    }
    const hash = await sha256Hex(data);
    if (hash !== artifact.hash) {
      throw new Error(
        `Artifact hash mismatch for ${artifact.path}. manifest=${artifact.hash} computed=${hash}`
      );
    }
    artifacts.set(artifact.path, data);
  }

  return {
    manifest,
    document: documentFile.document,
    artifacts,
  };
}

function toBytes(data: Uint8Array | string): Uint8Array {
  if (typeof data === "string") return strToU8(data);
  return data;
}

function parseJson<T>(bytes: Uint8Array, label: string): T {
  const text = strFromU8(bytes);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse ${label}: ${msg}`);
  }
}

function assertRelativePath(path: string, label: string): void {
  if (!path) {
    throw new Error(`Missing ${label}`);
  }
  if (path.startsWith("/") || path.startsWith("\\") || path.includes(":")) {
    throw new Error(`Invalid ${label} (must be relative): ${path}`);
  }
  if (path.includes("..")) {
    throw new Error(`Invalid ${label} (no .. segments): ${path}`);
  }
  if (path.includes("\\")) {
    throw new Error(`Invalid ${label} (use / separators): ${path}`);
  }
  if (path === "manifest.json" || path === "document.json") {
    throw new Error(`Invalid ${label} (reserved filename): ${path}`);
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableClone(value));
}

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const cloned = stableClone(entry);
      return cloned === undefined ? null : cloned;
    });
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      const cloned = stableClone(obj[key]);
      if (cloned !== undefined) {
        out[key] = cloned;
      }
    }
    return out;
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined;
  }
  return value;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", data);
    return `sha256:${toHex(new Uint8Array(digest))}`;
  }
  const { createHash } = await import("node:crypto");
  return `sha256:${createHash("sha256").update(data).digest("hex")}`;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}
