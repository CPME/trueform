import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctNativeBackend } from "../backend_occt_native.js";
import { LocalOcctTransport } from "../backend_occt_native_local.js";
import { runTests } from "./occt_test_utils.js";
import { selectorConformanceTestsAsync } from "./selector_conformance_harness_async.js";

async function main(): Promise<void> {
  const occt = await initOpenCascade();
  const transport = new LocalOcctTransport({ occt });
  const backend = new OcctNativeBackend({ transport });
  const tests = selectorConformanceTestsAsync({
    name: "occt-native-local",
    backend,
  });
  await runTests(tests);
  await backend.close?.();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
