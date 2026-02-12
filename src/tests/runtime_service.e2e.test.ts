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
  const port = await getFreePort();
  const logs: string[] = [];
  const child = spawn(process.execPath, ["tools/runtime/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TF_RUNTIME_PORT: String(port),
      TF_RUNTIME_JOB_TIMEOUT_MS: "15000",
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

async function pollJob(baseUrl: string, jobId: string, timeoutMs = 30000): Promise<JobRecord> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const job = await fetchJson<JobRecord>(`${baseUrl}/v1/jobs/${jobId}`);
    if (["succeeded", "failed", "canceled"].includes(job.state)) return job;
    await sleep(50);
  }
  throw new Error(`Polling timed out for job ${jobId}`);
}

async function waitUntilStateSeen(
  baseUrl: string,
  jobId: string,
  target: string,
  timeoutMs = 20000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const job = await fetchJson<JobRecord>(`${baseUrl}/v1/jobs/${jobId}`);
    if (job.state === target) return true;
    if (["succeeded", "failed", "canceled"].includes(job.state)) return false;
    await sleep(20);
  }
  return false;
}

function makeRuntimeDoc() {
  const part = dsl.part("runtime-cylinder", [
    dsl.extrude("cylinder", dsl.profileCircle(28), 90, "body:main"),
  ]);
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

        const buildSubmit1 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload),
          }
        );
        observedStates.add(buildSubmit1.state);

        const buildJob1 = await pollJob(runtime.baseUrl, buildSubmit1.jobId);
        observedStates.add(buildJob1.state);
        assert.equal(buildJob1.state, "succeeded");
        assert.equal(buildJob1.result?.docId, docCreate.docId);
        assert.equal(buildJob1.result?.cache?.partBuild?.hit, false);
        const partBuildKey1 = String(buildJob1.result?.keys?.partBuildKey ?? "");
        assert.ok(partBuildKey1.length > 0, "Missing partBuildKey in first build");

        const buildSubmit2 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/build`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(buildPayload),
          }
        );
        observedStates.add(buildSubmit2.state);

        const buildJob2 = await pollJob(runtime.baseUrl, buildSubmit2.jobId);
        observedStates.add(buildJob2.state);
        assert.equal(buildJob2.state, "succeeded");
        assert.equal(buildJob2.result?.cache?.partBuild?.hit, true);
        assert.equal(String(buildJob2.result?.keys?.partBuildKey ?? ""), partBuildKey1);

        const buildId = String(buildJob1.result?.buildId ?? "");
        assert.ok(buildId.length > 0, "Missing buildId from build result");

        const meshInteractiveSubmit = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "interactive" }),
          }
        );
        observedStates.add(meshInteractiveSubmit.state);

        const meshPreviewSubmit = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "preview" }),
          }
        );
        observedStates.add(meshPreviewSubmit.state);

        const meshExportSubmit = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, profile: "export" }),
          }
        );
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

        const interactiveMesh = await fetchJson<{ indices?: number[]; positions?: number[] }>(
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

        const exportSubmit1 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/export/step`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, options: { schema: "AP242" } }),
          }
        );
        observedStates.add(exportSubmit1.state);

        const exportJob1 = await pollJob(runtime.baseUrl, exportSubmit1.jobId);
        observedStates.add(exportJob1.state);
        assert.equal(exportJob1.state, "succeeded");
        assert.equal(exportJob1.result?.cache?.export?.hit, false);

        const exportSubmit2 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/export/step`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ buildId, options: { schema: "AP242" } }),
          }
        );
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

        const timeoutSubmit = await fetchJsonWithStatus<{ jobId: string; state: string }>(
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

        const longMeshSubmit1 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(longMeshBody),
          }
        );
        observedStates.add(longMeshSubmit1.state);

        const longMeshSubmit2 = await fetchJsonWithStatus<{ jobId: string; state: string }>(
          `${runtime.baseUrl}/v1/jobs/mesh`,
          202,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(longMeshBody),
          }
        );
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
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
