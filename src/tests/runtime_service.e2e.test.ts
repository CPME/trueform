import assert from "node:assert/strict";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import net from "node:net";
import type { Readable } from "node:stream";
import { dsl } from "../dsl.js";
import { runTests } from "./occt_test_utils.js";

type RuntimeServer = {
  baseUrl: string;
  logs: string[];
  child: ChildProcessByStdio<null, Readable, Readable>;
  stop: () => Promise<void>;
};

type JobRecord = {
  id: string;
  jobId: string;
  state: string;
  result: any;
  error: { code?: string; message?: string; details?: Record<string, unknown> } | null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to allocate free port"));
        return;
      }
      server.close((err) => {
        if (err) reject(err);
        else resolve(address.port);
      });
    });
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${text ? `: ${text}` : ""}`);
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function fetchJsonWithStatus<T>(
  url: string,
  expectedStatus: number,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (res.status !== expectedStatus) {
    throw new Error(
      `Expected HTTP ${expectedStatus} for ${url}, got ${res.status}${text ? `: ${text}` : ""}`
    );
  }
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function fetchChunkedMesh(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}${text ? `: ${text}` : ""}`);
  }
  const out: Record<string, unknown> = {};
  let meta: Record<string, unknown> | null = null;
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const line of lines) {
    const event = JSON.parse(line) as {
      type?: string;
      payload?: Record<string, unknown>;
      key?: string;
      data?: unknown[];
    };
    if (event.type === "meta") {
      meta = event.payload ?? {};
      continue;
    }
    if (event.type === "arrayChunk" && typeof event.key === "string" && Array.isArray(event.data)) {
      const existing = (out[event.key] as unknown[] | undefined) ?? [];
      out[event.key] = existing.concat(event.data);
      continue;
    }
    if (event.type === "selectionChunk" && Array.isArray(event.data)) {
      const existingSelections = (out.selections as unknown[] | undefined) ?? [];
      out.selections = existingSelections.concat(event.data);
      continue;
    }
    if (event.type === "done") break;
  }
  return meta ? { ...meta, ...out } : out;
}

function triangleCount(mesh: { indices?: number[]; positions?: number[] }): number {
  if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
    return Math.floor(mesh.indices.length / 3);
  }
  if (Array.isArray(mesh.positions) && mesh.positions.length >= 9) {
    return Math.floor(mesh.positions.length / 9);
  }
  return 0;
}

function ownerKeysForMeshSelections(
  mesh: { selections?: Array<{ meta?: Record<string, unknown> }> }
): Set<string> {
  const out = new Set<string>();
  for (const selection of mesh.selections ?? []) {
    const ownerKey = selection?.meta?.ownerKey;
    if (typeof ownerKey === "string" && ownerKey.length > 0) {
      out.add(ownerKey);
    }
  }
  return out;
}

function findMeshSelection(
  mesh: { selections?: Array<{ id?: string; kind?: string; meta?: Record<string, unknown> }> },
  predicate: (selection: { id?: string; kind?: string; meta?: Record<string, unknown> }) => boolean
): { id?: string; kind?: string; meta?: Record<string, unknown> } | null {
  for (const selection of mesh.selections ?? []) {
    if (selection && predicate(selection)) return selection;
  }
  return null;
}

async function startRuntimeServer(): Promise<RuntimeServer> {
  return startRuntimeServerWithEnv();
}

async function startRuntimeServerWithEnv(
  envOverrides: Record<string, string> = {}
): Promise<RuntimeServer> {
  const port = await getFreePort();
  const logs: string[] = [];
  const child = spawn(process.execPath, ["tools/runtime/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TF_RUNTIME_PORT: String(port),
      TF_RUNTIME_JOB_TIMEOUT_MS: "15000",
      ...envOverrides,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  const started = await waitForServer(baseUrl, child, logs);
  if (!started) {
    child.kill("SIGTERM");
    throw new Error(`Runtime server failed to start. Logs:\n${logs.join("")}`);
  }

  return {
    baseUrl,
    logs,
    child,
    stop: async () => {
      if (child.killed || child.exitCode !== null) return;
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 4000);
      });
    },
  };
}

async function waitForServer(
  baseUrl: string,
  child: ChildProcessByStdio<null, Readable, Readable>,
  logs: string[]
): Promise<boolean> {
  for (let i = 0; i < 240; i += 1) {
    if (child.exitCode !== null) {
      logs.push(`server exited with code ${String(child.exitCode)}\n`);
      return false;
    }
    try {
      await fetchJson(`${baseUrl}/v1/capabilities`);
      return true;
    } catch {
      await sleep(100);
    }
  }
  return false;
}

async function pollJob(
  baseUrl: string,
  jobId: string,
  timeoutMs = 30000,
  tenantId?: string
): Promise<JobRecord> {
  const start = Date.now();
  const headers: Record<string, string> = {};
  if (tenantId) headers["x-tf-tenant-id"] = tenantId;
  while (Date.now() - start <= timeoutMs) {
    const job = await fetchJson<JobRecord>(`${baseUrl}/v1/jobs/${jobId}`, { headers });
    if (["succeeded", "failed", "canceled"].includes(job.state)) return job;
    await sleep(50);
  }
  throw new Error(`Polling timed out for job ${jobId}`);
}

type StreamEvent = {
  event: string;
  state: string;
};

