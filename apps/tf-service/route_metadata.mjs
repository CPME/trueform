import { TF_API_ENDPOINTS } from "../../dist/api.js";

export async function tryHandleMetadataRoute(ctx) {
  const { req, res, pathname, tenantId, json, getCapabilitiesPayload, runtimeHealthPayload, getOpenApiPayload } =
    ctx;

  if (req.method === "GET" && pathname === TF_API_ENDPOINTS.capabilities) {
    json(res, 200, await getCapabilitiesPayload(tenantId));
    return true;
  }

  if (req.method === "GET" && pathname === TF_API_ENDPOINTS.health) {
    json(res, 200, await runtimeHealthPayload(tenantId));
    return true;
  }

  if (req.method === "GET" && pathname === TF_API_ENDPOINTS.openapi) {
    json(res, 200, getOpenApiPayload());
    return true;
  }

  return false;
}
