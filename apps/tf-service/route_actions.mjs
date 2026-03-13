import { TF_API_ENDPOINTS } from "../../dist/api.js";

export async function tryHandleActionRoute(ctx) {
  const {
    req,
    res,
    pathname,
    tenantId,
    json,
    readJson,
    enqueueBuild,
    enqueueAssemblySolve,
    handleMeasure,
    enqueueMesh,
    enqueueExport,
    toJobAccepted,
  } = ctx;

  if (
    req.method === "POST" &&
    (pathname === TF_API_ENDPOINTS.build ||
      pathname === TF_API_ENDPOINTS.buildJobs ||
      pathname === TF_API_ENDPOINTS.buildPartial ||
      pathname === TF_API_ENDPOINTS.buildPartialJobs)
  ) {
    const payload = await readJson(req);
    const job = await enqueueBuild(tenantId, payload);
    json(res, 202, toJobAccepted(job));
    return true;
  }

  if (
    req.method === "POST" &&
    (pathname === TF_API_ENDPOINTS.assemblySolve ||
      pathname === TF_API_ENDPOINTS.assemblySolveJobs)
  ) {
    const payload = await readJson(req);
    const job = await enqueueAssemblySolve(tenantId, payload);
    json(res, 202, toJobAccepted(job));
    return true;
  }

  if (req.method === "POST" && pathname === TF_API_ENDPOINTS.measure) {
    const payload = await readJson(req);
    json(res, 200, await handleMeasure(tenantId, payload));
    return true;
  }

  if (
    req.method === "POST" &&
    (pathname === TF_API_ENDPOINTS.mesh || pathname === TF_API_ENDPOINTS.meshJobs)
  ) {
    const payload = await readJson(req);
    const job = await enqueueMesh(tenantId, payload);
    json(res, 202, toJobAccepted(job));
    return true;
  }

  if (
    req.method === "POST" &&
    (pathname === TF_API_ENDPOINTS.exportStep || pathname === TF_API_ENDPOINTS.exportStepJobs)
  ) {
    const payload = await readJson(req);
    const job = await enqueueExport(tenantId, payload, "step");
    json(res, 202, toJobAccepted(job));
    return true;
  }

  if (
    req.method === "POST" &&
    (pathname === TF_API_ENDPOINTS.exportStl || pathname === TF_API_ENDPOINTS.exportStlJobs)
  ) {
    const payload = await readJson(req);
    const job = await enqueueExport(tenantId, payload, "stl");
    json(res, 202, toJobAccepted(job));
    return true;
  }

  return false;
}
