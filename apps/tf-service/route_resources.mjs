export async function tryHandleResourceRoute(ctx) {
  const {
    req,
    res,
    url,
    pathname,
    tenantId,
    json,
    text,
    bytes,
    streamMeshAssetChunks,
    writeSse,
    getJob,
    cancelJob,
    assertTenantJobAccess,
    toJobRecordEnvelope,
    getAsset,
    getArtifact,
    getMetricsPayload,
  } = ctx;

  if (req.method === "GET" && pathname.startsWith("/v1/jobs/") && pathname.endsWith("/stream")) {
    const parts = pathname.split("/");
    const jobId = parts[3];
    if (!jobId) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    assertTenantJobAccess(tenantId, jobId);
    const job = getJob(jobId);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "access-control-allow-origin": "*",
    });
    writeSse(res, "job", toJobRecordEnvelope(job));
    let lastUpdatedAt = job.updatedAt;
    const timer = setInterval(() => {
      const current = getJob(jobId);
      if (!current) return;
      if (current.updatedAt !== lastUpdatedAt) {
        lastUpdatedAt = current.updatedAt;
        writeSse(res, "job", toJobRecordEnvelope(current));
      }
      if (
        current.state === "succeeded" ||
        current.state === "failed" ||
        current.state === "canceled"
      ) {
        writeSse(res, "end", toJobRecordEnvelope(current));
        clearInterval(timer);
        res.end();
      }
    }, 200);
    req.on("close", () => {
      clearInterval(timer);
    });
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/v1/jobs/")) {
    const jobId = pathname.split("/").pop();
    assertTenantJobAccess(tenantId, jobId);
    const job = getJob(jobId);
    if (!job) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    json(res, 200, toJobRecordEnvelope(job));
    return true;
  }

  if (req.method === "DELETE" && pathname.startsWith("/v1/jobs/")) {
    const jobId = pathname.split("/").pop();
    assertTenantJobAccess(tenantId, jobId);
    const canceled = cancelJob(jobId);
    const job = getJob(jobId);
    if (!job && !canceled) {
      json(res, 404, { error: "Job not found" });
      return true;
    }
    json(
      res,
      200,
      toJobRecordEnvelope(
        job ?? {
          id: jobId,
          jobId,
          state: canceled ? "canceled" : "unknown",
          progress: canceled ? 1 : 0,
          createdAt: "",
          updatedAt: "",
          result: null,
          error: null,
        }
      )
    );
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/v1/assets/mesh/") && pathname.endsWith("/chunks")) {
    const parts = pathname.split("/");
    const id = parts.length >= 5 ? parts[4] : null;
    const asset = id ? getAsset(id) : null;
    if (!asset || asset.tenantId !== tenantId) {
      text(res, 404, "Asset not found");
      return true;
    }
    const requestedChunkSize = Number(url.searchParams.get("chunkSize") ?? "");
    streamMeshAssetChunks(res, asset, requestedChunkSize);
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/v1/assets/mesh/")) {
    const id = pathname.split("/").pop();
    const asset = id ? getAsset(id) : null;
    if (!asset || asset.tenantId !== tenantId) {
      text(res, 404, "Asset not found");
      return true;
    }
    bytes(res, 200, asset.data, asset.contentType);
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/v1/assets/export/")) {
    const id = pathname.split("/").pop();
    const asset = id ? getAsset(id) : null;
    if (!asset || asset.tenantId !== tenantId) {
      text(res, 404, "Asset not found");
      return true;
    }
    bytes(res, 200, asset.data, asset.contentType);
    return true;
  }

  if (req.method === "GET" && pathname.startsWith("/v1/artifacts/")) {
    const id = pathname.split("/").pop();
    const artifact = id ? getArtifact(id) : null;
    if (!artifact || artifact.tenantId !== tenantId) {
      json(res, 404, { error: "Artifact not found" });
      return true;
    }
    json(res, 200, artifact);
    return true;
  }

  if (req.method === "GET" && pathname === "/v1/metrics") {
    json(res, 200, getMetricsPayload(tenantId));
    return true;
  }

  return false;
}