async function collectJobStreamEvents(
  baseUrl: string,
  jobId: string,
  tenantId?: string
): Promise<StreamEvent[]> {
  const headers: Record<string, string> = {};
  if (tenantId) headers["x-tf-tenant-id"] = tenantId;
  const res = await fetch(`${baseUrl}/v1/jobs/${jobId}/stream`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Stream request failed (${res.status})${text ? `: ${text}` : ""}`
    );
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Missing stream reader");
  const decoder = new TextDecoder();
  let buffer = "";
  const events: StreamEvent[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const lines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          event = line.slice("event:".length).trim();
        }
        if (line.startsWith("data:")) {
          data += line.slice("data:".length).trim();
        }
      }
      if (!data) continue;
      const parsed = JSON.parse(data) as { state?: string };
      events.push({ event, state: String(parsed.state ?? "") });
      if (event === "end") return events;
    }
  }
  return events;
}

async function waitUntilStateSeen(
  baseUrl: string,
  jobId: string,
  target: string,
  timeoutMs = 20000,
  tenantId?: string
): Promise<boolean> {
  const start = Date.now();
  const headers: Record<string, string> = {};
  if (tenantId) headers["x-tf-tenant-id"] = tenantId;
  while (Date.now() - start <= timeoutMs) {
    const job = await fetchJson<JobRecord>(`${baseUrl}/v1/jobs/${jobId}`, { headers });
    if (job.state === target) return true;
    if (["succeeded", "failed", "canceled"].includes(job.state)) return false;
    await sleep(20);
  }
  return false;
}

function makeRuntimeDoc() {
  const part = dsl.part("runtime-cylinder", [
    dsl.sketch2d("sketch-base", [{ name: "profile:base", profile: dsl.profileCircle(28) }]),
    dsl.extrude(
      "cylinder",
      dsl.profileRef("profile:base"),
      dsl.exprParam("height"),
      "body:main",
      ["sketch-base"]
    ),
  ], {
    params: [dsl.paramLength("height", dsl.exprLiteral(90))],
  });
  const document = dsl.document("runtime-service-doc", [part], dsl.context());
  return { part, document };
}

function makeRuntimeMultiOutputDoc() {
  const part = dsl.part("runtime-multi-output", [
    dsl.extrude("base-main", dsl.profileCircle(18), 40, "body:main"),
    dsl.extrude("boss-secondary", dsl.profileRect(12, 8, [60, 0, 0]), 14, "body:secondary"),
  ]);
  const document = dsl.document("runtime-multi-output-doc", [part], dsl.context());
  return { part, document };
}

const tests = [
  {
    name: "runtime service: documents, lifecycle, cache keys, and mesh profile contract",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const observedStates = new Set<string>();
        const capabilities = await fetchJson<{
          apiVersion?: string;
          featureKinds?: string[];
          featureStages?: Record<string, { stage?: string; notes?: string }>;
          quotas?: {
            maxBuildSessionsPerTenant?: number;
            maxBuildsPerSession?: number;
            buildSessionTtlMs?: number;
            maxDocVersionsPerKey?: number;
          };
          optionalFeatures?: {
            partialBuild?: {
              endpoint?: boolean;
              execution?: string;
              requirements?: { sessionScoped?: boolean; changedFeatureIds?: boolean };
            };
            buildSessions?: { enabled?: boolean };
            assembly?: { solve?: boolean };
            measure?: { endpoint?: boolean };
            bom?: { derive?: boolean };
            release?: { preflight?: boolean };
            featureStaging?: { registry?: boolean };
          };
        }>(`${runtime.baseUrl}/v1/capabilities`);
        assert.equal(capabilities.apiVersion, "1.2");
        assert.equal(capabilities.optionalFeatures?.partialBuild?.endpoint, true);
        assert.equal(
          capabilities.optionalFeatures?.partialBuild?.execution,
          "incremental"
        );
        assert.equal(
          capabilities.optionalFeatures?.partialBuild?.requirements?.sessionScoped,
          true
        );
        assert.equal(
          capabilities.optionalFeatures?.partialBuild?.requirements?.changedFeatureIds,
          true
        );
        assert.equal(capabilities.optionalFeatures?.buildSessions?.enabled, true);
        assert.equal(capabilities.optionalFeatures?.assembly?.solve, true);
        assert.equal(capabilities.optionalFeatures?.measure?.endpoint, true);
        assert.equal((capabilities.quotas?.maxBuildSessionsPerTenant ?? 0) > 0, true);
        assert.equal((capabilities.quotas?.maxBuildsPerSession ?? 0) > 0, true);
        assert.equal((capabilities.quotas?.buildSessionTtlMs ?? 0) > 0, true);
        assert.equal((capabilities.quotas?.maxDocVersionsPerKey ?? 0) > 0, true);
        assert.equal(capabilities.optionalFeatures?.bom?.derive, false);
        assert.equal(capabilities.optionalFeatures?.release?.preflight, false);
        assert.equal(capabilities.optionalFeatures?.featureStaging?.registry, true);
        assert.equal((capabilities.featureKinds?.length ?? 0) > 0, true);
        for (const featureKind of capabilities.featureKinds ?? []) {
          const stage = capabilities.featureStages?.[featureKind]?.stage;
          assert.equal(
            stage === "stable" || stage === "staging",
            true,
            `Missing explicit stage for ${featureKind}`
          );
        }
        assert.equal(capabilities.featureStages?.["feature.thread"]?.stage, "stable");
        assert.equal(capabilities.featureStages?.["feature.surface"]?.stage, "stable");
        assert.equal(capabilities.featureStages?.["feature.extrude:mode.surface"]?.stage, "staging");
        const health = await fetchJson<{
          status?: string;
          dependencies?: { opencascade?: { ready?: boolean } };
        }>(`${runtime.baseUrl}/v1/health`);
        assert.equal(health.status, "ok");
        assert.equal(health.dependencies?.opencascade?.ready, true);
        const openapi = await fetchJson<{
          openapi?: string;
          info?: { version?: string };
          paths?: Record<string, unknown>;
        }>(`${runtime.baseUrl}/v1/openapi.json`);
        assert.equal(openapi.openapi, "3.1.0");
        assert.equal(openapi.info?.version, "1.2");
        assert.equal(typeof openapi.paths?.["/v1/build/partial"], "object");
        assert.equal(typeof openapi.paths?.["/v1/build-sessions"], "object");
        assert.equal(typeof openapi.paths?.["/v1/assembly/solve"], "object");
        assert.equal(typeof openapi.paths?.["/v1/measure"], "object");
        assert.equal(typeof openapi.paths?.["/v1/health"], "object");
        assert.equal(typeof openapi.paths?.["/v1/documents/{docId}/versions"], "object");
        assert.equal(typeof openapi.paths?.["/v1/assets/mesh/{assetId}/chunks"], "object");

        const { part, document } = makeRuntimeDoc();

        const docCreate = await fetchJsonWithStatus<{
          docId: string;
          docKey: string;
          version: number;
          schemaVersion: number;
          inserted: boolean;
          contentHash: string;
        }>(`${runtime.baseUrl}/v1/documents`, 201, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document, docKey: "runtime-doc" }),
        });
        assert.equal(typeof docCreate.docId, "string");
        assert.equal(docCreate.docKey, "runtime-doc");
        assert.equal(docCreate.version, 1);
        assert.equal(docCreate.schemaVersion, 1);
        assert.equal(docCreate.inserted, true);
        assert.equal(docCreate.docId, docCreate.contentHash);

        const docCreateAgain = await fetchJsonWithStatus<{
          docId: string;
          docKey: string;
          version: number;
          inserted: boolean;
        }>(`${runtime.baseUrl}/v1/documents`, 200, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document, docKey: "runtime-doc" }),
        });
        assert.equal(docCreateAgain.docId, docCreate.docId);
        assert.equal(docCreateAgain.docKey, "runtime-doc");
        assert.equal(docCreateAgain.version, 1);
        assert.equal(docCreateAgain.inserted, false);

        const versionedDocument = JSON.parse(JSON.stringify(document));
        if (Array.isArray(versionedDocument?.parts)) {
          const targetPart = versionedDocument.parts.find((entry: any) => entry?.id === "runtime-cylinder");
          if (targetPart && Array.isArray(targetPart.params) && targetPart.params[0]) {
            targetPart.params[0].default = { kind: "expr.literal", value: 96 };
          }
        }
        const docCreateV2 = await fetchJsonWithStatus<{
          docId: string;
          docKey: string;
          version: number;
          inserted: boolean;
        }>(`${runtime.baseUrl}/v1/documents`, 201, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document: versionedDocument, docKey: "runtime-doc" }),
        });
        assert.equal(docCreateV2.inserted, true);
        assert.equal(docCreateV2.docKey, "runtime-doc");
        assert.equal(docCreateV2.version, 2);
        assert.notEqual(docCreateV2.docId, docCreate.docId);

        const storedDoc = await fetchJson<{
          docId: string;
          docKey: string;
          version: number;
          document: { id: string };
        }>(`${runtime.baseUrl}/v1/documents/${docCreate.docId}`);
        assert.equal(storedDoc.docId, docCreate.docId);
        assert.equal(storedDoc.docKey, "runtime-doc");
        assert.equal(storedDoc.version, 1);
        assert.equal(storedDoc.document.id, document.id);

        const storedDocVersions = await fetchJson<{
          docKey: string;
          version: number;
          versions: Array<{ version: number; docId: string }>;
        }>(`${runtime.baseUrl}/v1/documents/${docCreate.docId}/versions`);
        assert.equal(storedDocVersions.docKey, "runtime-doc");
        assert.equal(storedDocVersions.version, 1);
        assert.deepEqual(
          storedDocVersions.versions.map((entry) => entry.version),
          [1, 2]
        );

        const buildPayload = {
          docId: docCreate.docId,
          partId: "runtime-cylinder",
          options: { meshProfile: "interactive" },
        };

        const buildSubmit1 = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload),
          }
        );
        assert.equal(buildSubmit1.id, buildSubmit1.jobId);
        observedStates.add(buildSubmit1.state);

        const buildJob1 = await pollJob(runtime.baseUrl, buildSubmit1.jobId);
        observedStates.add(buildJob1.state);
        assert.equal(buildJob1.id, buildJob1.jobId);
        assert.equal(buildJob1.state, "succeeded");
        assert.equal(buildJob1.result?.docId, docCreate.docId);
        assert.equal(buildJob1.result?.cache?.partBuild?.hit, false);
        assert.equal(Array.isArray(buildJob1.result?.validation?.dimensions), true);
        assert.equal(Array.isArray(buildJob1.result?.validation?.assertions), true);
        const firstFaceId = String(buildJob1.result?.selections?.faces?.[0] ?? "");
        assert.ok(firstFaceId.length > 0, "Missing face selection id for measure endpoint");
        const measureResult = await fetchJsonWithStatus<{
          target?: string;
          metrics?: Array<{ kind?: string; value?: number; unit?: string; label?: string }>;
        }>(`${runtime.baseUrl}/v1/measure`, 200, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildId: buildJob1.result?.buildId,
            target: firstFaceId,
          }),
        });
        assert.equal(measureResult.target, firstFaceId);
        assert.equal(Array.isArray(measureResult.metrics), true);
        assert.equal((measureResult.metrics?.length ?? 0) > 0, true);
        assert.equal(
          (measureResult.metrics ?? []).some(
            (metric) =>
              typeof metric.value === "number" &&
              Number.isFinite(metric.value) &&
              metric.value > 0
          ),
          true
        );
        const partBuildKey1 = String(buildJob1.result?.keys?.partBuildKey ?? "");
        assert.ok(partBuildKey1.length > 0, "Missing partBuildKey in first build");

        const buildSubmit2 = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload),
          }
        );
        assert.equal(buildSubmit2.id, buildSubmit2.jobId);
        observedStates.add(buildSubmit2.state);

        const buildJob2 = await pollJob(runtime.baseUrl, buildSubmit2.jobId);
        observedStates.add(buildJob2.state);
        assert.equal(buildJob2.state, "succeeded");
        assert.equal(buildJob2.result?.cache?.partBuild?.hit, true);
        assert.equal(String(buildJob2.result?.keys?.partBuildKey ?? ""), partBuildKey1);
        assert.equal(buildJob2.id, buildJob2.jobId);

        const partialBuildSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/build/partial`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...buildPayload,
            partial: {
              changedFeatureIds: ["cylinder"],
              selectorHints: { "body:main": { kind: "solid" } },
            },
          }),
        });
        assert.equal(partialBuildSubmit.id, partialBuildSubmit.jobId);
        const partialBuildJob = await pollJob(runtime.baseUrl, partialBuildSubmit.jobId);
        observedStates.add(partialBuildJob.state);
        assert.equal(partialBuildJob.state, "succeeded");
        assert.equal(
          partialBuildJob.result?.diagnostics?.partialBuild?.buildMode,
          "incremental"
        );
        assert.deepEqual(
          partialBuildJob.result?.diagnostics?.partialBuild?.requestedChangedFeatureIds,
          ["cylinder"]
        );
        assert.deepEqual(
          partialBuildJob.result?.diagnostics?.partialBuild?.reusedFeatureIds,
          ["sketch-base", "cylinder"]
        );

        const buildSession = await fetchJsonWithStatus<{
          sessionId: string;
          createdAt: string;
          expiresAt: string;
        }>(`${runtime.baseUrl}/v1/build-sessions`, 201, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        assert.ok(buildSession.sessionId.length > 0, "missing build session id");

        const sessionBuildSubmit = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...buildPayload,
              sessionId: buildSession.sessionId,
            }),
          }
        );
        const sessionBuildJob = await pollJob(runtime.baseUrl, sessionBuildSubmit.jobId);
        assert.equal(sessionBuildJob.state, "succeeded");

        const sessionPartialSubmit = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/build/partial`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...buildPayload,
              sessionId: buildSession.sessionId,
              params: { height: 95 },
              partial: {
                changedFeatureIds: ["cylinder"],
              },
            }),
          }
        );
        const sessionPartialJob = await pollJob(runtime.baseUrl, sessionPartialSubmit.jobId);
        assert.equal(sessionPartialJob.state, "succeeded");
        assert.equal(
          sessionPartialJob.result?.diagnostics?.partialBuild?.buildMode,
          "incremental"
        );
        assert.deepEqual(
          sessionPartialJob.result?.diagnostics?.partialBuild?.reusedFeatureIds,
          ["sketch-base"]
        );
        assert.deepEqual(
          sessionPartialJob.result?.diagnostics?.partialBuild?.invalidatedFeatureIds,
          ["cylinder"]
        );

        await fetchJsonWithStatus<Record<string, unknown>>(
          `${runtime.baseUrl}/v1/build-sessions/${buildSession.sessionId}`,
          204,
          { method: "DELETE" }
        );

        const buildId = String(buildJob1.result?.buildId ?? "");
        assert.ok(buildId.length > 0, "Missing buildId from build result");

        const meshInteractiveSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "interactive" }),
          }
        );
        assert.equal(meshInteractiveSubmit.id, meshInteractiveSubmit.jobId);
        observedStates.add(meshInteractiveSubmit.state);

        const meshPreviewSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "preview" }),
          }
        );
        assert.equal(meshPreviewSubmit.id, meshPreviewSubmit.jobId);
        observedStates.add(meshPreviewSubmit.state);

        const meshExportSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "export" }),
          }
        );
        assert.equal(meshExportSubmit.id, meshExportSubmit.jobId);
        observedStates.add(meshExportSubmit.state);

        const meshInteractiveJob = await pollJob(runtime.baseUrl, meshInteractiveSubmit.jobId);
        const meshPreviewJob = await pollJob(runtime.baseUrl, meshPreviewSubmit.jobId);
        const meshExportJob = await pollJob(runtime.baseUrl, meshExportSubmit.jobId);
        observedStates.add(meshInteractiveJob.state);
        observedStates.add(meshPreviewJob.state);
        observedStates.add(meshExportJob.state);

        assert.equal(meshInteractiveJob.state, "succeeded");
        assert.equal(meshPreviewJob.state, "succeeded");
        assert.equal(meshExportJob.state, "succeeded");

        const meshInteractiveAssetUrl = String(
          meshInteractiveJob.result?.mesh?.asset?.url ?? ""
        );
        const meshPreviewAssetUrl = String(meshPreviewJob.result?.mesh?.asset?.url ?? "");
        const meshExportAssetUrl = String(meshExportJob.result?.mesh?.asset?.url ?? "");
        assert.ok(meshInteractiveAssetUrl.length > 0, "Missing interactive mesh URL");
        assert.ok(meshPreviewAssetUrl.length > 0, "Missing preview mesh URL");
        assert.ok(meshExportAssetUrl.length > 0, "Missing export mesh URL");

        const interactiveMesh = await fetchJson<{
          indices?: number[];
          positions?: number[];
          edgePositions?: number[];
          edgeIndices?: number[];
        }>(
          `${runtime.baseUrl}${meshInteractiveAssetUrl}`
        );
        const previewMesh = await fetchJson<{ indices?: number[]; positions?: number[] }>(
          `${runtime.baseUrl}${meshPreviewAssetUrl}`
        );
        const exportMesh = await fetchJson<{ indices?: number[]; positions?: number[] }>(
          `${runtime.baseUrl}${meshExportAssetUrl}`
        );
        const chunkedInteractiveMesh = await fetchChunkedMesh(
          `${runtime.baseUrl}${meshInteractiveAssetUrl}/chunks`
        );

        const triInteractive = triangleCount(interactiveMesh);
        const triPreview = triangleCount(previewMesh);
        const triExport = triangleCount(exportMesh);
        assert.ok(triInteractive > 0, "Interactive mesh must contain triangles");
        assert.ok(triInteractive <= triPreview, "Expected interactive <= preview triangle count");
        assert.ok(triPreview <= triExport, "Expected preview <= export triangle count");
        assert.ok(triInteractive < triExport, "Expected interactive < export triangle count");
        const interactiveEdgeSegments = Math.floor(
          (interactiveMesh.edgePositions?.length ?? 0) / 6
        );
        assert.equal(
          interactiveMesh.edgeIndices?.length ?? 0,
          interactiveEdgeSegments,
          "interactive mesh should provide one edge index per edge segment"
        );
        assert.equal(
          Array.isArray(chunkedInteractiveMesh.positions),
          true,
          "chunked mesh stream should include positions array"
        );
        const chunkedPositions = Array.isArray(chunkedInteractiveMesh.positions)
          ? (chunkedInteractiveMesh.positions as number[])
          : [];
        const chunkedIndices = Array.isArray(chunkedInteractiveMesh.indices)
          ? (chunkedInteractiveMesh.indices as number[])
          : [];
        assert.equal(
          chunkedPositions.length,
          interactiveMesh.positions?.length ?? 0
        );
        assert.equal(
          chunkedIndices.length,
          interactiveMesh.indices?.length ?? 0
        );

        const previewAssetId = String(meshPreviewJob.result?.mesh?.asset?.id ?? "");
        assert.ok(previewAssetId.length > 0, "Missing preview asset id");
        const previewArtifact = await fetchJson<{ meshKey?: string; partBuildKey?: string }>(
          `${runtime.baseUrl}/v1/artifacts/${previewAssetId}`
        );
        assert.equal(
          String(previewArtifact.meshKey ?? ""),
          String(meshPreviewJob.result?.keys?.meshKey ?? "")
        );
        assert.equal(String(previewArtifact.partBuildKey ?? ""), partBuildKey1);

        const { part: multiOutputPart, document: multiOutputDoc } = makeRuntimeMultiOutputDoc();
        const multiBuildSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/build`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            document: multiOutputDoc,
            partId: multiOutputPart.id,
            options: { meshProfile: "preview", prefetchPreview: false },
          }),
        });
        assert.equal(multiBuildSubmit.id, multiBuildSubmit.jobId);
        const multiBuildJob = await pollJob(runtime.baseUrl, multiBuildSubmit.jobId);
        observedStates.add(multiBuildJob.state);
        assert.equal(multiBuildJob.state, "succeeded");
        const multiBuildId = String(multiBuildJob.result?.buildId ?? "");
        assert.ok(multiBuildId.length > 0, "Missing multi-output build id");

        const multiMeshMainSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/jobs/mesh`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildId: multiBuildId,
            target: "body:main",
            profile: "preview",
          }),
        });
        const multiMeshSecondarySubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/jobs/mesh`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildId: multiBuildId,
            target: "body:secondary",
            profile: "preview",
          }),
        });
        const multiMeshMainJob = await pollJob(runtime.baseUrl, multiMeshMainSubmit.jobId);
        const multiMeshSecondaryJob = await pollJob(
          runtime.baseUrl,
          multiMeshSecondarySubmit.jobId
        );
        observedStates.add(multiMeshMainJob.state);
        observedStates.add(multiMeshSecondaryJob.state);
        assert.equal(multiMeshMainJob.state, "succeeded");
        assert.equal(multiMeshSecondaryJob.state, "succeeded");
        const multiMeshMainKey = String(multiMeshMainJob.result?.keys?.meshKey ?? "");
        const multiMeshSecondaryKey = String(multiMeshSecondaryJob.result?.keys?.meshKey ?? "");
        assert.ok(
          multiMeshMainKey.length > 0 && multiMeshSecondaryKey.length > 0,
          `expected non-empty mesh keys (main='${multiMeshMainKey}', secondary='${multiMeshSecondaryKey}')`
        );
        assert.notEqual(
          multiMeshSecondaryKey,
          multiMeshMainKey,
          `mesh key must include target output (main='${multiMeshMainKey}', secondary='${multiMeshSecondaryKey}')`
        );
        assert.equal(
          String(multiMeshSecondaryJob.result?.mesh?.asset?.url ?? "") !==
            String(multiMeshMainJob.result?.mesh?.asset?.url ?? ""),
          true,
          "mesh asset URL should differ across targets"
        );
        const multiMeshMainAssetUrl = String(multiMeshMainJob.result?.mesh?.asset?.url ?? "");
        const multiMeshSecondaryAssetUrl = String(
          multiMeshSecondaryJob.result?.mesh?.asset?.url ?? ""
        );
        assert.ok(multiMeshMainAssetUrl.length > 0, "missing multi-output main mesh asset url");
        assert.ok(
          multiMeshSecondaryAssetUrl.length > 0,
          "missing multi-output secondary mesh asset url"
        );
        const multiMainMesh = await fetchJson<{
          selections?: Array<{ meta?: Record<string, unknown> }>;
        }>(`${runtime.baseUrl}${multiMeshMainAssetUrl}`);
        const multiSecondaryMesh = await fetchJson<{
          selections?: Array<{ meta?: Record<string, unknown> }>;
        }>(`${runtime.baseUrl}${multiMeshSecondaryAssetUrl}`);
        const mainOwnerKeys = ownerKeysForMeshSelections(multiMainMesh);
        const secondaryOwnerKeys = ownerKeysForMeshSelections(multiSecondaryMesh);
        assert.equal(
          mainOwnerKeys.size,
          1,
          `expected scoped mesh selections for body:main, got ${Array.from(mainOwnerKeys).join(",")}`
        );
        assert.equal(mainOwnerKeys.has("body:main"), true);
        assert.equal(
          secondaryOwnerKeys.size,
          1,
          `expected scoped mesh selections for body:secondary, got ${Array.from(secondaryOwnerKeys).join(",")}`
        );
        assert.equal(secondaryOwnerKeys.has("body:secondary"), true);

        const multiExportMainSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/export/step`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildId: multiBuildId,
            target: "body:main",
            options: { schema: "AP242" },
          }),
        });
        const multiExportSecondarySubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/export/step`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            buildId: multiBuildId,
            target: "body:secondary",
            options: { schema: "AP242" },
          }),
        });
        const multiExportMainJob = await pollJob(runtime.baseUrl, multiExportMainSubmit.jobId);
        const multiExportSecondaryJob = await pollJob(
          runtime.baseUrl,
          multiExportSecondarySubmit.jobId
        );
        observedStates.add(multiExportMainJob.state);
        observedStates.add(multiExportSecondaryJob.state);
        assert.equal(multiExportMainJob.state, "succeeded");
        assert.equal(multiExportSecondaryJob.state, "succeeded");
        const multiExportMainKey = String(multiExportMainJob.result?.keys?.exportKey ?? "");
        const multiExportSecondaryKey = String(
          multiExportSecondaryJob.result?.keys?.exportKey ?? ""
        );
        assert.ok(
          multiExportMainKey.length > 0 && multiExportSecondaryKey.length > 0,
          `expected non-empty export keys (main='${multiExportMainKey}', secondary='${multiExportSecondaryKey}')`
        );
        assert.notEqual(
          multiExportSecondaryKey,
          multiExportMainKey,
          `export key must include target output (main='${multiExportMainKey}', secondary='${multiExportSecondaryKey}')`
        );
        assert.equal(
          String(multiExportSecondaryJob.result?.asset?.url ?? "") !==
            String(multiExportMainJob.result?.asset?.url ?? ""),
          true,
          "export asset URL should differ across targets"
        );

        const exportSubmit1 = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/export/step`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, options: { schema: "AP242" } }),
          }
        );
        assert.equal(exportSubmit1.id, exportSubmit1.jobId);
        observedStates.add(exportSubmit1.state);

        const exportJob1 = await pollJob(runtime.baseUrl, exportSubmit1.jobId);
        observedStates.add(exportJob1.state);
        assert.equal(exportJob1.state, "succeeded");
        assert.equal(exportJob1.result?.cache?.export?.hit, false);

        const exportSubmit2 = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/jobs/export/step`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, options: { schema: "AP242" } }),
          }
        );
        assert.equal(exportSubmit2.id, exportSubmit2.jobId);
        observedStates.add(exportSubmit2.state);

        const exportJob2 = await pollJob(runtime.baseUrl, exportSubmit2.jobId);
        observedStates.add(exportJob2.state);
        assert.equal(exportJob2.state, "succeeded");
        assert.equal(exportJob2.result?.cache?.export?.hit, true);
        assert.equal(
          String(exportJob1.result?.asset?.url ?? ""),
          String(exportJob2.result?.asset?.url ?? "")
        );

        const exportAssetId = String(exportJob1.result?.asset?.id ?? "");
        const exportArtifact = await fetchJson<{ exportKey?: string; partBuildKey?: string }>(
          `${runtime.baseUrl}/v1/artifacts/${exportAssetId}`
        );
        assert.equal(
          String(exportArtifact.exportKey ?? ""),
          String(exportJob1.result?.keys?.exportKey ?? "")
        );
        assert.equal(String(exportArtifact.partBuildKey ?? ""), partBuildKey1);

        const timeoutSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part,
              timeoutMs: 1,
              options: { meshProfile: "export", simulateDelayMs: 50 },
            }),
          }
        );
        assert.equal(timeoutSubmit.id, timeoutSubmit.jobId);
        observedStates.add(timeoutSubmit.state);

        const timeoutJob = await pollJob(runtime.baseUrl, timeoutSubmit.jobId);
        observedStates.add(timeoutJob.state);
        assert.equal(timeoutJob.state, "failed");
        assert.equal(timeoutJob.error?.code, "job_timeout");

        const longMeshBody = {
          buildId,
          profile: "export",
          options: {
            linearDeflection: 0.002,
            angularDeflection: 0.02,
            relative: false,
            includeEdges: true,
            edgeSegmentLength: 0.05,
            edgeMaxSegments: 10000,
            simulateDelayMs: 200,
          },
        };

        const longMeshSubmit1 = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(longMeshBody),
          }
        );
        assert.equal(longMeshSubmit1.id, longMeshSubmit1.jobId);
        observedStates.add(longMeshSubmit1.state);

        const longMeshSubmit2 = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(longMeshBody),
          }
        );
        assert.equal(longMeshSubmit2.id, longMeshSubmit2.jobId);
        observedStates.add(longMeshSubmit2.state);

        const sawRunning =
          longMeshSubmit1.state === "running" ||
          (await waitUntilStateSeen(runtime.baseUrl, longMeshSubmit1.jobId, "running", 20000));
        assert.equal(sawRunning, true, "Expected to observe a running job state");
        observedStates.add("running");

        const cancelResponse = await fetchJsonWithStatus<{ state?: string }>(
          `${runtime.baseUrl}/v1/jobs/${longMeshSubmit2.jobId}`,
          200,
          { method: "DELETE" }
        );
        if (cancelResponse.state) observedStates.add(cancelResponse.state);

        const canceledJob = await pollJob(runtime.baseUrl, longMeshSubmit2.jobId);
        observedStates.add(canceledJob.state);
        assert.equal(canceledJob.state, "canceled");

        const longMeshJob1 = await pollJob(runtime.baseUrl, longMeshSubmit1.jobId);
        observedStates.add(longMeshJob1.state);
        assert.equal(longMeshJob1.state, "succeeded");

        assert.ok(observedStates.has("queued"), "Expected queued state coverage");
        assert.ok(observedStates.has("running"), "Expected running state coverage");
        assert.ok(observedStates.has("succeeded"), "Expected succeeded state coverage");
        assert.ok(observedStates.has("failed"), "Expected failed state coverage");
        assert.ok(observedStates.has("canceled"), "Expected canceled state coverage");

        const metrics = await fetchJson<{
          cache?: {
            partBuild?: { hit?: number; miss?: number };
            mesh?: { hit?: number; miss?: number };
            export?: { hit?: number; miss?: number };
          };
          jobLatencyMs?: {
            build?: { count?: number; succeeded?: number; failed?: number; avgMs?: number };
            mesh?: { count?: number; succeeded?: number; avgMs?: number };
            exportStep?: { count?: number; succeeded?: number; avgMs?: number };
          };
          queue?: { failed?: number };
          memory?: { rssBytes?: number; heapUsedBytes?: number };
        }>(`${runtime.baseUrl}/v1/metrics`);
        assert.equal((metrics.cache?.partBuild?.hit ?? 0) >= 1, true);
        assert.equal((metrics.cache?.partBuild?.miss ?? 0) >= 1, true);
        assert.equal((metrics.cache?.mesh?.hit ?? 0) >= 1, true);
        assert.equal((metrics.cache?.export?.hit ?? 0) >= 1, true);
        assert.equal((metrics.jobLatencyMs?.build?.count ?? 0) >= 1, true);
        assert.equal((metrics.jobLatencyMs?.build?.succeeded ?? 0) >= 1, true);
        assert.equal((metrics.queue?.failed ?? 0) >= 1, true);
        assert.equal((metrics.jobLatencyMs?.mesh?.count ?? 0) >= 1, true);
        assert.equal((metrics.jobLatencyMs?.exportStep?.count ?? 0) >= 1, true);
        assert.equal((metrics.jobLatencyMs?.build?.avgMs ?? 0) > 0, true);
        assert.equal((metrics.memory?.rssBytes ?? 0) > 0, true);
        assert.equal((metrics.memory?.heapUsedBytes ?? 0) > 0, true);
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: assembly solve endpoint returns solved transforms",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const plate = dsl.part(
          "asm-plate",
          [dsl.extrude("plate-base", dsl.profileRect(20, 20), 4, "body:main")],
          {
            connectors: [
              dsl.mateConnector(
                "plate-top",
                dsl.selectorFace(
                  [dsl.predPlanar(), dsl.predCreatedBy("plate-base")],
                  [dsl.rankMaxZ()]
                ),
                { normal: "+Z", xAxis: "+X" }
              ),
            ],
          }
        );
        const peg = dsl.part(
          "asm-peg",
          [dsl.extrude("peg-body", dsl.profileCircle(4), 8, "body:main")],
          {
            connectors: [
              dsl.mateConnector(
                "peg-bottom",
                dsl.selectorFace(
                  [dsl.predPlanar(), dsl.predCreatedBy("peg-body")],
                  [dsl.rankMinZ()]
                ),
                { normal: "-Z", xAxis: "+X" }
              ),
            ],
          }
        );
        const assembly = dsl.assembly(
          "plate-peg",
          [
            dsl.assemblyInstance("plate-1", plate.id),
            dsl.assemblyInstance(
              "peg-1",
              peg.id,
              dsl.transform({ translation: [6, 0, 12] })
            ),
          ],
          {
            mates: [
              dsl.mateCoaxial(
                dsl.assemblyRef("plate-1", "plate-top"),
                dsl.assemblyRef("peg-1", "peg-bottom")
              ),
              dsl.matePlanar(
                dsl.assemblyRef("plate-1", "plate-top"),
                dsl.assemblyRef("peg-1", "peg-bottom"),
                0
              ),
            ],
          }
        );
        const document = dsl.document("asm-doc", [plate, peg], dsl.context(), [assembly]);

        const submit = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/assembly/solve`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ document, assemblyId: "plate-peg" }),
          }
        );
        const job = await pollJob(runtime.baseUrl, submit.jobId);
        if (job.state !== "succeeded") {
          throw new Error(
            `assembly solve failed: ${JSON.stringify({
              state: job.state,
              error: job.error,
              result: job.result,
            })}`
          );
        }
        assert.equal(job.state, "succeeded");
        assert.equal(job.result?.assemblyId, "plate-peg");
        assert.equal(job.result?.converged, true);
        assert.equal(Array.isArray(job.result?.instances), true);
        assert.equal(job.result?.instances?.length, 2);
        assert.equal(Array.isArray(job.result?.diagnostics?.mateResiduals), true);
        assert.equal(job.result?.diagnostics?.mateResiduals?.length, 2);
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: build sessions enforce quota, expiry, and tenant isolation",
    fn: async () => {
      const runtime = await startRuntimeServerWithEnv({
        TF_RUNTIME_BUILD_SESSION_TTL_MS: "30",
        TF_RUNTIME_MAX_BUILD_SESSIONS_PER_TENANT: "1",
        TF_RUNTIME_MAX_BUILDS_PER_SESSION: "1",
      });
      try {
        const { document } = makeRuntimeDoc();
        const tenantA = { "x-tf-tenant-id": "tenant-a" };
        const tenantB = { "x-tf-tenant-id": "tenant-b" };

        const docA = await fetchJsonWithStatus<{ docId: string }>(
          `${runtime.baseUrl}/v1/documents`,
          201,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({ document }),
          }
        );

        const sessionA = await fetchJsonWithStatus<{ sessionId: string }>(
          `${runtime.baseUrl}/v1/build-sessions`,
          201,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({}),
          }
        );
        assert.ok(sessionA.sessionId.length > 0, "missing tenant-a session id");

        const quotaError = await fetchJsonWithStatus<{ error?: { code?: string } }>(
          `${runtime.baseUrl}/v1/build-sessions`,
          429,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({}),
          }
        );
        assert.equal(quotaError.error?.code, "quota_exceeded");

        const sessionB = await fetchJsonWithStatus<{ sessionId: string }>(
          `${runtime.baseUrl}/v1/build-sessions`,
          201,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantB },
            body: JSON.stringify({}),
          }
        );
        assert.ok(sessionB.sessionId.length > 0, "missing tenant-b session id");

        const crossTenantDelete = await fetchJsonWithStatus<{ error?: { code?: string } }>(
          `${runtime.baseUrl}/v1/build-sessions/${sessionA.sessionId}`,
          404,
          {
            method: "DELETE",
            headers: tenantB,
          }
        );
        assert.equal(crossTenantDelete.error?.code, "build_session_not_found");

        const crossTenantSubmit = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({
              docId: docA.docId,
              partId: "runtime-cylinder",
              sessionId: sessionB.sessionId,
              partial: { changedFeatureIds: ["cylinder"] },
            }),
          }
        );
        const crossTenantBuild = await pollJob(
          runtime.baseUrl,
          crossTenantSubmit.jobId,
          30000,
          "tenant-a"
        );
        assert.equal(crossTenantBuild.state, "failed");
        assert.equal(crossTenantBuild.error?.code, "build_session_not_found");

        await sleep(80);

        const expiredSubmit = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({
              docId: docA.docId,
              partId: "runtime-cylinder",
              sessionId: sessionA.sessionId,
              partial: { changedFeatureIds: ["cylinder"] },
            }),
          }
        );
        const expiredBuild = await pollJob(runtime.baseUrl, expiredSubmit.jobId, 30000, "tenant-a");
        assert.equal(expiredBuild.state, "failed");
        assert.equal(expiredBuild.error?.code, "build_session_not_found");

        const deleteExpired = await fetchJsonWithStatus<{ error?: { code?: string } }>(
          `${runtime.baseUrl}/v1/build-sessions/${sessionA.sessionId}`,
          404,
          {
            method: "DELETE",
            headers: tenantA,
          }
        );
        assert.equal(deleteExpired.error?.code, "build_session_not_found");
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: tenant isolation, quotas, and stream updates",
    fn: async () => {
      const runtime = await startRuntimeServerWithEnv({
        TF_RUNTIME_MAX_PENDING_JOBS_PER_TENANT: "1",
      });
      try {
        const { document } = makeRuntimeDoc();
        const tenantA = { "x-tf-tenant-id": "tenant-a" };
        const tenantB = { "x-tf-tenant-id": "tenant-b" };

        const docA = await fetchJsonWithStatus<{ docId: string }>(
          `${runtime.baseUrl}/v1/documents`,
          201,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({ document }),
          }
        );

        const buildA = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify({
              docId: docA.docId,
              partId: "runtime-cylinder",
              options: { meshProfile: "interactive", simulateDelayMs: 120 },
            }),
          }
        );
        assert.equal(buildA.id, buildA.jobId);

        const streamEventsPromise = collectJobStreamEvents(
          runtime.baseUrl,
          buildA.jobId,
          "tenant-a"
        );
        const buildAResult = await pollJob(runtime.baseUrl, buildA.jobId, 30000, "tenant-a");
        assert.equal(buildAResult.state, "succeeded");
        const streamEvents = await streamEventsPromise;
        assert.ok(streamEvents.length >= 2, "expected multiple stream events");
        assert.equal(streamEvents[0]?.event, "job");
        assert.equal(streamEvents[streamEvents.length - 1]?.event, "end");
        assert.equal(streamEvents.some((evt) => evt.state === "running"), true);
        assert.equal(streamEvents.some((evt) => evt.state === "succeeded"), true);

        const jobFromOtherTenant = await fetchJsonWithStatus<{ error?: unknown }>(
          `${runtime.baseUrl}/v1/jobs/${buildA.jobId}`,
          404,
          { headers: tenantB }
        );
        assert.ok(jobFromOtherTenant.error !== undefined);

        const docFromOtherTenant = await fetchJsonWithStatus<{ error?: unknown }>(
          `${runtime.baseUrl}/v1/documents/${docA.docId}`,
          404,
          { headers: tenantB }
        );
        assert.ok(docFromOtherTenant.error !== undefined);

        const buildId = String(buildAResult.result?.buildId ?? "");
        assert.ok(buildId.length > 0, "missing build id");

        const longMeshBody = {
          buildId,
          profile: "export",
          options: {
            linearDeflection: 0.002,
            angularDeflection: 0.02,
            relative: false,
            includeEdges: true,
            edgeSegmentLength: 0.05,
            edgeMaxSegments: 10000,
            simulateDelayMs: 300,
          },
        };

        const meshJobA1 = await fetchJsonWithStatus<{ id: string; jobId: string }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json", ...tenantA },
            body: JSON.stringify(longMeshBody),
          }
        );
        assert.equal(meshJobA1.id, meshJobA1.jobId);
        assert.ok(meshJobA1.jobId.length > 0);

        const quotaError = await fetchJsonWithStatus<{
          error?: { code?: string };
        }>(`${runtime.baseUrl}/v1/jobs/mesh`, 429, {
          method: "POST",
          headers: { "content-type": "application/json", ...tenantA },
          body: JSON.stringify(longMeshBody),
        });
        assert.equal(quotaError.error?.code, "quota_exceeded");

        const meshJobA1Done = await pollJob(
          runtime.baseUrl,
          meshJobA1.jobId,
          30000,
          "tenant-a"
        );
        assert.equal(meshJobA1Done.state, "succeeded");
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: mirror/pattern reference failures return deterministic diagnostics",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const missingPatternPart = dsl.part("runtime-pattern-missing", [
          dsl.hole("hole-missing", dsl.selectorNamed("face:seed"), "+Z", 4, 10, {
            pattern: { kind: "pattern.linear", ref: "missing-pattern" },
          }),
        ]);
        const patternSubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: missingPatternPart,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const patternJob = await pollJob(runtime.baseUrl, patternSubmit.jobId);
        assert.equal(patternJob.state, "failed");
        assert.equal(patternJob.error?.code, "pattern_missing");
        assert.equal(patternJob.error?.details?.featureId, "hole-missing");
        assert.equal(patternJob.error?.details?.featureKind, "feature.hole");
        assert.equal(patternJob.error?.details?.referenceKind, "pattern");
        assert.equal(patternJob.error?.details?.referenceId, "missing-pattern");

        const missingMirrorSourcePart = dsl.part("runtime-mirror-missing", [
          dsl.extrude("base", dsl.profileRect(10, 8), 6, "body:seed"),
          dsl.datumPlane("mirror-plane", "+X"),
          dsl.mirror(
            "mirror-missing",
            dsl.selectorNamed("body:missing-source"),
            dsl.planeDatum("mirror-plane"),
            "body:mirror"
          ),
        ]);
        const mirrorSubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: missingMirrorSourcePart,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const mirrorJob = await pollJob(runtime.baseUrl, mirrorSubmit.jobId);
        assert.equal(mirrorJob.state, "failed");
        assert.equal(mirrorJob.error?.code, "selector_named_missing");
        assert.equal(mirrorJob.error?.details?.featureId, "mirror-missing");
        assert.equal(mirrorJob.error?.details?.featureKind, "feature.mirror");
        assert.equal(mirrorJob.error?.details?.referenceKind, "named_output");
        assert.equal(mirrorJob.error?.details?.referenceId, "body:missing-source");
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: split/sketch reference failures return deterministic diagnostics",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const missingSplitBodySource = dsl.part("runtime-split-body-missing-source", [
          dsl.extrude("base", dsl.profileRect(20, 12), 8, "body:main"),
          dsl.plane("splitter", 24, 18, "surface:splitter"),
          dsl.splitBody(
            "split-body-missing",
            dsl.selectorNamed("body:missing-source"),
            dsl.selectorNamed("surface:splitter"),
            "body:split"
          ),
        ]);
        const splitBodySubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: missingSplitBodySource,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const splitBodyJob = await pollJob(runtime.baseUrl, splitBodySubmit.jobId);
        assert.equal(splitBodyJob.state, "failed");
        assert.equal(splitBodyJob.error?.code, "selector_named_missing");
        assert.equal(splitBodyJob.error?.details?.featureId, "split-body-missing");
        assert.equal(splitBodyJob.error?.details?.featureKind, "feature.split.body");
        assert.equal(splitBodyJob.error?.details?.referenceKind, "named_output");
        assert.equal(splitBodyJob.error?.details?.referenceId, "body:missing-source");

        const missingSplitFaceTool = dsl.part("runtime-split-face-missing-tool", [
          dsl.extrude("base", dsl.profileRect(16, 10), 6, "body:main"),
          dsl.splitFace(
            "split-face-missing",
            dsl.selectorFace([dsl.predCreatedBy("base"), dsl.predPlanar()]),
            dsl.selectorNamed("tool-missing"),
            "body:split-face"
          ),
        ]);
        const splitFaceSubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: missingSplitFaceTool,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const splitFaceJob = await pollJob(runtime.baseUrl, splitFaceSubmit.jobId);
        assert.equal(splitFaceJob.state, "failed");
        assert.equal(splitFaceJob.error?.code, "selector_named_missing");
        assert.equal(splitFaceJob.error?.details?.featureId, "split-face-missing");
        assert.equal(splitFaceJob.error?.details?.featureKind, "feature.split.face");
        assert.equal(splitFaceJob.error?.details?.referenceKind, "named_output");
        assert.equal(splitFaceJob.error?.details?.referenceId, "tool-missing");

        const legacySketchPlaneRef = dsl.part("runtime-sketch-plane-anchor-missing", [
          dsl.sketch2d(
            "a-sketch",
            [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
            { plane: dsl.selectorNamed("face:130") }
          ),
          dsl.extrude("z-extrude", dsl.profileRect(20, 20), 6, "body:main"),
        ]);
        const sketchSubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: legacySketchPlaneRef,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const sketchJob = await pollJob(runtime.baseUrl, sketchSubmit.jobId);
        assert.equal(sketchJob.state, "failed");
        assert.equal(sketchJob.error?.code, "selector_legacy_numeric_unsupported");
        assert.equal(sketchJob.error?.details?.featureId, "a-sketch");
        assert.equal(sketchJob.error?.details?.featureKind, "feature.sketch2d");
        assert.equal(sketchJob.error?.details?.referenceKind, "legacy_numeric_selector");
        assert.equal(sketchJob.error?.details?.referenceId, "face:130");
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: stable selection ids round-trip across builds",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const seedPart = dsl.part("runtime-stable-selection-seed", [
          dsl.extrude("base", dsl.profileRect(20, 20), 10, "body:main"),
        ]);
        const seedSubmit = await fetchJsonWithStatus<{ id: string; jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              part: seedPart,
              options: { meshProfile: "interactive" },
            }),
          }
        );
        const seedJob = await pollJob(runtime.baseUrl, seedSubmit.jobId);
        assert.equal(seedJob.state, "succeeded");
        const seedMeshAssetUrl = String(seedJob.result?.mesh?.asset?.url ?? "");
        assert.ok(seedMeshAssetUrl.length > 0, "missing seed mesh asset url");
        const seedMesh = await fetchJson<{
          selections?: Array<{ id?: string; kind?: string; meta?: Record<string, unknown> }>;
        }>(`${runtime.baseUrl}${seedMeshAssetUrl}`);
        const topFace = findMeshSelection(
          seedMesh,
          (selection) =>
            selection.kind === "face" &&
            selection.meta?.["createdBy"] === "base" &&
            selection.meta?.["normal"] === "+Z"
        );
        assert.ok(topFace, "missing stable top face selection");
        const stableFaceId = String(topFace?.id ?? "");
        assert.ok(
          stableFaceId.startsWith("face:body.main~base."),
          `expected stable face id, got ${stableFaceId}`
        );
        const facePointAnchors =
          topFace?.meta?.["pointAnchors"] && typeof topFace.meta["pointAnchors"] === "object"
            ? (topFace.meta["pointAnchors"] as Record<string, unknown>)
            : null;
        const faceCenterAnchor =
          facePointAnchors?.["center"] && typeof facePointAnchors["center"] === "object"
            ? (facePointAnchors["center"] as Record<string, unknown>)
            : null;
        assert.equal(faceCenterAnchor?.["id"], `${stableFaceId}.point.center`);
        assert.equal(faceCenterAnchor?.["sourceId"], stableFaceId);
        assert.deepEqual(faceCenterAnchor?.["at"], topFace?.meta?.["center"]);

        const openEdge = findMeshSelection(
          seedMesh,
          (selection) =>
            selection.kind === "edge" &&
            selection.meta?.["closedEdge"] !== true &&
            Array.isArray(selection.meta?.["startPoint"]) &&
            Array.isArray(selection.meta?.["endPoint"])
        );
        assert.ok(openEdge, "missing open edge selection with point anchors");
        const edgePointAnchors =
          openEdge?.meta?.["pointAnchors"] && typeof openEdge.meta["pointAnchors"] === "object"
            ? (openEdge.meta["pointAnchors"] as Record<string, unknown>)
            : null;
        const edgeStartAnchor =
          edgePointAnchors?.["start"] && typeof edgePointAnchors["start"] === "object"
            ? (edgePointAnchors["start"] as Record<string, unknown>)
            : null;
        const edgeMidAnchor =
          edgePointAnchors?.["mid"] && typeof edgePointAnchors["mid"] === "object"
            ? (edgePointAnchors["mid"] as Record<string, unknown>)
            : null;
        const edgeEndAnchor =
          edgePointAnchors?.["end"] && typeof edgePointAnchors["end"] === "object"
            ? (edgePointAnchors["end"] as Record<string, unknown>)
            : null;
        const openEdgeId = String(openEdge?.id ?? "");
        assert.ok(openEdgeId.length > 0, "missing open edge id");
        assert.equal(edgeStartAnchor?.["id"], `${openEdgeId}.point.start`);
        assert.equal(edgeMidAnchor?.["id"], `${openEdgeId}.point.mid`);
        assert.equal(edgeEndAnchor?.["id"], `${openEdgeId}.point.end`);
        assert.deepEqual(edgeStartAnchor?.["at"], openEdge?.meta?.["startPoint"]);
        assert.deepEqual(edgeEndAnchor?.["at"], openEdge?.meta?.["endPoint"]);

        const editedPart = dsl.part("runtime-stable-selection-edited", [
          dsl.sketch2d(
            "top-sketch",
            [{ name: "profile:cut", profile: dsl.profileRect(4, 4) }],
            { plane: dsl.selectorNamed(stableFaceId) }
          ),
          dsl.extrude("base", dsl.profileRect(28, 16), 24, "body:main"),
        ]);
        const editedSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/build`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            part: editedPart,
            options: { meshProfile: "interactive" },
          }),
        });
        const editedJob = await pollJob(runtime.baseUrl, editedSubmit.jobId);
        assert.equal(editedJob.state, "succeeded");
        const featureOrder = Array.isArray(editedJob.result?.featureOrder)
          ? editedJob.result.featureOrder.map((entry: unknown) => String(entry))
          : [];
        assert.ok(
          featureOrder.indexOf("base") < featureOrder.indexOf("top-sketch"),
          `expected runtime feature order to anchor stable face id (order=${featureOrder.join(",")})`
        );
        assert.equal(editedJob.result?.outputs?.["profile:cut"]?.kind, "profile");
      } finally {
        await runtime.stop();
      }
    },
  },
  {
    name: "runtime service: staged feature policy can block builds",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const stagedPart = dsl.part("runtime-staged-surface", [
          dsl.extrude(
            "surface-extrude",
            dsl.profileCircle(6),
            20,
            "surface:main",
            undefined,
            { mode: "surface" }
          ),
          dsl.thicken("surface-thicken", dsl.selectorNamed("surface:main"), 1.5, "body:main"),
        ]);

        const blockedSubmit = await fetchJsonWithStatus<{
          id: string;
          jobId: string;
          state: string;
        }>(`${runtime.baseUrl}/v1/build`, 202, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            part: stagedPart,
            options: {
              stagedFeatures: "error",
              meshProfile: "interactive",
            },
          }),
        });
        assert.equal(blockedSubmit.id, blockedSubmit.jobId);
        const blockedJob = await pollJob(runtime.baseUrl, blockedSubmit.jobId);
        assert.equal(blockedJob.state, "failed");
        assert.equal(blockedJob.error?.code, "validation_staged_feature");

      } finally {
        await runtime.stop();
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
