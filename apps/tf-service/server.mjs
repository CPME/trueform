import http from "node:http";
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
  TF_RUNTIME_ERROR_CONTRACT,
  TF_RUNTIME_SEMANTIC_TOPOLOGY,
  TF_API_VERSION,
  TF_RUNTIME_OPENAPI,
  resolveRuntimeFeatureStages,
} from "../../dist/api.js";
import { OcctBackend } from "../../dist/backends.js";
import { backendToAsync } from "../../dist/backend-spi.js";
import { buildAssembly, InMemoryJobQueue } from "../../dist/experimental.js";
import {
  streamMeshAssetChunks as writeMeshAssetChunks,
  writeBytes,
  writeJson,
  writeNoContent,
  writeSse,
  writeText,
} from "./http_response.mjs";
import {
  countTenantInStore,
  getTenantId,
  tenantScopedKey,
} from "./tenant.mjs";
import { tryHandleMetadataRoute } from "./route_metadata.mjs";
import { tryHandleDocumentRoute } from "./route_documents.mjs";
import { tryHandleResourceRoute } from "./route_resources.mjs";
import { tryHandleActionRoute } from "./route_actions.mjs";
import { createJobRuntime } from "./job_runtime.mjs";
import { createDocumentStoreService } from "./service_document_store.mjs";
import {
  cacheSet,
  computeBounds,
  makeExportKey,
  makeLatencyBucket,
  makeMeshKey,
  makePartBuildKey,
  memorySnapshot,
  recordCacheEvent,
  recordLatency,
  sha256,
  stableStringify,
  triangleCountFromMesh,
} from "./service_cache_stats.mjs";
import {
  buildEdgeSelectionIndices,
  buildOutputsMap,
  buildSelectionIndex,
  inferMeasureUnits,
  measureMetricsForSelection,
  resolveMeasureSelection,
  sanitizeSelections,
  scopeSelectionsToTarget,
  summarizeMateResiduals,
  summarizeSelections,
  summarizeValidation,
} from "./service_selection_measure.mjs";

