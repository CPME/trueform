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
        const caps = await backend.capabilities?.();
        assert.equal(caps?.name, "opencascade.native");
        assert.deepEqual(caps?.featureKinds, ["datum.plane", "datum.axis", "datum.frame", "feature.sketch2d", "feature.extrude", "feature.plane", "feature.surface", "feature.revolve", "feature.pipe", "feature.loft", "feature.sweep"]);
        assert.deepEqual(caps?.exports, { step: true, stl: false });

        const datumPart = dsl.part("native-datum", [
          dsl.datumPlane("datum-a", "+Z", [0, 0, 0]),
          dsl.datumAxis("axis-a", "+X", [0, 0, 0]),
        ]);
        const datumResult = await buildPartAsync(datumPart, backend);
        const datum = datumResult.final.outputs.get("datum:datum-a");
        const axis = datumResult.final.outputs.get("datum:axis-a");
        assert.equal(datum?.kind, "datum");
        assert.equal(axis?.kind, "datum");

        const sketchExtrudePart = dsl.part("native-sketch-extrude", [
          dsl.sketch2d("sketch-base", [
            { name: "profile:base", profile: dsl.profileRect(40, 20) },
          ]),
          dsl.extrude(
            "base",
            dsl.profileRef("profile:base"),
            8,
            "body:main",
            ["sketch-base"]
          ),
        ]);
        const sketchExtrudeResult = await buildPartAsync(sketchExtrudePart, backend);
        const sketchBody = sketchExtrudeResult.final.outputs.get("body:main");
        assert.ok(sketchBody, "missing sketch-driven body:main output");

        const frameSurfacePart = dsl.part("native-surface-frame", [
          dsl.sketch2d("sketch-surface", [
            { name: "profile:surface", profile: dsl.profileRect(20, 10) },
          ]),
          dsl.surface("surface-1", dsl.profileRef("profile:surface"), "surface:main", ["sketch-surface"]),
          dsl.datumFrame(
            "frame-a",
            dsl.selectorFace([dsl.predPlanar()], [dsl.rankMaxArea()]),
            ["surface-1"]
          ),
        ]);
        const frameSurfaceResult = await buildPartAsync(frameSurfacePart, backend);
        const surface = frameSurfaceResult.final.outputs.get("surface:main");
        const frame = frameSurfaceResult.final.outputs.get("datum:frame-a");
        assert.equal(surface?.kind, "surface");
        assert.equal(frame?.kind, "datum");

        const planeRevolvePart = dsl.part("native-plane-revolve", [
          dsl.datumPlane("plane-datum", "+X"),
          dsl.plane("plane-1", 30, 18, "surface:plane", {
            plane: dsl.planeDatum("plane-datum"),
          }),
          dsl.revolve(
            "revolve-1",
            dsl.profileRect(2, 4, [1, 2, 0]),
            "+X",
            "full",
            "body:revolve"
          ),
        ]);
        const planeRevolveResult = await buildPartAsync(planeRevolvePart, backend);
        const plane = planeRevolveResult.final.outputs.get("surface:plane");
        const revolvedBody = planeRevolveResult.final.outputs.get("body:revolve");
        assert.equal(plane?.kind, "surface");
        assert.equal(revolvedBody?.kind, "solid");

        const pipePart = dsl.part("native-pipe", [
          dsl.pipe("pipe-1", "+Z", 24, 10, 6, "body:pipe"),
        ]);
        const pipeResult = await buildPartAsync(pipePart, backend);
        const pipeBody = pipeResult.final.outputs.get("body:pipe");
        assert.equal(pipeBody?.kind, "solid");

        const loftPart = dsl.part("native-loft", [
          dsl.loft(
            "loft-1",
            [
              dsl.profileCircle(8, [0, 0, 0]),
              dsl.profilePoly(6, 10, [0, 0, 16], Math.PI / 6),
            ],
            "body:loft"
          ),
        ]);
        const loftResult = await buildPartAsync(loftPart, backend);
        const loftBody = loftResult.final.outputs.get("body:loft");
        assert.equal(loftBody?.kind, "solid");

        const sweepPart = dsl.part("native-sweep", [
          dsl.sweep(
            "sweep-1",
            dsl.profileCircle(4),
            dsl.pathPolyline([
              [0, 0, 0],
              [0, 0, 12],
              [6, 4, 20],
            ]),
            "body:sweep"
          ),
        ]);
        const sweepResult = await buildPartAsync(sweepPart, backend);
        const sweepBody = sweepResult.final.outputs.get("body:sweep");
        assert.equal(sweepBody?.kind, "solid");

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
