import assert from "node:assert/strict";
import { createDocumentStoreService } from "./service_document_store.mjs";

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const documentStore = new Map();
const documentVersionStore = new Map();
const buildSessionStore = new Map();
let sessionCounter = 0;
const service = createDocumentStoreService({
  documentStore,
  documentVersionStore,
  buildSessionStore,
  maxDocBytes: 10_000,
  maxDocsPerTenant: 10,
  maxDocVersionsPerKey: 2,
  maxBuildSessionsPerTenant: 10,
  maxBuildsPerSession: 2,
  buildSessionTtlMs: 10_000,
  makeHttpError: (status, code, message, details) =>
    new HttpError(status, code, message, details),
  stableStringify: JSON.stringify,
  sha256: (value) => `hash:${value}`,
  nextBuildSessionId: () => `session-${++sessionCounter}`,
});

const first = service.storeDocument("t1", { parts: [], context: { units: "mm" } }, "doc-a");
const second = service.storeDocument("t1", { parts: [], context: { units: "mm" } }, "doc-a");
assert.equal(first.inserted, true);
assert.equal(second.inserted, false);
assert.equal(first.record.version, 1);

const session = service.createBuildSession("t1");
service.setBuildSessionEntry(session, "part-a", { buildId: "b1" });
service.setBuildSessionEntry(session, "part-b", { buildId: "b2" });
service.setBuildSessionEntry(session, "part-c", { buildId: "b3" });
assert.deepEqual([...session.buildsByPartKey.keys()], ["part-b", "part-c"]);
assert.equal(service.getBuildSession("t1", session.id)?.id, session.id);
assert.equal(service.dropBuildSession("t1", session.id), true);

assert.throws(
  () => service.normalizeDocKey("bad key"),
  (error) => error instanceof HttpError && error.code === "invalid_doc_key"
);
