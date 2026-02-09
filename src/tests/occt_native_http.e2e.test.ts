import assert from "node:assert/strict";
import http from "node:http";
import initOpenCascade from "opencascade.js/dist/node.js";
import { dsl } from "../dsl.js";
import { buildPartAsync } from "../executor.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { LocalOcctTransport } from "../backend_occt_native_local.js";
import { HttpOcctTransport } from "../backend_occt_native_http.js";
import { runTests } from "./occt_test_utils.js";
import type {
  NativeExecFeatureResponse,
  NativeKernelResult,
} from "../backend_occt_native.js";
import type { FetchLike } from "../backend_occt_native_http.js";

type ServerContext = {
  close: () => Promise<void>;
  url: string;
};

const useLiveServer = process.env.TF_HTTP_E2E_SERVER === "1";

async function readJson(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function writeJson(res: http.ServerResponse, payload: unknown): void {
  const data = JSON.stringify(payload);
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.setHeader("content-length", Buffer.byteLength(data));
  res.end(data);
}

async function startNativeHttpServer(): Promise<ServerContext> {
  const occt = await initOpenCascade();
  const transport = new LocalOcctTransport({ occt });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST" || !req.url) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const path = req.url.split("?")[0] ?? "";
      if (path === "/v1/exec-feature") {
        const payload = await readJson(req);
        const result = await transport.execFeature(payload);
        writeJson(res, result);
        return;
      }
      if (path === "/v1/mesh") {
        const payload = await readJson(req);
        const result = await transport.mesh(payload);
        writeJson(res, result);
        return;
      }
      if (path === "/v1/export-step") {
        const payload = await readJson(req);
        const result = await transport.exportStep(payload);
        res.statusCode = 200;
        res.setHeader("content-type", "application/octet-stream");
        res.end(Buffer.from(result));
        return;
      }
      if (path === "/v1/export-stl") {
        const payload = await readJson(req);
        const result = await transport.exportStl(payload);
        res.statusCode = 200;
        res.setHeader("content-type", "application/octet-stream");
        res.end(Buffer.from(result));
        return;
      }
      res.statusCode = 404;
      res.end();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain");
      res.end(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Failed to bind native HTTP server");
  }

  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function createFakeFetch(): FetchLike {
  const resultPayload: NativeKernelResult = {
    outputs: [
      {
        key: "body:main",
        object: {
          id: "body:main",
          kind: "solid",
          meta: { handle: "shape:0", role: "body" },
        },
      },
    ],
    selections: [],
  };
  const execResponse: NativeExecFeatureResponse = { result: resultPayload };
  const makeJsonResponse = (payload: unknown) =>
    ({
      ok: true,
      status: 200,
      async json() {
        return payload;
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
      async text() {
        return JSON.stringify(payload);
      },
    }) as unknown as Response;

  const makeBinaryResponse = (bytes: Uint8Array) =>
    ({
      ok: true,
      status: 200,
      async json() {
        throw new Error("not json");
      },
      async arrayBuffer() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
      async text() {
        return "";
      },
    }) as unknown as Response;

  return async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    void body;
    if (url.endsWith("/v1/exec-feature")) {
      return makeJsonResponse(execResponse);
    }
    if (url.endsWith("/v1/mesh")) {
      return makeJsonResponse({
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        indices: [0, 1, 2],
      });
    }
    if (url.endsWith("/v1/export-step")) {
      return makeBinaryResponse(new Uint8Array([1, 2, 3, 4]));
    }
    if (url.endsWith("/v1/export-stl")) {
      return makeBinaryResponse(new Uint8Array([5, 6, 7, 8]));
    }
    return {
      ok: false,
      status: 404,
      async json() {
        return {};
      },
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
      async text() {
        return "not found";
      },
    } as unknown as Response;
  };
}

const tests = [
  {
    name: "occt native http: builds via HTTP transport",
    fn: async () => {
      if (useLiveServer) {
        const server = await startNativeHttpServer();
        try {
          const transport = new HttpOcctTransport({ baseUrl: server.url });
          const backend = new OcctNativeBackend({ transport });
          const part = dsl.part("http-native", [
            dsl.extrude("base", dsl.profileRect(22, 12), 4, "body:main"),
          ]);

          const result = await buildPartAsync(part, backend);
          const body = result.final.outputs.get("body:main");
          assert.ok(body, "missing body:main output");
          assert.equal(typeof body.meta["handle"], "string");

          const mesh = await backend.mesh(body, { linearDeflection: 0.3 });
          assert.ok(mesh.positions.length > 0, "mesh should contain positions");

          const step = await backend.exportStep(body, { schema: "AP242" });
          assert.ok(step.byteLength > 0, "step export should return bytes");
        } finally {
          await server.close();
        }
        return;
      }

      const transport = new HttpOcctTransport({
        baseUrl: "http://fake-native",
        fetch: createFakeFetch(),
      });
      const backend = new OcctNativeBackend({ transport });
      const part = dsl.part("http-native", [
        dsl.extrude("base", dsl.profileRect(22, 12), 4, "body:main"),
      ]);

      const result = await buildPartAsync(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");
      assert.equal(typeof body.meta["handle"], "string");

      const mesh = await backend.mesh(body, { linearDeflection: 0.3 });
      assert.ok(mesh.positions.length > 0, "mesh should contain positions");

      const step = await backend.exportStep(body, { schema: "AP242" });
      assert.ok(step.byteLength > 0, "step export should return bytes");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
