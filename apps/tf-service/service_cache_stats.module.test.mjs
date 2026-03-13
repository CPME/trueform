import assert from "node:assert/strict";
import {
  cacheSet,
  computeBounds,
  makeExportKey,
  makeLatencyBucket,
  makeMeshKey,
  makePartBuildKey,
  recordLatency,
  stableStringify,
  triangleCountFromMesh,
} from "./service_cache_stats.mjs";

assert.equal(stableStringify({ b: 2, a: 1 }), "{\"a\":1,\"b\":2}");
assert.deepEqual(computeBounds([0, 1, 2, 4, 5, 6]), [
  [0, 1, 2],
  [4, 5, 6],
]);
assert.equal(triangleCountFromMesh({ positions: new Array(18).fill(0) }), 2);

const partBuildKey = makePartBuildKey(
  "v1",
  "tenant-a",
  { id: "part-1" },
  { units: "mm" },
  { size: 2 },
  "backend-1",
  () => "core-key"
);
assert.ok(partBuildKey?.value.includes("\"backendFingerprint\":\"backend-1\""));
assert.ok(makeMeshKey("v1", partBuildKey, "body:main", "interactive", { quality: 1 })?.value);
assert.ok(makeExportKey("v1", partBuildKey, "body:main", "step", { binary: true })?.value);

const lru = new Map();
cacheSet(lru, "a", 1, 2);
cacheSet(lru, "b", 2, 2);
cacheSet(lru, "c", 3, 2);
assert.deepEqual([...lru.keys()], ["b", "c"]);

const latency = makeLatencyBucket();
recordLatency(latency, 20, "succeeded");
recordLatency(latency, 10, "failed", "job_timeout");
assert.equal(latency.count, 2);
assert.equal(latency.succeeded, 1);
assert.equal(latency.timeout, 1);
