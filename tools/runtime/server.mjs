import http from "node:http";
import { URL } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import {
  OcctBackend,
  backendToAsync,
  buildPartAsync,
  buildPartCacheKey,
  meshOptionsForProfile,
  InMemoryJobQueue,
} from "../../dist/index.js";

const PORT = Number(process.env.TF_RUNTIME_PORT || process.env.PORT || 8080);
const API_VERSION = "1.0";
const DEFAULT_JOB_TIMEOUT_MS = Number(
  process.env.TF_RUNTIME_JOB_TIMEOUT_MS || 30000
);
const BUILD_CACHE_MAX = Number(process.env.TF_RUNTIME_BUILD_CACHE_MAX || 32);
const MESH_CACHE_MAX = Number(process.env.TF_RUNTIME_MESH_CACHE_MAX || 64);

const jobQueue = new InMemoryJobQueue({
  maxConcurrent: 1,
  defaultTimeoutMs: DEFAULT_JOB_TIMEOUT_MS,
});
const assetStore = new Map();
const buildStore = new Map();
const buildCache = new Map();
const meshCache = new Map();
let assetCounter = 0;
let buildCounter = 0;

let occtPromise;
let backendSync;

async function getBackendAsync() {
  if (!occtPromise) occtPromise = initOpenCascade();
  const occt = await occtPromise;
  if (!backendSync) backendSync = new OcctBackend({ occt });
  return backendToAsync(backendSync);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(body);
}

function text(res, status, payload) {
  res.writeHead(status, {
    "content-type": "text/plain",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

function bytes(res, status, payload, contentType) {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  });
  res.end(payload);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return null;
  return JSON.parse(body);
}

function nextAssetId(prefix) {
  assetCounter += 1;
  return `${prefix}_${Date.now()}_${assetCounter}`;
}

function nextBuildId() {
  buildCounter += 1;
  return `build_${Date.now()}_${buildCounter}`;
}

function storeAsset(type, data, contentType) {
  const id = nextAssetId(type);
  assetStore.set(id, { type, data, contentType });
  return { id, url: `/v1/assets/${type}/${id}` };
}

function cacheSet(map, key, value, maxSize) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
}

function buildCacheKeyFor(part, context, overrides) {
  if (!context) return null;
  try {
    const key = buildPartCacheKey(part, context, overrides);
    return JSON.stringify(key);
  } catch {
    return null;
  }
}

