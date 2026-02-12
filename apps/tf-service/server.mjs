import http from "node:http";
import { createHash } from "node:crypto";
import { URL, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import initOpenCascade from "opencascade.js/dist/node.js";
import {
  buildPartAsync,
  buildPartCacheKey,
  meshOptionsForProfile,
} from "../../dist/index.js";
import { OcctBackend } from "../../dist/backends.js";
import { backendToAsync } from "../../dist/backend-spi.js";
import { InMemoryJobQueue } from "../../dist/experimental.js";

const API_VERSION = "1.1";
const DEFAULT_PORT = Number(process.env.TF_RUNTIME_PORT || process.env.PORT || 8080);
const DEFAULT_JOB_TIMEOUT_MS = Number(process.env.TF_RUNTIME_JOB_TIMEOUT_MS || 30000);
const BUILD_CACHE_MAX = Number(process.env.TF_RUNTIME_BUILD_CACHE_MAX || 32);
const MESH_CACHE_MAX = Number(process.env.TF_RUNTIME_MESH_CACHE_MAX || 64);
const EXPORT_CACHE_MAX = Number(process.env.TF_RUNTIME_EXPORT_CACHE_MAX || 64);
const KEY_VERSION = "tf-service-key-v1";

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createTfServiceServer(options = {}) {
  const port = Number(options.port ?? DEFAULT_PORT);
  const jobQueue = new InMemoryJobQueue({
    maxConcurrent: Number(options.maxConcurrent ?? 1),
    defaultTimeoutMs: Number(options.defaultTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS),
  });

  const documentStore = new Map();
  const assetStore = new Map();
  const artifactStore = new Map();
  const buildStore = new Map();
  const buildCache = new Map();
  const meshCache = new Map();
  const exportCache = new Map();

  const cacheStats = {
    partBuild: { hit: 0, miss: 0 },
    mesh: { hit: 0, miss: 0 },
    export: { hit: 0, miss: 0 },
  };

  let assetCounter = 0;
  let buildCounter = 0;

  let occtPromise;
  let backendSync;
  let backendFingerprintPromise;

  async function getBackendAsync() {
    if (!occtPromise) occtPromise = initOpenCascade();
    const occt = await occtPromise;
    if (!backendSync) backendSync = new OcctBackend({ occt });
    return backendToAsync(backendSync);
  }

  async function getBackendFingerprint() {
    if (!backendFingerprintPromise) {
      backendFingerprintPromise = (async () => {
        await getBackendAsync();
        const caps = backendSync?.capabilities?.() ?? {};
        const source = {
          backend: caps?.name ?? "opencascade.js",
          featureKinds: [...(caps?.featureKinds ?? [])].sort(),
          assertions: [...(caps?.assertions ?? [])].sort(),
          exports: caps?.exports ?? {},
          runtimeBackendVersion: process.env.TF_RUNTIME_BACKEND_VERSION ?? null,
        };
        const digest = sha256(stableStringify(source)).slice(0, 16);
        return `${source.backend}:${digest}`;
      })();
    }
    return backendFingerprintPromise;
  }

  function json(res, status, payload) {
    const body = JSON.stringify(payload, null, 2);
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end(body);
  }

  function text(res, status, payload) {
    res.writeHead(status, {
      "content-type": "text/plain",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end(payload);
  }

  function bytes(res, status, payload, contentType) {
    res.writeHead(status, {
      "content-type": contentType,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end(payload);
  }

  async function readJson(req) {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (!body) return null;
    try {
      return JSON.parse(body);
    } catch {
      throw new HttpError(400, "invalid_json", "Request body is not valid JSON");
    }
  }

  function nextAssetId(prefix) {
    assetCounter += 1;
    return `${prefix}_${Date.now()}_${assetCounter}`;
  }

  function nextBuildId() {
    buildCounter += 1;
    return `build_${Date.now()}_${buildCounter}`;
  }

  function isPrimitive(value) {
    return ["string", "number", "boolean"].includes(typeof value);
  }

  function isPrimitiveArray(value) {
    return (
      Array.isArray(value) &&
      value.every((entry) => typeof entry === "string" || typeof entry === "number")
    );
  }

  function serializeSelectionMeta(meta) {
    const output = {};
    if (!meta || typeof meta !== "object") return output;
    for (const [key, value] of Object.entries(meta)) {
      if (key === "shape" || key === "owner" || key === "face" || key === "wire") continue;
      if (isPrimitive(value)) {
        output[key] = value;
        continue;
      }
      if (isPrimitiveArray(value)) {
        output[key] = value.slice();
      }
    }
    return output;
  }

  function sanitizeSelections(selections) {
    return selections.map((selection) => ({
      id: selection.id,
      kind: selection.kind,
      meta: serializeSelectionMeta(selection.meta),
    }));
  }

  function summarizeSelections(selections) {
    const summary = { total: 0, byKind: { face: 0, edge: 0, solid: 0 } };
    for (const selection of selections) {
      if (!selection) continue;
      summary.total += 1;
      const kind = selection.kind || "face";
      summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
    }
    return summary;
  }

  function buildOutputsMap(outputs) {
    const result = {};
    for (const [key, obj] of outputs.entries()) {
      result[key] = { kind: obj.kind, selectionId: obj.id };
    }
    return result;
  }

  function buildSelectionIndex(selections) {
    const faces = [];
    const edges = [];
    const solids = [];
    for (const selection of selections) {
      if (selection.kind === "face") faces.push(selection.id);
      if (selection.kind === "edge") edges.push(selection.id);
      if (selection.kind === "solid") solids.push(selection.id);
    }
    return { faces, edges, solids };
  }

  function computeBounds(positions) {
    if (!Array.isArray(positions) || positions.length < 3) return null;
    let minX = positions[0];
    let minY = positions[1];
    let minZ = positions[2];
    let maxX = positions[0];
    let maxY = positions[1];
    let maxZ = positions[2];
    for (let i = 3; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return [
      [minX, minY, minZ],
      [maxX, maxY, maxZ],
    ];
  }

  function triangleCountFromMesh(mesh) {
    if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
      return Math.floor(mesh.indices.length / 3);
    }
    if (Array.isArray(mesh.positions) && mesh.positions.length >= 9) {
      return Math.floor(mesh.positions.length / 9);
    }
    return 0;
  }

  function stableStringify(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  function sha256(input) {
    return createHash("sha256").update(input).digest("hex");
  }

  function makeDocumentRecord(document) {
    const canonicalJson = stableStringify(document);
    const canonicalDocument = JSON.parse(canonicalJson);
    const docId = sha256(canonicalJson);
    const createdAt = new Date().toISOString();
    return {
      id: docId,
      docId,
      contentHash: docId,
      canonicalJson,
      document: canonicalDocument,
      createdAt,
      bytes: Buffer.byteLength(canonicalJson),
    };
  }

  function storeDocument(document) {
    const next = makeDocumentRecord(document);
    const existing = documentStore.get(next.docId);
    if (existing) {
      return { record: existing, inserted: false };
    }
    documentStore.set(next.docId, next);
    return { record: next, inserted: true };
  }

  function makePartBuildKey(part, context, overrides, backendFingerprint) {
    if (!context) return null;
    const coreKey = buildPartCacheKey(part, context, overrides);
    const key = {
      version: KEY_VERSION,
      type: "partBuildKey",
      backendFingerprint,
      key: coreKey,
    };
    return { object: key, value: stableStringify(key) };
  }

  function makeMeshKey(partBuildKey, profile, options) {
    if (!partBuildKey?.value) return null;
    const key = {
      version: KEY_VERSION,
      type: "meshKey",
      partBuildKey: partBuildKey.value,
      profile,
      options,
    };
    return { object: key, value: stableStringify(key) };
  }

  function makeExportKey(partBuildKey, kind, options) {
    if (!partBuildKey?.value) return null;
    const key = {
      version: KEY_VERSION,
      type: "exportKey",
      partBuildKey: partBuildKey.value,
      kind,
      options,
    };
    return { object: key, value: stableStringify(key) };
  }

  function cacheSet(map, key, value, maxSize) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    if (map.size > maxSize) {
      const oldest = map.keys().next().value;
      if (oldest) map.delete(oldest);
    }
  }

  function recordCacheEvent(layer, hit, keyValue) {
    const bucket = cacheStats[layer];
    if (!bucket) return;
    if (hit) bucket.hit += 1;
    else bucket.miss += 1;
    const keyHash = keyValue ? sha256(keyValue).slice(0, 16) : null;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        event: "cache",
        layer,
        result: hit ? "hit" : "miss",
        keyHash,
        totals: { ...bucket },
      })
    );
  }

  function storeAsset(type, data, contentType, metadata = {}) {
    const id = nextAssetId(type);
    const url = `/v1/assets/${type}/${id}`;
    assetStore.set(id, { type, data, contentType });
    artifactStore.set(id, {
      artifactId: id,
      assetId: id,
      type,
      url,
      createdAt: new Date().toISOString(),
      ...metadata,
    });
    return { id, url };
  }

  function resolvePart(request) {
    let document = null;
    let docId = request?.docId ?? null;

    if (request?.document) {
      const stored = storeDocument(request.document);
      document = stored.record.document;
      docId = stored.record.docId;
    } else if (docId) {
      const stored = documentStore.get(docId);
      if (!stored) {
        throw new HttpError(404, "document_not_found", `Unknown document ${docId}`);
      }
      document = stored.document;
    }

    if (document && Array.isArray(document.parts)) {
      const partId = request?.partId;
      if (partId) {
        const match = document.parts.find((part) => part?.id === partId);
        if (!match) {
          throw new HttpError(400, "part_not_found", `Part ${partId} not found in document ${docId}`);
        }
        return { part: match, document, docId };
      }
      if (document.parts.length === 0) {
        throw new HttpError(400, "document_empty", "Document contains no parts");
      }
      return { part: document.parts[0], document, docId };
    }

    if (request?.part) {
      return { part: request.part, document: null, docId: null };
    }

    throw new HttpError(400, "invalid_request", "Request must include document, docId, or part");
  }

  async function maybeSimulateDelay(request, ctx) {
    const delay = Number(request?.options?.simulateDelayMs ?? 0);
    if (!Number.isFinite(delay) || delay <= 0) return;
    const start = Date.now();
    while (Date.now() - start < delay) {
      if (ctx?.isCanceled?.()) break;
      const elapsed = Date.now() - start;
      const ratio = delay > 0 ? Math.min(1, elapsed / delay) : 1;
      ctx?.updateProgress(Math.min(0.2, ratio * 0.2));
      const remaining = Math.max(0, delay - elapsed);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(25, remaining)));
    }
  }

  async function resolveMeshAsset(params) {
    const {
      output,
      selections,
      partBuildKey,
      buildId,
      partId,
      profile,
      options,
      ctx,
      purpose,
      docId,
    } = params;

    const meshKey = makeMeshKey(partBuildKey, profile, options);
    const cached = meshKey ? meshCache.get(meshKey.value) : null;
    if (cached) {
      recordCacheEvent("mesh", true, meshKey.value);
      return {
        asset: cached.asset,
        bounds: cached.bounds,
        meshKey,
        hit: true,
        triangleCount: cached.triangleCount,
      };
    }

    recordCacheEvent("mesh", false, meshKey?.value);
    ctx?.updateProgress(0.6);
    const backend = await getBackendAsync();
    const mesh = await backend.mesh(output, options);
    const safeSelections = sanitizeSelections(selections);
    const selectionSummary = summarizeSelections(safeSelections);
    const triangleCount = triangleCountFromMesh(mesh);
    const bounds = computeBounds(mesh.positions);
    const payload = {
      ...mesh,
      selections: safeSelections,
      selectionSummary,
    };
    const asset = storeAsset("mesh", JSON.stringify(payload), "application/json", {
      buildId,
      partId,
      docId,
      partBuildKey: partBuildKey?.value ?? null,
      meshKey: meshKey?.value ?? null,
      profile,
      options,
      purpose,
      triangleCount,
      bounds,
    });
    if (meshKey) {
      cacheSet(meshCache, meshKey.value, { asset, bounds, triangleCount }, MESH_CACHE_MAX);
    }
    return { asset, bounds, meshKey, hit: false, triangleCount };
  }

  async function warmPreviewMesh(buildId) {
    const entry = buildStore.get(buildId);
    if (!entry) return;
    const output = entry.result.final.outputs.get("body:main");
    if (!output) return;
    const options = meshOptionsForProfile("preview");
    try {
      await resolveMeshAsset({
        output,
        selections: entry.result.final.selections,
        partBuildKey: entry.partBuildKey,
        buildId: entry.id,
        partId: entry.partId,
        profile: "preview",
        options,
        purpose: "preview_prefetch",
        docId: entry.docId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`preview prefetch failed for ${buildId}: ${message}`);
    }
  }

  async function handleBuild(request, ctx) {
    await maybeSimulateDelay(request, ctx);
    const { part, document, docId } = resolvePart(request);
    const overrides = request?.params ?? undefined;
    const units = request?.units;
    const validationMode = request?.options?.validationMode;
    const validation =
      validationMode && validationMode !== "default"
        ? { validate: validationMode }
        : undefined;
    const meshProfile = request?.options?.meshProfile ?? "interactive";
    const prefetchPreview = request?.options?.prefetchPreview !== false;

    const backendFingerprint = await getBackendFingerprint();
    const partBuildKey = makePartBuildKey(part, document?.context, overrides, backendFingerprint);

    let buildResult = null;
    let partBuildHit = false;
    if (partBuildKey && buildCache.has(partBuildKey.value)) {
      buildResult = buildCache.get(partBuildKey.value).result;
      partBuildHit = true;
      recordCacheEvent("partBuild", true, partBuildKey.value);
    }

    if (!buildResult) {
      recordCacheEvent("partBuild", false, partBuildKey?.value);
      ctx?.updateProgress(0.05);
      const backend = await getBackendAsync();
      buildResult = await buildPartAsync(part, backend, overrides, validation, units);
      if (partBuildKey) {
        cacheSet(buildCache, partBuildKey.value, { result: buildResult }, BUILD_CACHE_MAX);
      }
    }

    const buildId = nextBuildId();
    const entry = {
      id: buildId,
      partId: buildResult.partId,
      result: buildResult,
      partBuildKey,
      docId,
      backendFingerprint,
    };
    buildStore.set(buildId, entry);

    let meshAsset = null;
    let bounds = null;
    let meshKey = null;
    let meshCacheHit = false;
    let triangleCount = 0;

    if (meshProfile) {
      const output = buildResult.final.outputs.get("body:main");
      if (!output) {
        throw new HttpError(500, "missing_output", "Missing body:main output");
      }
      const meshOptions = meshOptionsForProfile(meshProfile);
      const meshResult = await resolveMeshAsset({
        output,
        selections: buildResult.final.selections,
        partBuildKey,
        buildId,
        partId: buildResult.partId,
        profile: meshProfile,
        options: meshOptions,
        ctx,
        purpose: "build",
        docId,
      });
      meshAsset = { profile: meshProfile, asset: meshResult.asset };
      bounds = meshResult.bounds;
      meshKey = meshResult.meshKey;
      meshCacheHit = meshResult.hit;
      triangleCount = meshResult.triangleCount;
    }

    if (meshProfile === "interactive" && prefetchPreview) {
      queueMicrotask(() => {
        warmPreviewMesh(buildId).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error(`preview prefetch scheduling failed for ${buildId}: ${message}`);
        });
      });
    }

    ctx?.updateProgress(1);
    return {
      buildId,
      partId: buildResult.partId,
      docId,
      backendFingerprint,
      featureOrder: buildResult.order,
      outputs: buildOutputsMap(buildResult.final.outputs),
      selections: buildSelectionIndex(buildResult.final.selections),
      mesh: meshAsset,
      metadata: bounds ? { bounds, triangleCount } : { triangleCount },
      keys: {
        partBuildKey: partBuildKey?.value ?? null,
        meshKey: meshKey?.value ?? null,
      },
      cache: {
        partBuild: { hit: partBuildHit },
        mesh: meshAsset ? { hit: meshCacheHit } : null,
      },
    };
  }

  async function handleMesh(request, ctx) {
    await maybeSimulateDelay(request, ctx);
    const buildId = request?.buildId;
    if (!buildId || !buildStore.has(buildId)) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
    const entry = buildStore.get(buildId);
    const target = request?.target ?? "body:main";
    const profile = request?.profile ?? "interactive";
    const { simulateDelayMs: _meshDelayMs, ...meshOverrides } = request?.options ?? {};
    void _meshDelayMs;
    const options = { ...meshOptionsForProfile(profile), ...meshOverrides };
    const output = entry.result.final.outputs.get(target);
    if (!output) {
      throw new HttpError(400, "missing_output", `Missing output ${target}`);
    }

    const meshResult = await resolveMeshAsset({
      output,
      selections: entry.result.final.selections,
      partBuildKey: entry.partBuildKey,
      buildId: entry.id,
      partId: entry.partId,
      profile,
      options,
      ctx,
      purpose: "mesh",
      docId: entry.docId,
    });

    ctx?.updateProgress(1);
    return {
      mesh: { profile, asset: meshResult.asset },
      metadata: {
        bounds: meshResult.bounds,
        triangleCount: meshResult.triangleCount,
      },
      keys: {
        meshKey: meshResult.meshKey?.value ?? null,
      },
      cache: {
        mesh: { hit: meshResult.hit },
      },
    };
  }

  async function handleExport(request, kind, ctx) {
    await maybeSimulateDelay(request, ctx);
    const buildId = request?.buildId;
    if (!buildId || !buildStore.has(buildId)) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
    const entry = buildStore.get(buildId);
    const target = request?.target ?? "body:main";
    const { simulateDelayMs: _exportDelayMs, ...options } = request?.options ?? {};
    void _exportDelayMs;
    const output = entry.result.final.outputs.get(target);
    if (!output) {
      throw new HttpError(400, "missing_output", `Missing output ${target}`);
    }

    const exportKey = makeExportKey(entry.partBuildKey, kind, options);
    const cached = exportKey ? exportCache.get(exportKey.value) : null;
    if (cached) {
      recordCacheEvent("export", true, exportKey.value);
      ctx?.updateProgress(1);
      return {
        asset: cached.asset,
        kind,
        keys: { exportKey: exportKey.value },
        cache: { export: { hit: true } },
      };
    }

    recordCacheEvent("export", false, exportKey?.value);
    const backend = await getBackendAsync();
    let payload;
    if (kind === "step") {
      ctx?.updateProgress(0.6);
      payload = await backend.exportStep(output, options);
    } else if (kind === "stl") {
      if (!backend.exportStl) {
        throw new HttpError(400, "unsupported_export", "STL export not supported by backend");
      }
      ctx?.updateProgress(0.6);
      payload = await backend.exportStl(output, options);
    } else {
      throw new HttpError(400, "unsupported_export", `Unsupported export kind ${kind}`);
    }

    const asset = storeAsset("export", payload, "application/octet-stream", {
      buildId: entry.id,
      partId: entry.partId,
      docId: entry.docId,
      kind,
      options,
      partBuildKey: entry.partBuildKey?.value ?? null,
      exportKey: exportKey?.value ?? null,
      purpose: "export",
    });
    if (exportKey) {
      cacheSet(exportCache, exportKey.value, { asset }, EXPORT_CACHE_MAX);
    }
    ctx?.updateProgress(1);
    return {
      asset,
      kind,
      keys: { exportKey: exportKey?.value ?? null },
      cache: { export: { hit: false } },
    };
  }

  async function enqueueJob(handler, payload, timeoutMs) {
    return jobQueue.enqueue(
      async (ctx) => handler(payload, ctx),
      timeoutMs ? { timeoutMs } : {}
    );
  }

  function enqueueBuild(payload) {
    const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
    return enqueueJob(handleBuild, payload, timeoutMs);
  }

  function enqueueMesh(payload) {
    const timeoutMs = payload?.timeoutMs;
    return enqueueJob(handleMesh, payload, timeoutMs);
  }

  function enqueueExport(payload, kind) {
    const timeoutMs = payload?.timeoutMs;
    return enqueueJob((request, ctx) => handleExport(request, kind, ctx), payload, timeoutMs);
  }

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      text(res, 400, "Missing URL");
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    try {
      if (req.method === "GET" && pathname === "/v1/capabilities") {
        await getBackendAsync();
        const caps = backendSync?.capabilities?.() ?? {};
        const backendFingerprint = await getBackendFingerprint();
        json(res, 200, {
          apiVersion: API_VERSION,
          backend: caps.name ?? "opencascade.js",
          backendFingerprint,
          featureKinds: caps.featureKinds ?? [],
          exports: caps.exports ?? { step: true, stl: true },
          mesh: caps.mesh ?? true,
          assertions: caps.assertions ?? [],
        });
        return;
      }

      if (req.method === "POST" && pathname === "/v1/documents") {
        const payload = await readJson(req);
        const document = payload?.document ?? payload;
        if (!document || !Array.isArray(document.parts)) {
          throw new HttpError(400, "invalid_document", "Document payload must include parts[]");
        }
        const stored = storeDocument(document);
        json(res, stored.inserted ? 201 : 200, {
          docId: stored.record.docId,
          contentHash: stored.record.contentHash,
          inserted: stored.inserted,
          createdAt: stored.record.createdAt,
          bytes: stored.record.bytes,
          url: `/v1/documents/${stored.record.docId}`,
        });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/documents/")) {
        const docId = pathname.split("/").pop();
        const stored = docId ? documentStore.get(docId) : null;
        if (!stored) {
          json(res, 404, { error: "Document not found" });
          return;
        }
        json(res, 200, {
          docId: stored.docId,
          contentHash: stored.contentHash,
          createdAt: stored.createdAt,
          bytes: stored.bytes,
          document: stored.document,
        });
        return;
      }

      if (req.method === "POST" && (pathname === "/v1/build" || pathname === "/v1/jobs/build")) {
        const payload = await readJson(req);
        const job = await enqueueBuild(payload);
        json(res, 202, { jobId: job.id, state: job.state });
        return;
      }

      if (req.method === "POST" && (pathname === "/v1/mesh" || pathname === "/v1/jobs/mesh")) {
        const payload = await readJson(req);
        const job = await enqueueMesh(payload);
        json(res, 202, { jobId: job.id, state: job.state });
        return;
      }

      if (req.method === "POST" && (pathname === "/v1/export/step" || pathname === "/v1/jobs/export/step")) {
        const payload = await readJson(req);
        const job = await enqueueExport(payload, "step");
        json(res, 202, { jobId: job.id, state: job.state });
        return;
      }

      if (req.method === "POST" && (pathname === "/v1/export/stl" || pathname === "/v1/jobs/export/stl")) {
        const payload = await readJson(req);
        const job = await enqueueExport(payload, "stl");
        json(res, 202, { jobId: job.id, state: job.state });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/jobs/")) {
        const jobId = pathname.split("/").pop();
        const job = jobQueue.get(jobId);
        if (!job) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        json(res, 200, job);
        return;
      }

      if (req.method === "DELETE" && pathname.startsWith("/v1/jobs/")) {
        const jobId = pathname.split("/").pop();
        const canceled = jobQueue.cancel(jobId);
        const job = jobQueue.get(jobId);
        if (!job && !canceled) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        json(res, 200, job ?? { jobId, state: canceled ? "canceled" : "unknown" });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/assets/mesh/")) {
        const id = pathname.split("/").pop();
        const asset = id ? assetStore.get(id) : null;
        if (!asset) {
          text(res, 404, "Asset not found");
          return;
        }
        bytes(res, 200, asset.data, asset.contentType);
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/assets/export/")) {
        const id = pathname.split("/").pop();
        const asset = id ? assetStore.get(id) : null;
        if (!asset) {
          text(res, 404, "Asset not found");
          return;
        }
        bytes(res, 200, asset.data, asset.contentType);
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/artifacts/")) {
        const id = pathname.split("/").pop();
        const artifact = id ? artifactStore.get(id) : null;
        if (!artifact) {
          json(res, 404, { error: "Artifact not found" });
          return;
        }
        json(res, 200, artifact);
        return;
      }

      if (req.method === "GET" && pathname === "/v1/metrics") {
        json(res, 200, {
          cache: cacheStats,
          stores: {
            documents: documentStore.size,
            builds: buildStore.size,
            assets: assetStore.size,
            artifacts: artifactStore.size,
            buildCache: buildCache.size,
            meshCache: meshCache.size,
            exportCache: exportCache.size,
          },
        });
        return;
      }

      text(res, 404, "Not found");
    } catch (err) {
      if (err instanceof HttpError) {
        json(res, err.status, {
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      json(res, 500, { error: { code: "runtime_error", message } });
    }
  });

  return {
    server,
    port,
  };
}

export function startTfServiceServer(options = {}) {
  const { server, port } = createTfServiceServer(options);
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`TrueForm tf-service listening on http://127.0.0.1:${port}`);
  });
  return server;
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entryPath && import.meta.url === entryPath) {
  startTfServiceServer();
}
