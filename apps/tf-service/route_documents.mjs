import { TF_API_ENDPOINTS } from "../../dist/api.js";

export async function tryHandleDocumentRoute(ctx) {
  const {
    req,
    res,
    pathname,
    tenantId,
    json,
    sendNoContent,
    readJson,
    storeDocument,
    documentStore,
    documentVersionStore,
    tenantScopedKey,
    createBuildSession,
    dropBuildSession,
  } = ctx;

  if (req.method === "POST" && pathname === TF_API_ENDPOINTS.documents) {
    const payload = await readJson(req);
    const document = payload?.document ?? payload;
    const docKey = payload && typeof payload === "object" ? payload.docKey : undefined;
    if (!document || !Array.isArray(document.parts)) {
      throw ctx.makeHttpError(400, "invalid_document", "Document payload must include parts[]");
    }
    const stored = storeDocument(tenantId, document, docKey);
    json(res, stored.inserted ? 201 : 200, {
      tenantId,
      docId: stored.record.docId,
      docKey: stored.record.docKey,
      version: stored.record.version,
      schemaVersion: stored.record.schemaVersion,
      contentHash: stored.record.contentHash,
      inserted: stored.inserted,
      createdAt: stored.record.createdAt,
      bytes: stored.record.bytes,
      url: `/v1/documents/${stored.record.docId}`,
    });
    return true;
  }

  if (
    req.method === "GET" &&
    pathname.startsWith(`${TF_API_ENDPOINTS.documents}/`) &&
    pathname.endsWith("/versions")
  ) {
    const segments = pathname.split("/");
    const docId = segments.length >= 4 ? segments[3] : null;
    const stored = docId ? documentStore.get(tenantScopedKey(tenantId, docId)) : null;
    if (!stored) {
      json(res, 404, { error: "Document not found" });
      return true;
    }
    const track = documentVersionStore.get(tenantScopedKey(tenantId, stored.docKey));
    json(res, 200, {
      tenantId,
      docId: stored.docId,
      docKey: stored.docKey,
      version: stored.version,
      versions:
        track?.versions?.map((entry) => ({
          version: entry.version,
          docId: entry.docId,
          createdAt: entry.createdAt,
          url: `/v1/documents/${entry.docId}`,
        })) ?? [],
    });
    return true;
  }

  if (req.method === "GET" && pathname.startsWith(`${TF_API_ENDPOINTS.documents}/`)) {
    const docId = pathname.split("/").pop();
    const stored = docId ? documentStore.get(tenantScopedKey(tenantId, docId)) : null;
    if (!stored) {
      json(res, 404, { error: "Document not found" });
      return true;
    }
    json(res, 200, {
      tenantId,
      docId: stored.docId,
      docKey: stored.docKey,
      version: stored.version,
      schemaVersion: stored.schemaVersion,
      migrationsApplied: stored.migrationsApplied,
      contentHash: stored.contentHash,
      createdAt: stored.createdAt,
      bytes: stored.bytes,
      document: stored.document,
    });
    return true;
  }

  if (req.method === "POST" && pathname === TF_API_ENDPOINTS.buildSessions) {
    const session = createBuildSession(tenantId);
    json(res, 201, {
      sessionId: session.id,
      tenantId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: new Date(session.expiresAtMs).toISOString(),
    });
    return true;
  }

  if (req.method === "DELETE" && pathname.startsWith(`${TF_API_ENDPOINTS.buildSessions}/`)) {
    const sessionId = pathname.split("/").pop();
    if (!sessionId || !dropBuildSession(tenantId, sessionId)) {
      json(res, 404, {
        error: { code: "build_session_not_found", message: "Build session not found" },
      });
      return true;
    }
    sendNoContent(res);
    return true;
  }

  return false;
}
