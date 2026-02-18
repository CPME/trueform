import assert from "node:assert/strict";
import { TfServiceClient } from "../service_client.js";
import { runTests } from "./occt_test_utils.js";

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
};

function makeJsonResponse(status: number, payload: unknown): Response {
  const body = JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeStreamResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const tests = [
  {
    name: "tf service client: sends tenant headers and supports polling",
    fn: async () => {
      const calls: FetchCall[] = [];
      let pollCount = 0;
      const fakeFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const headers = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        calls.push({
          url,
          method: String(init?.method ?? "GET"),
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });

        if (url.endsWith("/v1/build")) {
          return makeJsonResponse(202, { id: "job_1", jobId: "job_1", state: "queued" });
        }
        if (url.endsWith("/v1/jobs/job_1")) {
          pollCount += 1;
          if (pollCount < 2) {
            return makeJsonResponse(200, {
              id: "job_1",
              jobId: "job_1",
              state: "running",
              progress: 0.5,
              createdAt: "2026-02-12T00:00:00.000Z",
              updatedAt: "2026-02-12T00:00:00.000Z",
              result: null,
              error: null,
            });
          }
          return makeJsonResponse(200, {
            id: "job_1",
            jobId: "job_1",
            state: "succeeded",
            progress: 1,
            createdAt: "2026-02-12T00:00:00.000Z",
            updatedAt: "2026-02-12T00:00:01.000Z",
            result: { buildId: "build_1" },
            error: null,
          });
        }
        return makeJsonResponse(404, { error: "not found" });
      };

      const client = new TfServiceClient({
        baseUrl: "http://127.0.0.1:8080",
        fetch: fakeFetch,
        tenantId: "tenant-a",
      });

      const accepted = await client.build({ part: { id: "p", features: [] } });
      assert.equal(accepted.id, "job_1");
      assert.equal(accepted.jobId, "job_1");

      const done = await client.pollJob<{ buildId: string }>(accepted.jobId, {
        intervalMs: 1,
        timeoutMs: 1000,
      });
      assert.equal(done.id, "job_1");
      assert.equal(done.jobId, "job_1");
      assert.equal(done.state, "succeeded");
      assert.equal(done.result?.buildId, "build_1");

      const buildCall = calls.find((call) => call.url.endsWith("/v1/build"));
      assert.ok(buildCall, "missing /v1/build call");
      assert.equal(buildCall?.headers["x-tf-tenant-id"], "tenant-a");
      assert.equal(buildCall?.headers["content-type"], "application/json");
      assert.ok(buildCall?.body?.includes('"part"'), "missing request JSON body");

      const pollCalls = calls.filter((call) => call.url.endsWith("/v1/jobs/job_1"));
      assert.ok(pollCalls.length >= 2, "expected multiple poll calls");
      assert.ok(pollCalls.every((call) => call.headers["x-tf-tenant-id"] === "tenant-a"));
    },
  },
  {
    name: "tf service client: parses stream job events",
    fn: async () => {
      const fakeFetch: typeof fetch = async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (!url.endsWith("/v1/jobs/job_stream/stream")) {
          return makeJsonResponse(404, { error: "not found" });
        }
        return makeStreamResponse([
          'event: job\n',
          'data: {"id":"job_stream","jobId":"job_stream","state":"running","progress":0.2,"createdAt":"2026-02-12T00:00:00.000Z","updatedAt":"2026-02-12T00:00:00.100Z","result":null,"error":null}\n\n',
          'event: end\n',
          'data: {"id":"job_stream","jobId":"job_stream","state":"succeeded","progress":1,"createdAt":"2026-02-12T00:00:00.000Z","updatedAt":"2026-02-12T00:00:01.000Z","result":{"ok":true},"error":null}\n\n',
        ]);
      };

      const client = new TfServiceClient({
        baseUrl: "http://127.0.0.1:8080",
        fetch: fakeFetch,
      });

      const events: Array<{ event: string; state: string }> = [];
      for await (const evt of client.streamJob("job_stream")) {
        events.push({ event: evt.event, state: evt.data.state });
      }

      assert.deepEqual(events, [
        { event: "job", state: "running" },
        { event: "end", state: "succeeded" },
      ]);
    },
  },
  {
    name: "tf service client: supports build partial endpoint",
    fn: async () => {
      const calls: FetchCall[] = [];
      const fakeFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const headers = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        calls.push({
          url,
          method: String(init?.method ?? "GET"),
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        if (url.endsWith("/v1/build/partial")) {
          return makeJsonResponse(202, { id: "job_partial", jobId: "job_partial", state: "queued" });
        }
        return makeJsonResponse(404, { error: "not found" });
      };

      const client = new TfServiceClient({
        baseUrl: "http://127.0.0.1:8080",
        fetch: fakeFetch,
      });

      const accepted = await client.buildPartial({
        part: { id: "p", features: [] },
        partial: { changedFeatureIds: ["extrude-1"] },
      });
      assert.equal(accepted.id, "job_partial");
      assert.equal(accepted.jobId, "job_partial");
      const partialCall = calls.find((call) => call.url.endsWith("/v1/build/partial"));
      assert.ok(partialCall, "missing /v1/build/partial call");
      assert.ok(partialCall?.body?.includes("changedFeatureIds"), "missing changed feature hints");
    },
  },
  {
    name: "tf service client: supports build sessions and assembly solve endpoints",
    fn: async () => {
      const calls: FetchCall[] = [];
      const fakeFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const headers = Object.fromEntries(
          Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            String(v),
          ])
        );
        calls.push({
          url,
          method: String(init?.method ?? "GET"),
          headers,
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        if (url.endsWith("/v1/build-sessions") && init?.method === "POST") {
          return makeJsonResponse(201, {
            sessionId: "session_1",
            createdAt: "2026-02-18T00:00:00.000Z",
            expiresAt: "2026-02-18T00:30:00.000Z",
          });
        }
        if (url.endsWith("/v1/build-sessions/session_1") && init?.method === "DELETE") {
          return new Response(null, { status: 204 });
        }
        if (url.endsWith("/v1/assembly/solve")) {
          return makeJsonResponse(202, {
            id: "job_asm",
            jobId: "job_asm",
            state: "queued",
          });
        }
        return makeJsonResponse(404, { error: "not found" });
      };

      const client = new TfServiceClient({
        baseUrl: "http://127.0.0.1:8080",
        fetch: fakeFetch,
      });

      const created = await client.createBuildSession();
      assert.equal(created.sessionId, "session_1");
      await client.deleteBuildSession(created.sessionId);

      const accepted = await client.assemblySolve({
        assemblyId: "asm-1",
        document: { id: "doc-1", parts: [], assemblies: [] },
      });
      assert.equal(accepted.id, "job_asm");
      assert.equal(accepted.jobId, "job_asm");

      const createCall = calls.find(
        (call) => call.url.endsWith("/v1/build-sessions") && call.method === "POST"
      );
      assert.ok(createCall, "missing build session create call");
      const deleteCall = calls.find(
        (call) => call.url.endsWith("/v1/build-sessions/session_1") && call.method === "DELETE"
      );
      assert.ok(deleteCall, "missing build session delete call");
      const assemblyCall = calls.find((call) => call.url.endsWith("/v1/assembly/solve"));
      assert.ok(assemblyCall, "missing assembly solve call");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
