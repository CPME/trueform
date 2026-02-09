import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dsl } from "../dsl.js";
import { buildPartAsync } from "../executor.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { HttpOcctTransport } from "../backend_occt_native_http.js";
import { exportStepAp242WithPmiAsync } from "../export/step.js";
import { runTests } from "./occt_test_utils.js";

type ServerHandle = {
  process: ReturnType<typeof spawn>;
  url: string;
};

async function startServer(port: number): Promise<ServerHandle> {
  const bin = "native/occt_server/build/occt_server";
  const proc = spawn(bin, ["127.0.0.1", String(port)], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("occt_server did not start in time"));
    }, 5000);
    const onData = (chunk: Buffer) => {
      const msg = chunk.toString("utf8");
      if (msg.includes("occt_server listening")) {
        clearTimeout(timeout);
        proc.stdout?.off("data", onData);
        resolve();
      }
    };
    proc.stdout?.on("data", onData);
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`occt_server exited with code ${code ?? "unknown"}`));
    });
  });

  return { process: proc, url: `http://127.0.0.1:${port}` };
}

function stopServer(handle: ServerHandle): Promise<void> {
  return new Promise((resolve) => {
    handle.process.once("exit", () => resolve());
    handle.process.kill("SIGTERM");
  });
}

const tests = [
  {
    name: "occt native server: exports AP242 with embedded PMI",
    fn: async () => {
      if (process.env.TF_NATIVE_SERVER !== "1") {
        return;
      }
      const server = await startServer(8081);
      try {
        const transport = new HttpOcctTransport({ baseUrl: server.url });
        const backend = new OcctNativeBackend({ transport });

        const target = dsl.refSurface(
          dsl.selectorFace(
            [dsl.predPlanar()],
            [dsl.rankMaxArea(), dsl.rankMaxZ()]
          )
        );
        const part = dsl.part(
          "pmi-plate-native",
          [dsl.extrude("base", dsl.profileRect(40, 20), 8, "body:main")],
          {
            datums: [dsl.datumFeature("datum-A", "A", target)],
            constraints: [dsl.surfaceProfileConstraint("c1", target, 0.05)],
          }
        );

        const result = await buildPartAsync(part, backend);
        const body = result.final.outputs.get("body:main");
        assert.ok(body, "missing body:main output");

      const exported = await exportStepAp242WithPmiAsync(
        backend,
        body,
        part,
        { schema: "AP242" }
      );
      assert.equal(exported.embedded, true, "expected embedded PMI export");
      assert.ok(exported.step.byteLength > 0, "expected STEP bytes");
      assert.equal(exported.pmi, undefined, "embedded export should not return PMI JSON");

      const outPath = process.env.TF_NATIVE_STEP_OUT;
      if (outPath) {
        await writeFile(outPath, exported.step);
      }
    } finally {
      await stopServer(server);
    }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
