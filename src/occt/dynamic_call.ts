export type DynamicMethodAttempt = {
  name: string;
  args: unknown[];
};

export function tryDynamicMethod(
  target: unknown,
  attempts: DynamicMethodAttempt[]
): boolean {
  if (!target || typeof target !== "object") return false;
  const record = target as Record<string, unknown>;
  for (const attempt of attempts) {
    const method = record[attempt.name];
    if (typeof method !== "function") continue;
    try {
      method.apply(target, attempt.args);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}