function resolvePart(request) {
  if (request?.document && Array.isArray(request.document.parts)) {
    const partId = request.partId;
    if (partId) {
      const match = request.document.parts.find((part) => part?.id === partId);
      if (!match) throw new Error(`Part ${partId} not found in document`);
      return { part: match, document: request.document };
    }
    if (request.document.parts.length === 0) {
      throw new Error("Document contains no parts");
    }
    return { part: request.document.parts[0], document: request.document };
  }
  if (request?.part) {
    return { part: request.part, document: null };
  }
  throw new Error("Request must include document or part");
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

function isPrimitive(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isPrimitiveArray(value) {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" || typeof entry === "number")
  );
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

function sanitizeSelections(selections) {
  return selections.map((selection) => ({
    id: selection.id,
    kind: selection.kind,
    meta: serializeSelectionMeta(selection.meta),
  }));
}

async function handleBuild(request, ctx) {
  const { part } = resolvePart(request);
  const overrides = request?.params ?? undefined;
  const units = request?.units;
  const validationMode = request?.options?.validationMode;
  const validation =
    validationMode && validationMode !== "default"
      ? { validate: validationMode }
      : undefined;
  const meshProfile = request?.options?.meshProfile ?? "interactive";

  const cacheKey = buildCacheKeyFor(part, request?.document?.context, overrides);
  let buildResult = null;
  if (cacheKey && buildCache.has(cacheKey)) {
    buildResult = buildCache.get(cacheKey).result;
  }

  if (!buildResult) {
    ctx?.updateProgress(0.05);
    const backend = await getBackendAsync();
    buildResult = await buildPartAsync(part, backend, overrides, validation, units);
    if (cacheKey) {
      cacheSet(buildCache, cacheKey, { result: buildResult }, BUILD_CACHE_MAX);
    }
  }

  const buildId = nextBuildId();
  buildStore.set(buildId, {
    id: buildId,
    partId: buildResult.partId,
    result: buildResult,
    cacheKey,
  });

  let meshAsset = null;
  let bounds = null;
  if (meshProfile) {
    ctx?.updateProgress(0.6);
    const output = buildResult.final.outputs.get("body:main");
    if (!output) {
      throw new Error("Missing body:main output");
    }
    const meshOptions = meshOptionsForProfile(meshProfile);
    const meshCacheKey = cacheKey
      ? JSON.stringify({ build: cacheKey, profile: meshProfile, options: meshOptions })
      : null;
    const cachedMesh = meshCacheKey ? meshCache.get(meshCacheKey) : null;
    let asset = cachedMesh?.asset ?? null;
    if (!asset) {
      const backend = await getBackendAsync();
      const mesh = await backend.mesh(output, meshOptions);
      const selections = sanitizeSelections(buildResult.final.selections);
      const summary = summarizeSelections(selections);
      const meshWithSelections = { ...mesh, selections, selectionSummary: summary };
      asset = storeAsset("mesh", JSON.stringify(meshWithSelections), "application/json");
      if (meshCacheKey) {
        cacheSet(meshCache, meshCacheKey, {
          asset,
          bounds: computeBounds(mesh.positions),
        }, MESH_CACHE_MAX);
      }
      bounds = computeBounds(mesh.positions);
    } else {
      bounds = cachedMesh?.bounds ?? null;
    }
    meshAsset = { profile: meshProfile, asset };
  }

  ctx?.updateProgress(1);
  return {
    buildId,
    partId: buildResult.partId,
    featureOrder: buildResult.order,
    outputs: buildOutputsMap(buildResult.final.outputs),
    selections: buildSelectionIndex(buildResult.final.selections),
    mesh: meshAsset,
    metadata: bounds ? { bounds } : {},
  };
}

async function handleMesh(request, ctx) {
  const buildId = request?.buildId;
  if (!buildId || !buildStore.has(buildId)) {
    throw new Error("Unknown buildId");
  }
  const entry = buildStore.get(buildId);
  const target = request?.target ?? "body:main";
  const profile = request?.profile ?? "interactive";
  const options = request?.options ?? {};
  const output = entry.result.final.outputs.get(target);
  if (!output) {
    throw new Error(`Missing output ${target}`);
  }
  const meshOptions = { ...meshOptionsForProfile(profile), ...options };
  const meshCacheKey = entry.cacheKey
    ? JSON.stringify({ build: entry.cacheKey, profile, options: meshOptions })
    : null;
  const cachedMesh = meshCacheKey ? meshCache.get(meshCacheKey) : null;
  let asset = cachedMesh?.asset ?? null;
  if (!asset) {
    ctx?.updateProgress(0.6);
    const backend = await getBackendAsync();
    const mesh = await backend.mesh(output, meshOptions);
    const selections = sanitizeSelections(entry.result.final.selections);
    const summary = summarizeSelections(selections);
    const meshWithSelections = { ...mesh, selections, selectionSummary: summary };
    asset = storeAsset("mesh", JSON.stringify(meshWithSelections), "application/json");
    if (meshCacheKey) {
      cacheSet(
        meshCache,
        meshCacheKey,
        { asset, bounds: computeBounds(mesh.positions) },
        MESH_CACHE_MAX
      );
    }
  }
  ctx?.updateProgress(1);
  return { mesh: { profile, asset } };
}

async function handleExport(request, kind, ctx) {
  const buildId = request?.buildId;
  if (!buildId || !buildStore.has(buildId)) {
    throw new Error("Unknown buildId");
  }
  const entry = buildStore.get(buildId);
  const target = request?.target ?? "body:main";
  const options = request?.options ?? {};
  const output = entry.result.final.outputs.get(target);
  if (!output) {
    throw new Error(`Missing output ${target}`);
  }
  const backend = await getBackendAsync();
  if (kind === "step") {
    ctx?.updateProgress(0.6);
    const bytes = await backend.exportStep(output, options);
    const asset = storeAsset("export", bytes, "application/octet-stream");
    ctx?.updateProgress(1);
    return { asset };
  }
  if (kind === "stl") {
    if (!backend.exportStl) {
      throw new Error("STL export not supported by backend");
    }
    ctx?.updateProgress(0.6);
    const bytes = await backend.exportStl(output, options);
    const asset = storeAsset("export", bytes, "application/octet-stream");
    ctx?.updateProgress(1);
    return { asset };
  }
  throw new Error(`Unsupported export kind ${kind}`);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    text(res, 400, "Missing URL");
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  try {
    if (req.method === "GET" && pathname === "/v1/capabilities") {
      const backend = await getBackendAsync();
      const caps = backendSync?.capabilities?.() ?? {};
      json(res, 200, {
        apiVersion: API_VERSION,
        backend: caps.name ?? "opencascade.js",
        featureKinds: caps.featureKinds ?? [],
        exports: caps.exports ?? { step: true, stl: true },
        mesh: caps.mesh ?? true,
        assertions: caps.assertions ?? [],
      });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/build") {
      const payload = await readJson(req);
      const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
      const job = jobQueue.enqueue(
        async (ctx) => handleBuild(payload, ctx),
        timeoutMs ? { timeoutMs } : {}
      );
      json(res, 202, { jobId: job.id, state: job.state });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/mesh") {
      const payload = await readJson(req);
      const timeoutMs = payload?.timeoutMs;
      const job = jobQueue.enqueue(
        async (ctx) => handleMesh(payload, ctx),
        timeoutMs ? { timeoutMs } : {}
      );
      json(res, 202, { jobId: job.id, state: job.state });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/export/step") {
      const payload = await readJson(req);
      const timeoutMs = payload?.timeoutMs;
      const job = jobQueue.enqueue(
        async (ctx) => handleExport(payload, "step", ctx),
        timeoutMs ? { timeoutMs } : {}
      );
      json(res, 202, { jobId: job.id, state: job.state });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/export/stl") {
      const payload = await readJson(req);
      const timeoutMs = payload?.timeoutMs;
      const job = jobQueue.enqueue(
        async (ctx) => handleExport(payload, "stl", ctx),
        timeoutMs ? { timeoutMs } : {}
      );
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
      const asset = assetStore.get(id);
      if (!asset) {
        text(res, 404, "Asset not found");
        return;
      }
      bytes(res, 200, asset.data, asset.contentType);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/v1/assets/export/")) {
      const id = pathname.split("/").pop();
      const asset = assetStore.get(id);
      if (!asset) {
        text(res, 404, "Asset not found");
        return;
      }
      bytes(res, 200, asset.data, asset.contentType);
      return;
    }

    text(res, 404, "Not found");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    json(res, 500, { error: { code: "runtime_error", message } });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`TrueForm runtime server listening on http://127.0.0.1:${PORT}`);
});
