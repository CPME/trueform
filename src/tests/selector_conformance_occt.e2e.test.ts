import { runTests, getBackendContext } from "./occt_test_utils.js";
import { selectorConformanceTests } from "./selector_conformance_harness.js";

async function main(): Promise<void> {
  const { backend } = await getBackendContext();
  const tests = selectorConformanceTests({
    name: "occt-backend",
    backend,
  });
  await runTests(tests);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
