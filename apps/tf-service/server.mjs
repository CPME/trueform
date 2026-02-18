import http from "node:http";
import { createHash } from "node:crypto";
import { URL, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import initOpenCascade from "opencascade.js/dist/node.js";
import {
  buildPartAsync,
  buildPartCacheKey,
  evaluatePartAssertions,
  evaluatePartDimensions,
  meshOptionsForProfile,
} from "../../dist/index.js";
import { residualsForTesting } from "../../dist/assembly.js";
import {
  TF_API_ENDPOINTS,
  TF_RUNTIME_OPTIONAL_FEATURES,
  TF_RUNTIME_FEATURE_STAGING,
  TF_API_VERSION,
  TF_RUNTIME_OPENAPI,
} from "../../dist/api.js";
import { OcctBackend } from "../../dist/backends.js";
import { backendToAsync } from "../../dist/backend-spi.js";
import { buildAssembly, InMemoryJobQueue } from "../../dist/experimental.js";

const DEFAULT_PORT = Number(process.env.TF_RUNTIME_PORT || process.env.PORT || 8080);
const DEFAULT_JOB_TIMEOUT_MS = Number(process.env.TF_RUNTIME_JOB_TIMEOUT_MS || 30000);
const BUILD_CACHE_MAX = Number(process.env.TF_RUNTIME_BUILD_CACHE_MAX || 32);
const MESH_CACHE_MAX = Number(process.env.TF_RUNTIME_MESH_CACHE_MAX || 64);
const EXPORT_CACHE_MAX = Number(process.env.TF_RUNTIME_EXPORT_CACHE_MAX || 64);
const MAX_DOC_BYTES = Number(process.env.TF_RUNTIME_MAX_DOCUMENT_BYTES || 2_000_000);
const MAX_DOCS_PER_TENANT = Number(process.env.TF_RUNTIME_MAX_DOCUMENTS_PER_TENANT || 256);
const MAX_ASSETS_PER_TENANT = Number(process.env.TF_RUNTIME_MAX_ASSETS_PER_TENANT || 1024);
const MAX_PENDING_JOBS_PER_TENANT = Number(
  process.env.TF_RUNTIME_MAX_PENDING_JOBS_PER_TENANT || 32
);
const MAX_BUILD_SESSIONS_PER_TENANT = Number(
  process.env.TF_RUNTIME_MAX_BUILD_SESSIONS_PER_TENANT || 32
);
const MAX_BUILDS_PER_SESSION = Number(process.env.TF_RUNTIME_MAX_BUILDS_PER_SESSION || 8);
const BUILD_SESSION_TTL_MS = Number(process.env.TF_RUNTIME_BUILD_SESSION_TTL_MS || 30 * 60 * 1000);
const KEY_VERSION = "tf-service-key-v1";
const TENANT_HEADER = "x-tf-tenant-id";
const DEFAULT_TENANT = "public";

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
  const buildSessionStore = new Map();
  const buildCache = new Map();
  const meshCache = new Map();
  const exportCache = new Map();
  const jobOwners = new Map();

  const cacheStats = {
    partBuild: { hit: 0, miss: 0 },
    mesh: { hit: 0, miss: 0 },
    export: { hit: 0, miss: 0 },
  };

  let assetCounter = 0;
  let buildCounter = 0;
  let sessionCounter = 0;

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
          featureStages: caps?.featureStages ?? {},
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
      "access-control-allow-headers": `content-type,${TENANT_HEADER}`,
    });
    res.end(body);
  }

  function text(res, status, payload) {
    res.writeHead(status, {
      "content-type": "text/plain",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": `content-type,${TENANT_HEADER}`,
    });
    res.end(payload);
  }

  function bytes(res, status, payload, contentType) {
    res.writeHead(status, {
      "content-type": contentType,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": `content-type,${TENANT_HEADER}`,
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

  function tenantScopedKey(tenantId, id) {
    return `${tenantId}::${id}`;
  }

  function normalizeTenantId(value) {
    if (typeof value !== "string" || value.trim().length === 0) return DEFAULT_TENANT;
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(trimmed)) {
      throw new HttpError(
        400,
        "invalid_tenant_id",
        "Tenant id must match [A-Za-z0-9._:-]{1,64}"
      );
    }
    return trimmed;
  }

  function getTenantId(req, url) {
    const headerValue = req.headers[TENANT_HEADER];
    const headerTenant = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const queryTenant = url.searchParams.get("tenantId");
    return normalizeTenantId(headerTenant ?? queryTenant ?? DEFAULT_TENANT);
  }

  function countTenantInStore(store, tenantId) {
    let count = 0;
    for (const value of store.values()) {
      if (value?.tenantId === tenantId) count += 1;
    }
    return count;
  }

  function countPendingJobsForTenant(tenantId) {
    let count = 0;
    for (const [jobId, owner] of jobOwners.entries()) {
      if (owner !== tenantId) continue;
      const record = jobQueue.get(jobId);
      if (!record) continue;
      if (record.state === "queued" || record.state === "running") count += 1;
    }
    return count;
  }

  function assertTenantQuota(tenantId, kind, limit, current) {
    if (current < limit) return;
    throw new HttpError(429, "quota_exceeded", `Tenant ${tenantId} exceeded ${kind} quota`, {
      tenantId,
      kind,
      limit,
      current,
    });
  }

  function nextAssetId(prefix) {
    assetCounter += 1;
    return `${prefix}_${Date.now()}_${assetCounter}`;
  }

  function nextBuildId() {
    buildCounter += 1;
    return `build_${Date.now()}_${buildCounter}`;
  }

  function nextBuildSessionId() {
    sessionCounter += 1;
    return `session_${Date.now()}_${sessionCounter}`;
  }

  function pruneExpiredBuildSessions() {
    const now = Date.now();
    for (const [sessionId, session] of buildSessionStore.entries()) {
      if (session.expiresAtMs <= now) buildSessionStore.delete(sessionId);
    }
  }

  function createBuildSession(tenantId) {
    pruneExpiredBuildSessions();
    assertTenantQuota(
      tenantId,
      "build_sessions_per_tenant",
      MAX_BUILD_SESSIONS_PER_TENANT,
      countTenantInStore(buildSessionStore, tenantId)
    );
    const now = Date.now();
    const sessionId = nextBuildSessionId();
    const session = {
      id: sessionId,
      tenantId,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAtMs: now + BUILD_SESSION_TTL_MS,
      buildsByPartKey: new Map(),
    };
    buildSessionStore.set(sessionId, session);
    return session;
  }

  function getBuildSession(tenantId, sessionId) {
    pruneExpiredBuildSessions();
    const session = buildSessionStore.get(sessionId);
    if (!session || session.tenantId !== tenantId) return null;
    const now = Date.now();
    session.updatedAt = new Date(now).toISOString();
    session.expiresAtMs = now + BUILD_SESSION_TTL_MS;
    return session;
  }

  function dropBuildSession(tenantId, sessionId) {
    const session = buildSessionStore.get(sessionId);
    if (!session || session.tenantId !== tenantId) return false;
    buildSessionStore.delete(sessionId);
    return true;
  }

  function setBuildSessionEntry(session, sessionPartKey, entry) {
    if (session.buildsByPartKey.has(sessionPartKey)) {
      session.buildsByPartKey.delete(sessionPartKey);
    }
    session.buildsByPartKey.set(sessionPartKey, entry);
    while (session.buildsByPartKey.size > MAX_BUILDS_PER_SESSION) {
      const oldestKey = session.buildsByPartKey.keys().next().value;
      if (typeof oldestKey !== "string") break;
      session.buildsByPartKey.delete(oldestKey);
    }
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

  function summarizeValidation(results) {
    const summary = { total: results.length, ok: 0, fail: 0, unsupported: 0 };
    for (const result of results) {
      if (result.status === "ok") summary.ok += 1;
      else if (result.status === "fail") summary.fail += 1;
      else summary.unsupported += 1;
    }
    return summary;
  }

  function residualCountForMate(mate) {
    switch (mate?.kind) {
      case "mate.fixed":
        return 6;
      case "mate.coaxial":
        return 6;
      case "mate.planar":
        return 4;
      case "mate.distance":
        return 1;
      case "mate.angle":
        return 1;
      case "mate.parallel":
        return 3;
      case "mate.perpendicular":
        return 1;
      case "mate.insert":
        return 8;
      case "mate.slider":
        return 6;
      case "mate.hinge":
        return 7;
      default:
        return 0;
    }
  }

  function summarizeMateResiduals(mates, residuals) {
    const out = [];
    let offset = 0;
    for (let i = 0; i < mates.length; i += 1) {
      const mate = mates[i];
      const count = residualCountForMate(mate);
      const values = residuals.slice(offset, offset + count);
      offset += count;
      const maxAbs = values.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0);
      const rms =
        values.length === 0
          ? 0
          : Math.sqrt(values.reduce((acc, v) => acc + v * v, 0) / values.length);
      out.push({
        index: i,
        kind: mate?.kind ?? "unknown",
        count,
        rms,
        maxAbs,
      });
    }
    return out;
  }

  function normalizePartialBuildHints(request) {
    const partial = request?.partial && typeof request.partial === "object" ? request.partial : {};
    const changedFeatureSource = Array.isArray(partial.changedFeatureIds)
      ? partial.changedFeatureIds
      : Array.isArray(request?.changedFeatureIds)
        ? request.changedFeatureIds
        : [];
    const changedFeatureIds = Array.from(
      new Set(
        changedFeatureSource
          .filter((id) => typeof id === "string")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
      )
    );
    const selectorHints =
      partial.selectorHints && typeof partial.selectorHints === "object"
        ? partial.selectorHints
        : request?.selectorHints && typeof request.selectorHints === "object"
          ? request.selectorHints
          : {};
    const selectorHintKeys = Object.keys(selectorHints).sort();
    const requested = changedFeatureIds.length > 0 || selectorHintKeys.length > 0;
    return {
      requested,
      changedFeatureIds,
      selectorHintKeys,
    };
  }

  function extractFeatureIdFromError(err) {
    if (err && typeof err === "object") {
      if (typeof err.featureId === "string" && err.featureId.length > 0) return err.featureId;
      if (err.details && typeof err.details === "object") {
        const featureId = err.details.featureId;
        if (typeof featureId === "string" && featureId.length > 0) return featureId;
      }
    }
    const message = err instanceof Error ? err.message : String(err ?? "");
    const match = message.match(/feature(?:Id)?\s*[:= ]\s*([A-Za-z0-9._:-]+)/i);
    return match ? match[1] : null;
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

  function makeDocumentRecord(tenantId, document) {
    const canonicalJson = stableStringify(document);
    const canonicalDocument = JSON.parse(canonicalJson);
    const bytes = Buffer.byteLength(canonicalJson);
    if (bytes > MAX_DOC_BYTES) {
      throw new HttpError(413, "document_too_large", `Document exceeds ${MAX_DOC_BYTES} bytes`, {
        tenantId,
        bytes,
        maxBytes: MAX_DOC_BYTES,
      });
    }
    const docId = sha256(canonicalJson);
    const createdAt = new Date().toISOString();
    return {
      id: docId,
      docId,
      tenantId,
      contentHash: docId,
      canonicalJson,
      document: canonicalDocument,
      createdAt,
      bytes,
    };
  }

  function storeDocument(tenantId, document) {
    const next = makeDocumentRecord(tenantId, document);
    const existing = documentStore.get(tenantScopedKey(tenantId, next.docId));
    if (existing) {
      return { record: existing, inserted: false };
    }
    assertTenantQuota(
      tenantId,
      "documents_per_tenant",
      MAX_DOCS_PER_TENANT,
      countTenantInStore(documentStore, tenantId)
    );
    documentStore.set(tenantScopedKey(tenantId, next.docId), next);
    return { record: next, inserted: true };
  }

  function makePartBuildKey(tenantId, part, context, overrides, backendFingerprint) {
    if (!context) return null;
    const coreKey = buildPartCacheKey(part, context, overrides);
    const key = {
      version: KEY_VERSION,
      type: "partBuildKey",
      tenantId,
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

  function storeAsset(tenantId, type, data, contentType, metadata = {}) {
    assertTenantQuota(
      tenantId,
      "assets_per_tenant",
      MAX_ASSETS_PER_TENANT,
      countTenantInStore(assetStore, tenantId)
    );
    const id = nextAssetId(type);
    const url = `/v1/assets/${type}/${id}`;
    assetStore.set(id, { tenantId, type, data, contentType });
    artifactStore.set(id, {
      artifactId: id,
      assetId: id,
      tenantId,
      type,
      url,
      createdAt: new Date().toISOString(),
      ...metadata,
    });
    return { id, url };
  }

  function resolvePart(tenantId, request) {
    let document = null;
    let docId = request?.docId ?? null;

    if (request?.document) {
      const stored = storeDocument(tenantId, request.document);
      document = stored.record.document;
      docId = stored.record.docId;
    } else if (docId) {
      const stored = documentStore.get(tenantScopedKey(tenantId, docId));
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
      tenantId,
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
    const asset = storeAsset(tenantId, "mesh", JSON.stringify(payload), "application/json", {
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
        tenantId: entry.tenantId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`preview prefetch failed for ${buildId}: ${message}`);
    }
  }

  async function handleBuild(tenantId, request, ctx) {
    await maybeSimulateDelay(request, ctx);
    const { part, document, docId } = resolvePart(tenantId, request);
    const sessionId =
      typeof request?.sessionId === "string" && request.sessionId.trim().length > 0
        ? request.sessionId.trim()
        : null;
    const buildSession = sessionId ? getBuildSession(tenantId, sessionId) : null;
    if (sessionId && !buildSession) {
      throw new HttpError(404, "build_session_not_found", `Unknown build session ${sessionId}`);
    }
    const sessionPartKey = buildSession ? `${docId ?? "_adhoc"}::${part.id}` : null;
    const overrides = request?.params ?? undefined;
    const units = request?.units;
    const partialHints = normalizePartialBuildHints(request);
    const validationMode = request?.options?.validationMode;
    const stagedFeatures = request?.options?.stagedFeatures;
    const validation = {
      ...(validationMode && validationMode !== "default"
        ? { validate: validationMode }
        : {}),
      ...(stagedFeatures ? { stagedFeatures } : {}),
    };
    const meshProfile = request?.options?.meshProfile ?? "interactive";
    const prefetchPreview = request?.options?.prefetchPreview !== false;

    const backendFingerprint = await getBackendFingerprint();
    const partBuildKey = makePartBuildKey(
      tenantId,
      part,
      document?.context,
      overrides,
      backendFingerprint
    );

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
      const sessionBuildEntry =
        buildSession && sessionPartKey
          ? buildSession.buildsByPartKey.get(sessionPartKey) ?? null
          : null;
      const previousBuild =
        partialHints.changedFeatureIds.length > 0 ? sessionBuildEntry?.result ?? null : null;
      try {
        buildResult = await buildPartAsync(
          part,
          backend,
          overrides,
          Object.keys(validation).length > 0 ? validation : undefined,
          units,
          previousBuild
            ? {
                incremental: {
                  previous: previousBuild,
                  changedFeatureIds: partialHints.changedFeatureIds,
                },
              }
            : undefined
        );
      } catch (err) {
        if (!partialHints.requested) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw new HttpError(400, "build_failed", message, {
          featureId: extractFeatureIdFromError(err) ?? partialHints.changedFeatureIds[0] ?? null,
          changedFeatureIds: partialHints.changedFeatureIds,
          selectorHintKeys: partialHints.selectorHintKeys,
        });
      }
      if (partBuildKey) {
        cacheSet(buildCache, partBuildKey.value, { result: buildResult }, BUILD_CACHE_MAX);
      }
    }
    if (buildSession && sessionPartKey) {
      setBuildSessionEntry(buildSession, sessionPartKey, {
        result: buildResult,
        partBuildKey: partBuildKey?.value ?? null,
      });
    }

    let dimensions = [];
    let assertions = [];
    let validationError = null;
    try {
      dimensions = evaluatePartDimensions(part, buildResult.final, {
        overrides,
        units: units ?? document?.context?.units ?? "mm",
      });
      if (!backendSync) await getBackendAsync();
      if (backendSync) {
        assertions = evaluatePartAssertions(part, buildResult.final, backendSync, {
          overrides,
          units: units ?? document?.context?.units ?? "mm",
        });
      }
    } catch (err) {
      validationError = err instanceof Error ? err.message : String(err);
    }

    const buildId = nextBuildId();
    const entry = {
      id: buildId,
      tenantId,
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
        tenantId,
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

    const diagnosticsMode =
      partialHints.requested && partBuildHit
        ? "incremental"
        : partialHints.requested
          ? buildResult.diagnostics?.mode ?? "full"
          : "full";
    const reusedFeatureIds =
      partialHints.requested && partBuildHit
        ? buildResult.order.slice()
        : buildResult.diagnostics?.reusedFeatureIds ?? [];
    const invalidatedFeatureIds =
      partialHints.requested && partBuildHit
        ? []
        : buildResult.diagnostics?.invalidatedFeatureIds ?? buildResult.order.slice();

    ctx?.updateProgress(1);
    return {
      buildId,
      partId: buildResult.partId,
      docId,
      sessionId: buildSession?.id ?? null,
      backendFingerprint,
      featureOrder: buildResult.order,
      outputs: buildOutputsMap(buildResult.final.outputs),
      selections: buildSelectionIndex(buildResult.final.selections),
      mesh: meshAsset,
      metadata: bounds ? { bounds, triangleCount } : { triangleCount },
      validation: {
        dimensions,
        assertions,
        summary: {
          dimensions: summarizeValidation(dimensions),
          assertions: summarizeValidation(assertions),
        },
        error: validationError,
      },
      diagnostics: {
        partialBuild: {
          buildMode: diagnosticsMode,
          requestedChangedFeatureIds: partialHints.changedFeatureIds,
          selectorHintKeys: partialHints.selectorHintKeys,
          reusedFeatureIds,
          invalidatedFeatureIds,
          failedFeatureId: buildResult.diagnostics?.failedFeatureId ?? null,
        },
      },
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

  async function handleAssemblySolve(tenantId, request, ctx) {
    await maybeSimulateDelay(request, ctx);
    let document = null;
    let docId = request?.docId ?? null;
    if (request?.document) {
      const stored = storeDocument(tenantId, request.document);
      document = stored.record.document;
      docId = stored.record.docId;
    } else if (docId) {
      const stored = documentStore.get(tenantScopedKey(tenantId, docId));
      if (!stored) {
        throw new HttpError(404, "document_not_found", `Unknown document ${docId}`);
      }
      document = stored.document;
    }
    if (!document || !Array.isArray(document.parts)) {
      throw new HttpError(400, "invalid_request", "Assembly solve requires document/docId with parts[]");
    }

    const assemblies = Array.isArray(document.assemblies) ? document.assemblies : [];
    let assembly = null;
    if (request?.assembly && typeof request.assembly === "object") {
      assembly = request.assembly;
    } else if (request?.assemblyId) {
      assembly = assemblies.find((candidate) => candidate?.id === request.assemblyId) ?? null;
    } else {
      assembly = assemblies[0] ?? null;
    }
    if (!assembly) {
      throw new HttpError(400, "assembly_not_found", "Assembly solve requires assembly payload or document assembly");
    }
    if (!Array.isArray(assembly.instances) || assembly.instances.length === 0) {
      throw new HttpError(400, "invalid_assembly", "Assembly must include instances[]");
    }

    const backendFingerprint = await getBackendFingerprint();
    const backend = await getBackendAsync();
    const byPartId = new Map(document.parts.map((part) => [part.id, part]));
    const uniquePartIds = Array.from(
      new Set(
        assembly.instances
          .map((instance) => instance?.part)
          .filter((partId) => typeof partId === "string" && partId.length > 0)
      )
    );
    const builtParts = [];
    for (const partId of uniquePartIds) {
      const part = byPartId.get(partId);
      if (!part) {
        throw new HttpError(400, "part_not_found", `Assembly references missing part ${partId}`);
      }
      const partBuildKey = makePartBuildKey(
        tenantId,
        part,
        document?.context,
        undefined,
        backendFingerprint
      );
      let built = null;
      if (partBuildKey && buildCache.has(partBuildKey.value)) {
        built = buildCache.get(partBuildKey.value).result;
        recordCacheEvent("partBuild", true, partBuildKey.value);
      } else {
        recordCacheEvent("partBuild", false, partBuildKey?.value);
        built = await buildPartAsync(
          part,
          backend,
          undefined,
          undefined,
          document?.context?.units
        );
        if (partBuildKey) {
          cacheSet(buildCache, partBuildKey.value, { result: built }, BUILD_CACHE_MAX);
        }
      }
      builtParts.push(built);
    }

    const { simulateDelayMs: _assemblyDelayMs, ...solveOptions } = request?.options ?? {};
    void _assemblyDelayMs;
    const solved = buildAssembly(assembly, builtParts, solveOptions);
    const connectorMap = new Map();
    for (const built of builtParts) {
      connectorMap.set(built.partId, built.connectors);
    }
    const residuals = residualsForTesting(assembly.mates ?? [], solved.instances, connectorMap);
    const mateResiduals = summarizeMateResiduals(assembly.mates ?? [], residuals);

    ctx?.updateProgress(1);
    return {
      assemblyId: solved.assemblyId,
      docId,
      converged: solved.converged,
      iterations: solved.iterations,
      residual: solved.residual,
      instances: solved.instances.map((instance) => ({
        id: instance.id,
        part: instance.part,
        transform: [...instance.transform],
      })),
      diagnostics: {
        mateResiduals,
      },
    };
  }

  async function handleMesh(tenantId, request, ctx) {
    await maybeSimulateDelay(request, ctx);
    const buildId = request?.buildId;
    if (!buildId || !buildStore.has(buildId)) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
    const entry = buildStore.get(buildId);
    if (entry.tenantId !== tenantId) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
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
      tenantId,
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

  async function handleExport(tenantId, request, kind, ctx) {
    await maybeSimulateDelay(request, ctx);
    const buildId = request?.buildId;
    if (!buildId || !buildStore.has(buildId)) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
    const entry = buildStore.get(buildId);
    if (entry.tenantId !== tenantId) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }
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

    const asset = storeAsset(tenantId, "export", payload, "application/octet-stream", {
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

  async function enqueueJob(tenantId, handler, payload, timeoutMs) {
    assertTenantQuota(
      tenantId,
      "pending_jobs_per_tenant",
      MAX_PENDING_JOBS_PER_TENANT,
      countPendingJobsForTenant(tenantId)
    );
    const job = jobQueue.enqueue(
      async (ctx) => handler(tenantId, payload, ctx),
      timeoutMs ? { timeoutMs } : {}
    );
    jobOwners.set(job.id, tenantId);
    return job;
  }

  function enqueueBuild(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
    return enqueueJob(tenantId, handleBuild, payload, timeoutMs);
  }

  function enqueueMesh(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs;
    return enqueueJob(tenantId, handleMesh, payload, timeoutMs);
  }

  function enqueueAssemblySolve(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
    return enqueueJob(tenantId, handleAssemblySolve, payload, timeoutMs);
  }

  function enqueueExport(tenantId, payload, kind) {
    const timeoutMs = payload?.timeoutMs;
    return enqueueJob(tenantId, (ownerTenantId, request, ctx) => handleExport(ownerTenantId, request, kind, ctx), payload, timeoutMs);
  }

  function assertTenantJobAccess(tenantId, jobId) {
    const owner = jobOwners.get(jobId);
    if (!owner || owner !== tenantId) {
      throw new HttpError(404, "job_not_found", "Job not found");
    }
  }

  function toJobRecordEnvelope(record) {
    if (!record || typeof record !== "object") return record;
    const id = String(record.id ?? record.jobId ?? "");
    const jobId = String(record.jobId ?? record.id ?? "");
    return {
      ...record,
      id,
      jobId,
    };
  }

  function toJobAccepted(record) {
    const job = toJobRecordEnvelope(record);
    return {
      id: job.id,
      jobId: job.jobId,
      state: job.state,
    };
  }

  function writeSse(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
        "access-control-allow-headers": `content-type,${TENANT_HEADER}`,
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const tenantId = getTenantId(req, url);
    pruneExpiredBuildSessions();

    try {
      if (req.method === "GET" && pathname === TF_API_ENDPOINTS.capabilities) {
        await getBackendAsync();
        const caps = backendSync?.capabilities?.() ?? {};
        const backendFingerprint = await getBackendFingerprint();
        json(res, 200, {
          apiVersion: TF_API_VERSION,
          tenantId,
          backend: caps.name ?? "opencascade.js",
          backendFingerprint,
          featureKinds: caps.featureKinds ?? [],
          featureStages: caps.featureStages ?? TF_RUNTIME_FEATURE_STAGING,
          exports: caps.exports ?? { step: true, stl: true },
          mesh: caps.mesh ?? true,
          assertions: caps.assertions ?? [],
          quotas: {
            maxDocumentBytes: MAX_DOC_BYTES,
            maxDocumentsPerTenant: MAX_DOCS_PER_TENANT,
            maxAssetsPerTenant: MAX_ASSETS_PER_TENANT,
            maxPendingJobsPerTenant: MAX_PENDING_JOBS_PER_TENANT,
            maxBuildSessionsPerTenant: MAX_BUILD_SESSIONS_PER_TENANT,
            maxBuildsPerSession: MAX_BUILDS_PER_SESSION,
            buildSessionTtlMs: BUILD_SESSION_TTL_MS,
          },
          optionalFeatures: TF_RUNTIME_OPTIONAL_FEATURES,
        });
        return;
      }

      if (req.method === "GET" && pathname === TF_API_ENDPOINTS.openapi) {
        const openapi = {
          ...TF_RUNTIME_OPENAPI,
          info: {
            ...TF_RUNTIME_OPENAPI.info,
            version: TF_API_VERSION,
          },
        };
        json(res, 200, openapi);
        return;
      }

      if (req.method === "POST" && pathname === TF_API_ENDPOINTS.documents) {
        const payload = await readJson(req);
        const document = payload?.document ?? payload;
        if (!document || !Array.isArray(document.parts)) {
          throw new HttpError(400, "invalid_document", "Document payload must include parts[]");
        }
        const stored = storeDocument(tenantId, document);
        json(res, stored.inserted ? 201 : 200, {
          tenantId,
          docId: stored.record.docId,
          contentHash: stored.record.contentHash,
          inserted: stored.inserted,
          createdAt: stored.record.createdAt,
          bytes: stored.record.bytes,
          url: `/v1/documents/${stored.record.docId}`,
        });
        return;
      }

      if (req.method === "GET" && pathname.startsWith(`${TF_API_ENDPOINTS.documents}/`)) {
        const docId = pathname.split("/").pop();
        const stored = docId ? documentStore.get(tenantScopedKey(tenantId, docId)) : null;
        if (!stored) {
          json(res, 404, { error: "Document not found" });
          return;
        }
        json(res, 200, {
          tenantId,
          docId: stored.docId,
          contentHash: stored.contentHash,
          createdAt: stored.createdAt,
          bytes: stored.bytes,
          document: stored.document,
        });
        return;
      }

      if (req.method === "POST" && pathname === TF_API_ENDPOINTS.buildSessions) {
        const session = createBuildSession(tenantId);
        json(res, 201, {
          sessionId: session.id,
          tenantId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          expiresAt: new Date(session.expiresAtMs).toISOString(),
        });
        return;
      }

      if (req.method === "DELETE" && pathname.startsWith(`${TF_API_ENDPOINTS.buildSessions}/`)) {
        const sessionId = pathname.split("/").pop();
        if (!sessionId || !dropBuildSession(tenantId, sessionId)) {
          json(res, 404, { error: { code: "build_session_not_found", message: "Build session not found" } });
          return;
        }
        res.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
          "access-control-allow-headers": `content-type,${TENANT_HEADER}`,
        });
        res.end();
        return;
      }

      if (
        req.method === "POST" &&
        (pathname === TF_API_ENDPOINTS.build ||
          pathname === TF_API_ENDPOINTS.buildJobs ||
          pathname === TF_API_ENDPOINTS.buildPartial ||
          pathname === TF_API_ENDPOINTS.buildPartialJobs)
      ) {
        const payload = await readJson(req);
        const job = await enqueueBuild(tenantId, payload);
        json(res, 202, toJobAccepted(job));
        return;
      }

      if (
        req.method === "POST" &&
        (pathname === TF_API_ENDPOINTS.assemblySolve ||
          pathname === TF_API_ENDPOINTS.assemblySolveJobs)
      ) {
        const payload = await readJson(req);
        const job = await enqueueAssemblySolve(tenantId, payload);
        json(res, 202, toJobAccepted(job));
        return;
      }

      if (req.method === "POST" && (pathname === TF_API_ENDPOINTS.mesh || pathname === TF_API_ENDPOINTS.meshJobs)) {
        const payload = await readJson(req);
        const job = await enqueueMesh(tenantId, payload);
        json(res, 202, toJobAccepted(job));
        return;
      }

      if (
        req.method === "POST" &&
        (pathname === TF_API_ENDPOINTS.exportStep || pathname === TF_API_ENDPOINTS.exportStepJobs)
      ) {
        const payload = await readJson(req);
        const job = await enqueueExport(tenantId, payload, "step");
        json(res, 202, toJobAccepted(job));
        return;
      }

      if (
        req.method === "POST" &&
        (pathname === TF_API_ENDPOINTS.exportStl || pathname === TF_API_ENDPOINTS.exportStlJobs)
      ) {
        const payload = await readJson(req);
        const job = await enqueueExport(tenantId, payload, "stl");
        json(res, 202, toJobAccepted(job));
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/jobs/") && pathname.endsWith("/stream")) {
        const parts = pathname.split("/");
        const jobId = parts[3];
        if (!jobId) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        assertTenantJobAccess(tenantId, jobId);
        const job = jobQueue.get(jobId);
        if (!job) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        });
        writeSse(res, "job", toJobRecordEnvelope(job));
        let lastUpdatedAt = job.updatedAt;
        const timer = setInterval(() => {
          const current = jobQueue.get(jobId);
          if (!current) return;
          if (current.updatedAt !== lastUpdatedAt) {
            lastUpdatedAt = current.updatedAt;
            writeSse(res, "job", toJobRecordEnvelope(current));
          }
          if (
            current.state === "succeeded" ||
            current.state === "failed" ||
            current.state === "canceled"
          ) {
            writeSse(res, "end", toJobRecordEnvelope(current));
            clearInterval(timer);
            res.end();
          }
        }, 200);
        req.on("close", () => {
          clearInterval(timer);
        });
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/jobs/")) {
        const jobId = pathname.split("/").pop();
        assertTenantJobAccess(tenantId, jobId);
        const job = jobQueue.get(jobId);
        if (!job) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        json(res, 200, toJobRecordEnvelope(job));
        return;
      }

      if (req.method === "DELETE" && pathname.startsWith("/v1/jobs/")) {
        const jobId = pathname.split("/").pop();
        assertTenantJobAccess(tenantId, jobId);
        const canceled = jobQueue.cancel(jobId);
        const job = jobQueue.get(jobId);
        if (!job && !canceled) {
          json(res, 404, { error: "Job not found" });
          return;
        }
        json(
          res,
          200,
          toJobRecordEnvelope(
            job ?? {
              id: jobId,
              jobId,
              state: canceled ? "canceled" : "unknown",
              progress: canceled ? 1 : 0,
              createdAt: "",
              updatedAt: "",
              result: null,
              error: null,
            }
          )
        );
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/assets/mesh/")) {
        const id = pathname.split("/").pop();
        const asset = id ? assetStore.get(id) : null;
        if (!asset || asset.tenantId !== tenantId) {
          text(res, 404, "Asset not found");
          return;
        }
        bytes(res, 200, asset.data, asset.contentType);
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/assets/export/")) {
        const id = pathname.split("/").pop();
        const asset = id ? assetStore.get(id) : null;
        if (!asset || asset.tenantId !== tenantId) {
          text(res, 404, "Asset not found");
          return;
        }
        bytes(res, 200, asset.data, asset.contentType);
        return;
      }

      if (req.method === "GET" && pathname.startsWith("/v1/artifacts/")) {
        const id = pathname.split("/").pop();
        const artifact = id ? artifactStore.get(id) : null;
        if (!artifact || artifact.tenantId !== tenantId) {
          json(res, 404, { error: "Artifact not found" });
          return;
        }
        json(res, 200, artifact);
        return;
      }

      if (req.method === "GET" && pathname === "/v1/metrics") {
        json(res, 200, {
          tenantId,
          cache: cacheStats,
          stores: {
            documents: countTenantInStore(documentStore, tenantId),
            builds: countTenantInStore(buildStore, tenantId),
            assets: countTenantInStore(assetStore, tenantId),
            artifacts: countTenantInStore(artifactStore, tenantId),
            buildSessions: countTenantInStore(buildSessionStore, tenantId),
            buildCache: buildCache.size,
            meshCache: meshCache.size,
            exportCache: exportCache.size,
            pendingJobs: countPendingJobsForTenant(tenantId),
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
