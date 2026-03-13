import { countTenantInStore, tenantScopedKey } from "./tenant.mjs";

export function createDocumentStoreService(options) {
  const {
    documentStore,
    documentVersionStore,
    buildSessionStore,
    maxDocBytes,
    maxDocsPerTenant,
    maxDocVersionsPerKey,
    maxBuildSessionsPerTenant,
    maxBuildsPerSession,
    buildSessionTtlMs,
    makeHttpError,
    stableStringify,
    sha256,
    nextBuildSessionId,
  } = options;

  function normalizeDocKey(value) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(trimmed)) {
      throw makeHttpError(400, "invalid_doc_key", "docKey must match [A-Za-z0-9._:-]{1,128}");
    }
    return trimmed;
  }

  function migrateDocumentForStorage(document) {
    const base =
      document && typeof document === "object" ? JSON.parse(JSON.stringify(document)) : document;
    if (!base || typeof base !== "object") {
      throw makeHttpError(400, "invalid_document", "Document payload must be an object");
    }
    const currentVersion =
      Number.isFinite(Number(base.irVersion)) && Number(base.irVersion) > 0
        ? Number(base.irVersion)
        : 1;
    if (!Number.isFinite(currentVersion) || currentVersion <= 0) {
      throw makeHttpError(400, "invalid_document_version", "Document irVersion must be > 0");
    }
    base.irVersion = currentVersion;
    return {
      document: base,
      schemaVersion: currentVersion,
      migrationsApplied: [],
    };
  }

  function getDocumentVersionTrack(tenantId, docKey) {
    const trackKey = tenantScopedKey(tenantId, docKey);
    const existing = documentVersionStore.get(trackKey);
    if (existing) return existing;
    const created = {
      tenantId,
      docKey,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [],
    };
    documentVersionStore.set(trackKey, created);
    return created;
  }

  function appendDocumentVersion(record) {
    const track = getDocumentVersionTrack(record.tenantId, record.docKey);
    const existing = track.versions.find((entry) => entry.docId === record.docId);
    if (existing) {
      record.version = existing.version;
      track.updatedAt = new Date().toISOString();
      return existing.version;
    }
    const nextVersion =
      track.versions.length > 0 ? Number(track.versions[track.versions.length - 1].version) + 1 : 1;
    const createdAt = new Date().toISOString();
    track.versions.push({
      version: nextVersion,
      docId: record.docId,
      createdAt,
    });
    if (track.versions.length > maxDocVersionsPerKey) {
      track.versions = track.versions.slice(track.versions.length - maxDocVersionsPerKey);
    }
    track.updatedAt = createdAt;
    record.version = nextVersion;
    return nextVersion;
  }

  function assertTenantQuota(tenantId, kind, limit, current) {
    if (current < limit) return;
    throw makeHttpError(429, "quota_exceeded", `Tenant ${tenantId} exceeded ${kind} quota`, {
      tenantId,
      kind,
      limit,
      current,
    });
  }

  function makeDocumentRecord(tenantId, document, docKeyHint) {
    const migrated = migrateDocumentForStorage(document);
    const canonicalJson = stableStringify(migrated.document);
    const canonicalDocument = JSON.parse(canonicalJson);
    const bytes = Buffer.byteLength(canonicalJson);
    if (bytes > maxDocBytes) {
      throw makeHttpError(413, "document_too_large", `Document exceeds ${maxDocBytes} bytes`, {
        tenantId,
        bytes,
        maxBytes: maxDocBytes,
      });
    }
    const docId = sha256(canonicalJson);
    const createdAt = new Date().toISOString();
    const docKey = normalizeDocKey(docKeyHint) ?? docId;
    return {
      id: docId,
      docId,
      docKey,
      version: 1,
      tenantId,
      contentHash: docId,
      canonicalJson,
      document: canonicalDocument,
      schemaVersion: migrated.schemaVersion,
      migrationsApplied: migrated.migrationsApplied,
      createdAt,
      bytes,
    };
  }

  function storeDocument(tenantId, document, docKeyHint) {
    const next = makeDocumentRecord(tenantId, document, docKeyHint);
    const existing = documentStore.get(tenantScopedKey(tenantId, next.docId));
    if (existing) {
      return { record: existing, inserted: false };
    }
    assertTenantQuota(
      tenantId,
      "documents_per_tenant",
      maxDocsPerTenant,
      countTenantInStore(documentStore, tenantId)
    );
    appendDocumentVersion(next);
    documentStore.set(tenantScopedKey(tenantId, next.docId), next);
    return { record: next, inserted: true };
  }

  function pruneExpiredBuildSessions() {
    const now = Date.now();
    for (const [sessionId, session] of buildSessionStore.entries()) {
      if (session.expiresAtMs <= now) buildSessionStore.delete(sessionId);
    }
  }

  function createBuildSession(tenantId) {
    pruneExpiredBuildSessions();
    assertTenantQuota(
      tenantId,
      "build_sessions_per_tenant",
      maxBuildSessionsPerTenant,
      countTenantInStore(buildSessionStore, tenantId)
    );
    const now = Date.now();
    const sessionId = nextBuildSessionId();
    const session = {
      id: sessionId,
      tenantId,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAtMs: now + buildSessionTtlMs,
      buildsByPartKey: new Map(),
    };
    buildSessionStore.set(sessionId, session);
    return session;
  }

  function getBuildSession(tenantId, sessionId) {
    pruneExpiredBuildSessions();
    const session = buildSessionStore.get(sessionId);
    if (!session || session.tenantId !== tenantId) return null;
    const now = Date.now();
    session.updatedAt = new Date(now).toISOString();
    session.expiresAtMs = now + buildSessionTtlMs;
    return session;
  }

  function dropBuildSession(tenantId, sessionId) {
    const session = buildSessionStore.get(sessionId);
    if (!session || session.tenantId !== tenantId) return false;
    buildSessionStore.delete(sessionId);
    return true;
  }

  function setBuildSessionEntry(session, sessionPartKey, entry) {
    if (session.buildsByPartKey.has(sessionPartKey)) {
      session.buildsByPartKey.delete(sessionPartKey);
    }
    session.buildsByPartKey.set(sessionPartKey, entry);
    while (session.buildsByPartKey.size > maxBuildsPerSession) {
      const oldestKey = session.buildsByPartKey.keys().next().value;
      if (typeof oldestKey !== "string") break;
      session.buildsByPartKey.delete(oldestKey);
    }
  }

  return {
    createBuildSession,
    dropBuildSession,
    getBuildSession,
    migrateDocumentForStorage,
    normalizeDocKey,
    pruneExpiredBuildSessions,
    setBuildSessionEntry,
    storeDocument,
  };
}
