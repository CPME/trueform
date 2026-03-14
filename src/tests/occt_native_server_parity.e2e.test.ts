import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import initOpenCascade from "opencascade.js/dist/node.js";
import { dsl } from "../dsl.js";
import { buildPartAsync } from "../executor.js";
import { backendToAsync } from "../backend-spi.js";
import { OcctBackend } from "../backend_occt.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { HttpOcctTransport } from "../backend_occt_native_http.js";
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

const parityCases = [
  {
    name: "extrude",
    part: dsl.part("native-parity-extrude", [
      dsl.extrude("base", dsl.profileRect(20, 10), 5, "body:main"),
    ]),
  },
  {
    name: "revolve",
    part: dsl.part("native-parity-revolve", [
      dsl.revolve(
        "revolve-1",
        dsl.profileRect(2, 4, [1, 2, 0]),
        "+X",
        "full",
        "body:main"
      ),
    ]),
  },
  {
    name: "pipe",
    part: dsl.part("native-parity-pipe", [
      dsl.pipe("pipe-1", "+Z", 24, 10, 6, "body:main"),
    ]),
  },
  {
    name: "loft",
    part: dsl.part("native-parity-loft", [
      dsl.loft(
        "loft-1",
        [
          dsl.profileCircle(8, [0, 0, 0]),
          dsl.profilePoly(6, 10, [0, 0, 16], Math.PI / 6),
        ],
        "body:main"
      ),
    ]),
  },
  {
    name: "sweep",
    part: dsl.part("native-parity-sweep", [
      dsl.sweep(
        "sweep-1",
        dsl.profileCircle(4),
        dsl.pathPolyline([
          [0, 0, 0],
          [0, 0, 12],
          [6, 4, 20],
        ]),
        "body:main"
      ),
    ]),
  },
  {
    name: "plane",
    part: dsl.part("native-parity-plane", [
      dsl.plane("plane-1", 30, 18, "surface:plane"),
    ]),
  },
  {
    name: "surface",
    part: dsl.part("native-parity-surface", [
      dsl.surface("surface-1", dsl.profileRect(20, 10), "surface:main"),
    ]),
  },
] as const;

function selectionCountByKind(
  selections: Array<{ kind: string }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const selection of selections) {
    counts[selection.kind] = (counts[selection.kind] ?? 0) + 1;
  }
  return counts;
}

const tests = [
  {
    name: "occt native server parity: supported primitive feature flows match direct backend outputs and selection counts",
    fn: async () => {
      if (process.env.TF_NATIVE_SERVER !== "1") {
        return;
      }

      const server = await startServer(8081);
      try {
        const nativeBackend = new OcctNativeBackend({
          transport: new HttpOcctTransport({ baseUrl: server.url }),
        });
        const caps = await nativeBackend.capabilities?.();
        assert.equal(caps?.name, "opencascade.native");
        const nativeSnapshots = new Map<
          string,
          {
            outputKeys: string[];
            outputKinds: string[];
            outputIds: string[];
            selectionCounts: Record<string, number>;
            solidSelectionIds: string[];
            faceSelectionIds: string[];
          }
        >();

        for (const parityCase of parityCases) {
          const native = await buildPartAsync(parityCase.part, nativeBackend);
          nativeSnapshots.set(parityCase.name, {
            outputKeys: [...native.final.outputs.keys()].sort(),
            outputKinds: [...native.final.outputs.entries()]
              .map(([key, value]) => `${key}:${value.kind}`)
              .sort(),
            outputIds: [...native.final.outputs.entries()]
              .map(([key, value]) => `${key}:${value.id}`)
              .sort(),
            selectionCounts: selectionCountByKind(native.final.selections),
            solidSelectionIds: native.final.selections
              .filter((selection) => selection.kind === "solid")
              .map((selection) => selection.id)
              .sort(),
            faceSelectionIds: native.final.selections
              .filter((selection) => selection.kind === "face")
              .map((selection) => selection.id)
              .sort(),
          });
        }

        const occt = await initOpenCascade();
        const directBackend = backendToAsync(new OcctBackend({ occt }));

        for (const parityCase of parityCases) {
          const snapshot = nativeSnapshots.get(parityCase.name);
          assert.ok(snapshot, `${parityCase.name}: missing native snapshot`);
          const direct = await buildPartAsync(parityCase.part, directBackend);

          assert.deepEqual(
            snapshot.outputKeys,
            [...direct.final.outputs.keys()].sort(),
            `${parityCase.name}: output keys drifted`
          );

          const directOutputKinds = [...direct.final.outputs.entries()]
            .map(([key, value]) => `${key}:${value.kind}`)
            .sort();
          const directOutputIds = [...direct.final.outputs.entries()]
            .map(([key, value]) => `${key}:${value.id}`)
            .sort();
          assert.deepEqual(
            snapshot.outputKinds,
            directOutputKinds,
            `${parityCase.name}: output kinds drifted`
          );
          assert.deepEqual(
            snapshot.outputIds,
            directOutputIds,
            `${parityCase.name}: output ids drifted`
          );

          assert.deepEqual(
            snapshot.selectionCounts,
            selectionCountByKind(direct.final.selections),
            `${parityCase.name}: selection counts drifted`
          );
          assert.deepEqual(
            snapshot.solidSelectionIds,
            direct.final.selections
              .filter((selection) => selection.kind === "solid")
              .map((selection) => selection.id)
              .sort(),
            `${parityCase.name}: solid selection ids drifted`
          );
          if (parityCase.name === "plane" || parityCase.name === "surface") {
            assert.deepEqual(
              snapshot.faceSelectionIds,
              direct.final.selections
                .filter((selection) => selection.kind === "face")
                .map((selection) => selection.id)
                .sort(),
              `${parityCase.name}: face selection ids drifted`
            );
          }
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
