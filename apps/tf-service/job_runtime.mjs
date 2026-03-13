export function createJobRuntime(options) {
  const {
    jobQueue,
    jobOwners,
    jobLatencyStats,
    pruneJobOwners,
    assertTenantQuota,
    countPendingJobsForTenant,
    maxPendingJobsPerTenant,
    recordLatency,
    makeHttpError,
    handleBuild,
    handleMesh,
    handleAssemblySolve,
    handleExport,
  } = options;

  async function enqueueJob(tenantId, kind, handler, payload, timeoutMs) {
    pruneJobOwners();
    assertTenantQuota(
      tenantId,
      "pending_jobs_per_tenant",
      maxPendingJobsPerTenant,
      countPendingJobsForTenant(tenantId)
    );
    const bucket = jobLatencyStats[kind];
    const job = jobQueue.enqueue(
      async (ctx) => {
        const startedAtMs = Date.now();
        try {
          const result = await handler(tenantId, payload, ctx);
          recordLatency(bucket, Date.now() - startedAtMs, "succeeded");
          return result;
        } catch (err) {
          const code =
            err && typeof err === "object" && typeof err.code === "string" ? err.code : null;
          const state = code === "job_canceled" ? "canceled" : "failed";
          recordLatency(bucket, Date.now() - startedAtMs, state, code);
          throw err;
        }
      },
      timeoutMs ? { timeoutMs } : {}
    );
    jobOwners.set(job.id, { tenantId, completedAtMs: null });
    return job;
  }

  function enqueueBuild(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
    return enqueueJob(tenantId, "build", handleBuild, payload, timeoutMs);
  }

  function enqueueMesh(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs;
    return enqueueJob(tenantId, "mesh", handleMesh, payload, timeoutMs);
  }

  function enqueueAssemblySolve(tenantId, payload) {
    const timeoutMs = payload?.timeoutMs ?? payload?.options?.timeoutMs;
    return enqueueJob(tenantId, "assemblySolve", handleAssemblySolve, payload, timeoutMs);
  }

  function enqueueExport(tenantId, payload, kind) {
    const timeoutMs = payload?.timeoutMs;
    const metricKind = kind === "step" ? "exportStep" : "exportStl";
    return enqueueJob(
      tenantId,
      metricKind,
      (ownerTenantId, request, ctx) => handleExport(ownerTenantId, request, kind, ctx),
      payload,
      timeoutMs
    );
  }

  function assertTenantJobAccess(tenantId, jobId) {
    pruneJobOwners();
    const owner = jobOwners.get(jobId);
    if (!owner || owner.tenantId !== tenantId) {
      throw makeHttpError(404, "job_not_found", "Job not found");
    }
  }

  function toJobRecordEnvelope(record) {
    if (!record || typeof record !== "object") return record;
    const id = String(record.id ?? record.jobId ?? "");
    const jobId = String(record.jobId ?? record.id ?? "");
    return {
      ...record,
      id,
      jobId,
    };
  }

  function toJobAccepted(record) {
    const job = toJobRecordEnvelope(record);
    return {
      id: job.id,
      jobId: job.jobId,
      state: job.state,
    };
  }

  return {
    enqueueBuild,
    enqueueMesh,
    enqueueAssemblySolve,
    enqueueExport,
    assertTenantJobAccess,
    toJobRecordEnvelope,
    toJobAccepted,
  };
}
