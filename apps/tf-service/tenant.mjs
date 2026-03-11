export function tenantScopedKey(tenantId, id) {
  return `${tenantId}::${id}`;
}

export function normalizeTenantId(value, options) {
  const { defaultTenant, makeError } = options;
  if (typeof value !== "string" || value.trim().length === 0) return defaultTenant;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(trimmed)) {
    throw makeError(
      400,
      "invalid_tenant_id",
      "Tenant id must match [A-Za-z0-9._:-]{1,64}"
    );
  }
  return trimmed;
}

export function getTenantId(req, url, options) {
  const { tenantHeader, defaultTenant, makeError } = options;
  const headerValue = req.headers[tenantHeader];
  const headerTenant = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const queryTenant = url.searchParams.get("tenantId");
  return normalizeTenantId(headerTenant ?? queryTenant ?? defaultTenant, {
    defaultTenant,
    makeError,
  });
}

export function countTenantInStore(store, tenantId) {
  let count = 0;
  for (const value of store.values()) {
    if (value?.tenantId === tenantId) count += 1;
  }
  return count;
}
