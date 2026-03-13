import { createHash } from "node:crypto";

export function computeBounds(positions) {
  if (!Array.isArray(positions) || positions.length < 3) return null;
  let minX = positions[0];
  let minY = positions[1];
  let minZ = positions[2];
  let maxX = positions[0];
  let maxY = positions[1];
  let maxZ = positions[2];
  for (let i = 3; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return [
    [minX, minY, minZ],
    [maxX, maxY, maxZ],
  ];
}

export function triangleCountFromMesh(mesh) {
  if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
    return Math.floor(mesh.indices.length / 3);
  }
  if (Array.isArray(mesh.positions) && mesh.positions.length >= 9) {
    return Math.floor(mesh.positions.length / 9);
  }
  return 0;
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

export function makePartBuildKey(
  keyVersion,
  tenantId,
  part,
  context,
  overrides,
  backendFingerprint,
  buildPartCacheKey
) {
  if (!context) return null;
  const coreKey = buildPartCacheKey(part, context, overrides);
  const key = {
    version: keyVersion,
    type: "partBuildKey",
    tenantId,
    backendFingerprint,
    key: coreKey,
  };
  return { object: key, value: stableStringify(key) };
}

export function makeMeshKey(keyVersion, partBuildKey, target, profile, options) {
  if (!partBuildKey?.value) return null;
  const key = {
    version: keyVersion,
    type: "meshKey",
    partBuildKey: partBuildKey.value,
    target,
    profile,
    options,
  };
  return { object: key, value: stableStringify(key) };
}

export function makeExportKey(keyVersion, partBuildKey, target, kind, options) {
  if (!partBuildKey?.value) return null;
  const key = {
    version: keyVersion,
    type: "exportKey",
    partBuildKey: partBuildKey.value,
    target,
    kind,
    options,
  };
  return { object: key, value: stableStringify(key) };
}

export function cacheSet(map, key, value, maxSize) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest) map.delete(oldest);
  }
}

export function recordCacheEvent(cacheStats, layer, hit, keyValue) {
  const bucket = cacheStats[layer];
  if (!bucket) return;
  if (hit) bucket.hit += 1;
  else bucket.miss += 1;
  const keyHash = keyValue ? sha256(keyValue).slice(0, 16) : null;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: "cache",
      layer,
      result: hit ? "hit" : "miss",
      keyHash,
      totals: { ...bucket },
    })
  );
}

export function makeLatencyBucket() {
  return {
    count: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
    timeout: 0,
    totalMs: 0,
    avgMs: 0,
    maxMs: 0,
    lastMs: 0,
  };
}

export function recordLatency(bucket, durationMs, state, errorCode = null) {
  if (!bucket) return;
  const ms = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  bucket.count += 1;
  bucket.totalMs += ms;
  bucket.avgMs = bucket.count > 0 ? Number((bucket.totalMs / bucket.count).toFixed(3)) : 0;
  bucket.lastMs = Number(ms.toFixed(3));
  bucket.maxMs = Number(Math.max(bucket.maxMs, ms).toFixed(3));
  if (state === "succeeded") {
    bucket.succeeded += 1;
    return;
  }
  if (state === "canceled") {
    bucket.canceled += 1;
    return;
  }
  if (errorCode === "job_timeout") bucket.timeout += 1;
  bucket.failed += 1;
}

export function memorySnapshot() {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}
