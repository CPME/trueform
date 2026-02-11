import { MockBackend } from "../mock_backend.js";
import { runTests } from "./occt_test_utils.js";
import { selectorConformanceTests } from "./selector_conformance_harness.js";

const backend = new MockBackend();

const tests = selectorConformanceTests({
  name: "mock-backend",
  backend,
});

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
