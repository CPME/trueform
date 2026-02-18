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
  error: { code?: string; message?: string } | null;
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

function triangleCount(mesh: { indices?: number[]; positions?: number[] }): number {
  if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
    return Math.floor(mesh.indices.length / 3);
  }
  if (Array.isArray(mesh.positions) && mesh.positions.length >= 9) {
    return Math.floor(mesh.positions.length / 9);
  }
  return 0;
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

const tests = [
  {
    name: "runtime service: documents, lifecycle, cache keys, and mesh profile contract",
    fn: async () => {
      const runtime = await startRuntimeServer();
      try {
        const observedStates = new Set<string>();
        const capabilities = await fetchJson<{
          apiVersion?: string;
          featureStages?: Record<string, { stage?: string; notes?: string }>;
          quotas?: {
            maxBuildSessionsPerTenant?: number;
            maxBuildsPerSession?: number;
            buildSessionTtlMs?: number;
          };
          optionalFeatures?: {
            partialBuild?: {
              endpoint?: boolean;
              execution?: string;
              requirements?: { sessionScoped?: boolean; changedFeatureIds?: boolean };
            };
            buildSessions?: { enabled?: boolean };
            assembly?: { solve?: boolean };
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
        assert.equal((capabilities.quotas?.maxBuildSessionsPerTenant ?? 0) > 0, true);
        assert.equal((capabilities.quotas?.maxBuildsPerSession ?? 0) > 0, true);
        assert.equal((capabilities.quotas?.buildSessionTtlMs ?? 0) > 0, true);
        assert.equal(capabilities.optionalFeatures?.bom?.derive, false);
        assert.equal(capabilities.optionalFeatures?.release?.preflight, false);
        assert.equal(capabilities.optionalFeatures?.featureStaging?.registry, true);
        assert.equal(capabilities.featureStages?.["feature.thread"]?.stage, "staging");
        assert.equal(capabilities.featureStages?.["feature.surface"]?.stage, "staging");
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

        const { part, document } = makeRuntimeDoc();

        const docCreate = await fetchJsonWithStatus<{
          docId: string;
          inserted: boolean;
          contentHash: string;
        }>(`${runtime.baseUrl}/v1/documents`, 201, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document }),
        });
        assert.equal(typeof docCreate.docId, "string");
        assert.equal(docCreate.inserted, true);
        assert.equal(docCreate.docId, docCreate.contentHash);

        const docCreateAgain = await fetchJsonWithStatus<{
          docId: string;
          inserted: boolean;
        }>(`${runtime.baseUrl}/v1/documents`, 200, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ document }),
        });
        assert.equal(docCreateAgain.docId, docCreate.docId);
        assert.equal(docCreateAgain.inserted, false);

        const storedDoc = await fetchJson<{
          docId: string;
          document: { id: string };
        }>(`${runtime.baseUrl}/v1/documents/${docCreate.docId}`);
        assert.equal(storedDoc.docId, docCreate.docId);
        assert.equal(storedDoc.document.id, document.id);

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
