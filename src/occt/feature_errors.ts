import { BackendError } from "../errors.js";

export function occtFeatureError(
  code: string,
  feature: { id: string; kind: string },
  message: string,
  details?: Record<string, unknown>
): BackendError {
  return new BackendError(code, message, {
    featureId: feature.id,
    featureKind: feature.kind,
    ...(details ?? {}),
  });
}