const DEFAULT_PORT = Number(process.env.TF_RUNTIME_PORT || process.env.PORT || 8080);
const DEFAULT_JOB_TIMEOUT_MS = Number(process.env.TF_RUNTIME_JOB_TIMEOUT_MS || 30000);
const JOB_RETENTION_MS = Number(process.env.TF_RUNTIME_JOB_RETENTION_MS || 30 * 60 * 1000);
const JOB_MAX_RETAINED = Number(process.env.TF_RUNTIME_JOB_MAX_RETAINED || 512);
const BUILD_CACHE_MAX = Number(process.env.TF_RUNTIME_BUILD_CACHE_MAX || 32);
const MESH_CACHE_MAX = Number(process.env.TF_RUNTIME_MESH_CACHE_MAX || 64);
const EXPORT_CACHE_MAX = Number(process.env.TF_RUNTIME_EXPORT_CACHE_MAX || 64);
const BUILD_STORE_MAX = Number(process.env.TF_RUNTIME_BUILD_STORE_MAX || 256);
const BUILD_STORE_TTL_MS = Number(process.env.TF_RUNTIME_BUILD_STORE_TTL_MS || 30 * 60 * 1000);
const ASSET_STORE_MAX = Number(process.env.TF_RUNTIME_ASSET_STORE_MAX || 4096);
const ARTIFACT_STORE_MAX = Number(process.env.TF_RUNTIME_ARTIFACT_STORE_MAX || 4096);
const JOB_OWNER_RETENTION_MS = Number(
  process.env.TF_RUNTIME_JOB_OWNER_RETENTION_MS || 30 * 60 * 1000
);
const MAX_DOC_BYTES = Number(process.env.TF_RUNTIME_MAX_DOCUMENT_BYTES || 2_000_000);
const MAX_DOCS_PER_TENANT = Number(process.env.TF_RUNTIME_MAX_DOCUMENTS_PER_TENANT || 256);
const MAX_DOC_VERSIONS_PER_KEY = Number(process.env.TF_RUNTIME_MAX_DOC_VERSIONS_PER_KEY || 256);
const MAX_ASSETS_PER_TENANT = Number(process.env.TF_RUNTIME_MAX_ASSETS_PER_TENANT || 1024);
const MAX_PENDING_JOBS_PER_TENANT = Number(
  process.env.TF_RUNTIME_MAX_PENDING_JOBS_PER_TENANT || 32
);
const MAX_BUILD_SESSIONS_PER_TENANT = Number(
  process.env.TF_RUNTIME_MAX_BUILD_SESSIONS_PER_TENANT || 32
);
const MAX_BUILDS_PER_SESSION = Number(process.env.TF_RUNTIME_MAX_BUILDS_PER_SESSION || 8);
const BUILD_SESSION_TTL_MS = Number(process.env.TF_RUNTIME_BUILD_SESSION_TTL_MS || 30 * 60 * 1000);
const KEY_VERSION = "tf-service-key-v2";
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
    maxRetainedJobs: Number(options.maxRetainedJobs ?? JOB_MAX_RETAINED),
    terminalRetentionMs: Number(options.jobRetentionMs ?? JOB_RETENTION_MS),
  });

  const documentStore = new Map();
  const documentVersionStore = new Map();
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
  const jobLatencyStats = {
    build: makeLatencyBucket(),
    mesh: makeLatencyBucket(),
    exportStep: makeLatencyBucket(),
    exportStl: makeLatencyBucket(),
    assemblySolve: makeLatencyBucket(),
  };

  let assetCounter = 0;
  let buildCounter = 0;
  let sessionCounter = 0;
  const startedAtMs = Date.now();

  let occtPromise;
  let backendSync;
  let backendFingerprintPromise;
  let backendInitError = null;

  async function getBackendAsync() {
    try {
      if (!occtPromise) occtPromise = initOpenCascade();
      const occt = await occtPromise;
      if (!backendSync) backendSync = new OcctBackend({ occt });
      backendInitError = null;
      return backendToAsync(backendSync);
    } catch (err) {
      backendInitError = err instanceof Error ? err.message : String(err);
      throw err;
    }
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

  const documentStoreService = createDocumentStoreService({
    documentStore,
    documentVersionStore,
    buildSessionStore,
    maxDocBytes: MAX_DOC_BYTES,
    maxDocsPerTenant: MAX_DOCS_PER_TENANT,
    maxDocVersionsPerKey: MAX_DOC_VERSIONS_PER_KEY,
    maxBuildSessionsPerTenant: MAX_BUILD_SESSIONS_PER_TENANT,
    maxBuildsPerSession: MAX_BUILDS_PER_SESSION,
    buildSessionTtlMs: BUILD_SESSION_TTL_MS,
    makeHttpError: (status, code, message, details) =>
      new HttpError(status, code, message, details),
    stableStringify,
    sha256,
    nextBuildSessionId: () => {
      sessionCounter += 1;
      return `session_${Date.now()}_${sessionCounter}`;
    },
  });

  function json(res, status, payload) {
    writeJson(res, status, payload, TENANT_HEADER);
  }

  function text(res, status, payload) {
    writeText(res, status, payload, TENANT_HEADER);
  }

  function sendNoContent(res) {
    writeNoContent(res, TENANT_HEADER);
  }

  function bytes(res, status, payload, contentType) {
    writeBytes(res, status, payload, contentType, TENANT_HEADER);
  }

  function streamMeshAssetChunks(res, asset, chunkSize = 12000) {
    writeMeshAssetChunks(res, asset, TENANT_HEADER, chunkSize);
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

  function isTerminalJobState(state) {
    return state === "succeeded" || state === "failed" || state === "canceled";
  }

  function throwIfCanceled(ctx) {
    if (!ctx?.throwIfCanceled) return;
    ctx.throwIfCanceled();
  }

  function pruneBuildStore() {
    const now = Date.now();
    if (BUILD_STORE_TTL_MS > 0) {
      for (const [buildId, entry] of buildStore.entries()) {
        const createdAt = Number(entry?.createdAtMs ?? 0);
        if (!Number.isFinite(createdAt) || createdAt <= 0) continue;
        if (now - createdAt > BUILD_STORE_TTL_MS) {
          buildStore.delete(buildId);
        }
      }
    }
    while (buildStore.size > BUILD_STORE_MAX) {
      const oldest = buildStore.keys().next().value;
      if (!oldest) break;
      buildStore.delete(oldest);
    }
  }

  function pruneAssetStores() {
    while (assetStore.size > ASSET_STORE_MAX) {
      const oldest = assetStore.keys().next().value;
      if (!oldest) break;
      assetStore.delete(oldest);
      artifactStore.delete(oldest);
    }
    while (artifactStore.size > ARTIFACT_STORE_MAX) {
      const oldest = artifactStore.keys().next().value;
      if (!oldest) break;
      artifactStore.delete(oldest);
      assetStore.delete(oldest);
    }
  }

  function pruneJobOwners() {
    const now = Date.now();
    for (const [jobId, owner] of jobOwners.entries()) {
      const record = jobQueue.get(jobId);
      if (!record) {
        jobOwners.delete(jobId);
        continue;
      }
      if (owner?.tenantId !== undefined) continue;
      jobOwners.set(jobId, { tenantId: owner, completedAtMs: null });
    }

    for (const [jobId, owner] of jobOwners.entries()) {
      const record = jobQueue.get(jobId);
      if (!record) {
        jobOwners.delete(jobId);
        continue;
      }
      if (isTerminalJobState(record.state)) {
        const completedAt =
          owner.completedAtMs ??
          (Number.isFinite(Date.parse(record.updatedAt))
            ? Date.parse(record.updatedAt)
            : now);
        owner.completedAtMs = completedAt;
        if (now - completedAt > JOB_OWNER_RETENTION_MS) {
          jobOwners.delete(jobId);
        }
      } else {
        owner.completedAtMs = null;
      }
    }
  }

  function countPendingJobsForTenant(tenantId) {
    pruneJobOwners();
    let count = 0;
    for (const [jobId, owner] of jobOwners.entries()) {
      if (owner?.tenantId !== tenantId) continue;
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
    const createdAt = new Date().toISOString();
    artifactStore.set(id, {
      artifactId: id,
      assetId: id,
      tenantId,
      type,
      url,
      createdAt,
      createdAtMs: Date.parse(createdAt),
      ...metadata,
    });
    pruneAssetStores();
    return { id, url };
  }

  function resolvePart(tenantId, request) {
    let document = null;
    let docId = request?.docId ?? null;

    if (request?.document) {
      const stored = documentStoreService.storeDocument(tenantId, request.document);
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
      throwIfCanceled(ctx);
      if (ctx?.isCanceled?.()) break;
      const elapsed = Date.now() - start;
      const ratio = delay > 0 ? Math.min(1, elapsed / delay) : 1;
      ctx?.updateProgress(Math.min(0.2, ratio * 0.2));
      const remaining = Math.max(0, delay - elapsed);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(25, remaining)));
    }
    throwIfCanceled(ctx);
  }

  async function resolveMeshAsset(params) {
    const {
      output,
      target,
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

    const meshKey = makeMeshKey(KEY_VERSION, partBuildKey, target, profile, options);
    const cached = meshKey ? meshCache.get(meshKey.value) : null;
    if (cached) {
      recordCacheEvent(cacheStats, "mesh", true, meshKey.value);
      return {
        asset: cached.asset,
        bounds: cached.bounds,
        meshKey,
        hit: true,
        triangleCount: cached.triangleCount,
      };
    }

    recordCacheEvent(cacheStats, "mesh", false, meshKey?.value);
    throwIfCanceled(ctx);
    ctx?.updateProgress(0.6);
    const backend = await getBackendAsync();
    const mesh = await backend.mesh(output, options);
    throwIfCanceled(ctx);
    const scopedSelections = scopeSelectionsToTarget(selections, target, output);
    const safeSelections = sanitizeSelections(scopedSelections);
    const edgeSelectionIndices = buildEdgeSelectionIndices(mesh, safeSelections);
    const selectionSummary = summarizeSelections(safeSelections);
    const triangleCount = triangleCountFromMesh(mesh);
    const bounds = computeBounds(mesh.positions);
    const payload = {
      ...mesh,
      ...(Array.isArray(edgeSelectionIndices) ? { edgeSelectionIndices } : {}),
      selections: safeSelections,
      selectionSummary,
    };
    throwIfCanceled(ctx);
    const asset = storeAsset(tenantId, "mesh", JSON.stringify(payload), "application/json", {
      buildId,
      partId,
      docId,
      partBuildKey: partBuildKey?.value ?? null,
      meshKey: meshKey?.value ?? null,
      target,
      profile,
      options,
      purpose,
      triangleCount,
      bounds,
    });
    if (meshKey) {
      cacheSet(meshCache, meshKey.value, { asset, bounds, triangleCount }, MESH_CACHE_MAX);
    }
    throwIfCanceled(ctx);
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
        target: "body:main",
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
    throwIfCanceled(ctx);
    const { part, document, docId } = resolvePart(tenantId, request);
    const sessionId =
      typeof request?.sessionId === "string" && request.sessionId.trim().length > 0
        ? request.sessionId.trim()
        : null;
    const buildSession = sessionId ? documentStoreService.getBuildSession(tenantId, sessionId) : null;
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
    throwIfCanceled(ctx);
    const partBuildKey = makePartBuildKey(
      KEY_VERSION,
      tenantId,
      part,
      document?.context,
      overrides,
      backendFingerprint,
      buildPartCacheKey
    );

    let buildResult = null;
    let partBuildHit = false;
    if (partBuildKey && buildCache.has(partBuildKey.value)) {
      buildResult = buildCache.get(partBuildKey.value).result;
      partBuildHit = true;
      recordCacheEvent(cacheStats, "partBuild", true, partBuildKey.value);
    }

    if (!buildResult) {
      recordCacheEvent(cacheStats, "partBuild", false, partBuildKey?.value);
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
        throwIfCanceled(ctx);
      } catch (err) {
        if (!partialHints.requested) throw err;
        const message = err instanceof Error ? err.message : String(err);
        const details =
          err && typeof err === "object" && err.details && typeof err.details === "object"
            ? { ...err.details }
            : {};
        const featureId = extractFeatureIdFromError(err) ?? partialHints.changedFeatureIds[0] ?? null;
        if (featureId && typeof details.featureId !== "string") {
          details.featureId = featureId;
        }
        details.changedFeatureIds = partialHints.changedFeatureIds;
        details.selectorHintKeys = partialHints.selectorHintKeys;
        const code =
          err && typeof err === "object" && typeof err.code === "string"
            ? err.code
            : "build_failed";
        throw new HttpError(400, code, message, details);
      }
      if (partBuildKey) {
        throwIfCanceled(ctx);
        cacheSet(buildCache, partBuildKey.value, { result: buildResult }, BUILD_CACHE_MAX);
      }
    }
    if (buildSession && sessionPartKey) {
      documentStoreService.setBuildSessionEntry(buildSession, sessionPartKey, {
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

    throwIfCanceled(ctx);
    const buildId = nextBuildId();
    const entry = {
      id: buildId,
      createdAtMs: Date.now(),
      tenantId,
      partId: buildResult.partId,
      result: buildResult,
      partBuildKey,
      docId,
      backendFingerprint,
    };
    buildStore.set(buildId, entry);
    pruneBuildStore();

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
        target: "body:main",
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
      throwIfCanceled(ctx);
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
    throwIfCanceled(ctx);
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
      const stored = documentStoreService.storeDocument(tenantId, request.document);
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
        KEY_VERSION,
        tenantId,
        part,
        document?.context,
        undefined,
        backendFingerprint,
        buildPartCacheKey
      );
      let built = null;
      if (partBuildKey && buildCache.has(partBuildKey.value)) {
        built = buildCache.get(partBuildKey.value).result;
        recordCacheEvent(cacheStats, "partBuild", true, partBuildKey.value);
      } else {
        recordCacheEvent(cacheStats, "partBuild", false, partBuildKey?.value);
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
    throwIfCanceled(ctx);
    pruneBuildStore();
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
      target,
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
    throwIfCanceled(ctx);
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
    throwIfCanceled(ctx);
    pruneBuildStore();
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

    const exportKey = makeExportKey(KEY_VERSION, entry.partBuildKey, target, kind, options);
    const cached = exportKey ? exportCache.get(exportKey.value) : null;
    if (cached) {
      recordCacheEvent(cacheStats, "export", true, exportKey.value);
      ctx?.updateProgress(1);
      return {
        asset: cached.asset,
        kind,
        keys: { exportKey: exportKey.value },
        cache: { export: { hit: true } },
      };
    }

    recordCacheEvent(cacheStats, "export", false, exportKey?.value);
    throwIfCanceled(ctx);
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
    throwIfCanceled(ctx);

    const asset = storeAsset(tenantId, "export", payload, "application/octet-stream", {
      buildId: entry.id,
      partId: entry.partId,
      docId: entry.docId,
      kind,
      target,
      options,
      partBuildKey: entry.partBuildKey?.value ?? null,
      exportKey: exportKey?.value ?? null,
      purpose: "export",
    });
    if (exportKey) {
      cacheSet(exportCache, exportKey.value, { asset }, EXPORT_CACHE_MAX);
    }
    ctx?.updateProgress(1);
    throwIfCanceled(ctx);
    return {
      asset,
      kind,
      keys: { exportKey: exportKey?.value ?? null },
      cache: { export: { hit: false } },
    };
  }

  async function handleMeasure(tenantId, request) {
    pruneBuildStore();
    const buildId =
      typeof request?.buildId === "string" && request.buildId.trim().length > 0
        ? request.buildId.trim()
        : null;
    const target =
      typeof request?.target === "string" && request.target.trim().length > 0
        ? request.target.trim()
        : null;
    if (!buildId || !target) {
      throw new HttpError(
        400,
        "invalid_measure_request",
        "Measure request requires non-empty buildId and target"
      );
    }

    const entry = buildStore.get(buildId);
    if (!entry || entry.tenantId !== tenantId) {
      throw new HttpError(404, "build_not_found", "Unknown buildId");
    }

    const selection = resolveMeasureSelection(entry, target);
    if (!selection) {
      throw new HttpError(404, "measure_target_not_found", `Unknown target ${target}`, {
        buildId,
        target,
      });
    }

    const units = inferMeasureUnits(
      entry,
      (tenantId, docId) => documentStore.get(tenantScopedKey(tenantId, docId))
    );
    const metrics = measureMetricsForSelection(selection, units);
    return { target, metrics };
  }

  async function runtimeHealthPayload(tenantId) {
    if (!backendSync && !backendInitError) {
      try {
        await getBackendAsync();
      } catch {
        // Health response reports dependency errors instead of throwing.
      }
    }

    let backendFingerprint = null;
    if (backendSync) {
      try {
        backendFingerprint = await getBackendFingerprint();
      } catch {
        // Keep health response stable even if fingerprinting fails.
      }
    }

    const queueStats =
      typeof jobQueue.getStats === "function"
        ? jobQueue.getStats()
        : {
            queued: 0,
            running: 0,
            succeeded: 0,
            failed: 0,
            canceled: 0,
            retained: 0,
            maxRetained: JOB_MAX_RETAINED,
          };

    return {
      status: backendInitError ? "degraded" : "ok",
      apiVersion: TF_API_VERSION,
      tenantId,
      timestamp: new Date().toISOString(),
      uptimeMs: Math.max(0, Date.now() - startedAtMs),
      dependencies: {
        opencascade: {
          ready: Boolean(backendSync),
          error: backendInitError,
        },
      },
      backend: {
        ready: Boolean(backendSync),
        fingerprint: backendFingerprint,
      },
      queue: queueStats,
      stores: {
        documents: countTenantInStore(documentStore, tenantId),
        documentVersions: countTenantInStore(documentVersionStore, tenantId),
        builds: countTenantInStore(buildStore, tenantId),
        assets: countTenantInStore(assetStore, tenantId),
        artifacts: countTenantInStore(artifactStore, tenantId),
        buildSessions: countTenantInStore(buildSessionStore, tenantId),
      },
    };
  }

  async function getCapabilitiesPayload(tenantId) {
    await getBackendAsync();
    const caps = backendSync?.capabilities?.() ?? {};
    const backendFingerprint = await getBackendFingerprint();
    return {
      apiVersion: TF_API_VERSION,
      tenantId,
      backend: caps.name ?? "opencascade.js",
      backendFingerprint,
      featureKinds: caps.featureKinds ?? [],
      featureStages: resolveRuntimeFeatureStages(caps.featureKinds, caps.featureStages),
      exports: caps.exports ?? { step: true, stl: true },
      mesh: caps.mesh ?? true,
      assertions: caps.assertions ?? [],
      quotas: {
        maxDocumentBytes: MAX_DOC_BYTES,
        maxDocumentsPerTenant: MAX_DOCS_PER_TENANT,
        maxDocVersionsPerKey: MAX_DOC_VERSIONS_PER_KEY,
        maxAssetsPerTenant: MAX_ASSETS_PER_TENANT,
        maxPendingJobsPerTenant: MAX_PENDING_JOBS_PER_TENANT,
        maxBuildSessionsPerTenant: MAX_BUILD_SESSIONS_PER_TENANT,
        maxBuildsPerSession: MAX_BUILDS_PER_SESSION,
        buildSessionTtlMs: BUILD_SESSION_TTL_MS,
      },
      optionalFeatures: TF_RUNTIME_OPTIONAL_FEATURES,
      errorContract: TF_RUNTIME_ERROR_CONTRACT,
      semanticTopology: TF_RUNTIME_SEMANTIC_TOPOLOGY,
    };
  }

  function getOpenApiPayload() {
    return {
      ...TF_RUNTIME_OPENAPI,
      info: {
        ...TF_RUNTIME_OPENAPI.info,
        version: TF_API_VERSION,
      },
    };
  }

  function getMetricsPayload(tenantId) {
    const queueStats =
      typeof jobQueue.getStats === "function"
        ? jobQueue.getStats()
        : {
            queued: 0,
            running: 0,
            succeeded: 0,
            failed: 0,
            canceled: 0,
            retained: 0,
            maxRetained: JOB_MAX_RETAINED,
          };
    return {
      tenantId,
      timestamp: new Date().toISOString(),
      cache: cacheStats,
      jobLatencyMs: jobLatencyStats,
      queue: queueStats,
      memory: memorySnapshot(),
      stores: {
        documents: countTenantInStore(documentStore, tenantId),
        documentVersions: countTenantInStore(documentVersionStore, tenantId),
        builds: countTenantInStore(buildStore, tenantId),
        assets: countTenantInStore(assetStore, tenantId),
        artifacts: countTenantInStore(artifactStore, tenantId),
        buildSessions: countTenantInStore(buildSessionStore, tenantId),
        buildCache: buildCache.size,
        meshCache: meshCache.size,
        exportCache: exportCache.size,
        pendingJobs: countPendingJobsForTenant(tenantId),
      },
    };
  }

  const jobRuntime = createJobRuntime({
    jobQueue,
    jobOwners,
    jobLatencyStats,
    pruneJobOwners,
    assertTenantQuota,
    countPendingJobsForTenant,
    maxPendingJobsPerTenant: MAX_PENDING_JOBS_PER_TENANT,
    recordLatency,
    makeHttpError: (status, code, message, details) =>
      new HttpError(status, code, message, details),
    handleBuild,
    handleMesh,
    handleAssemblySolve,
    handleExport,
  });

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      text(res, 400, "Missing URL");
      return;
    }

    if (req.method === "OPTIONS") {
      sendNoContent(res);
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const tenantId = getTenantId(req, url, {
      tenantHeader: TENANT_HEADER,
      defaultTenant: DEFAULT_TENANT,
      makeError: (status, code, message) => new HttpError(status, code, message),
    });
    documentStoreService.pruneExpiredBuildSessions();
    pruneBuildStore();
    pruneAssetStores();
    pruneJobOwners();

    try {
      if (
        await tryHandleMetadataRoute({
          req,
          res,
          pathname,
          tenantId,
          json,
          getCapabilitiesPayload,
          runtimeHealthPayload,
          getOpenApiPayload,
        })
      ) {
        return;
      }

      if (
        await tryHandleDocumentRoute({
          req,
          res,
          pathname,
          tenantId,
          json,
          sendNoContent,
          readJson,
          storeDocument: documentStoreService.storeDocument,
          documentStore,
          documentVersionStore,
          tenantScopedKey,
          createBuildSession: documentStoreService.createBuildSession,
          dropBuildSession: documentStoreService.dropBuildSession,
          makeHttpError: (status, code, message, details) =>
            new HttpError(status, code, message, details),
        })
      ) {
        return;
      }

      if (
        await tryHandleActionRoute({
          req,
          res,
          pathname,
          tenantId,
          json,
          readJson,
          enqueueBuild: jobRuntime.enqueueBuild,
          enqueueAssemblySolve: jobRuntime.enqueueAssemblySolve,
          handleMeasure,
          enqueueMesh: jobRuntime.enqueueMesh,
          enqueueExport: jobRuntime.enqueueExport,
          toJobAccepted: jobRuntime.toJobAccepted,
        })
      ) {
        return;
      }

      if (
        await tryHandleResourceRoute({
          req,
          res,
          url,
          pathname,
          tenantId,
          json,
          text,
          bytes,
          streamMeshAssetChunks,
          writeSse,
          getJob: (jobId) => jobQueue.get(jobId),
          cancelJob: (jobId) => jobQueue.cancel(jobId),
          assertTenantJobAccess: jobRuntime.assertTenantJobAccess,
          toJobRecordEnvelope: jobRuntime.toJobRecordEnvelope,
          getAsset: (id) => assetStore.get(id),
          getArtifact: (id) => artifactStore.get(id),
          getMetricsPayload,
        })
      ) {
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
