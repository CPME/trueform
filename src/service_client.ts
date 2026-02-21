import {
  TF_API_ENDPOINTS,
  type RuntimeAssemblySolveRequest,
  type RuntimeBuildRequest,
  type RuntimeJobAccepted,
  type RuntimeJobRecord,
  type RuntimeJobState,
  type RuntimeMeasureRequest,
  type RuntimeMeasureResponse,
} from "./api.js";

export type JobState = RuntimeJobState;

export type ServiceJob<T = unknown> = RuntimeJobRecord<T>;

export type ServiceJobAccepted = RuntimeJobAccepted;

export type PollJobOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type StreamJobOptions = {
  signal?: AbortSignal;
};

export type TfServiceClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  tenantId?: string;
  headers?: Record<string, string>;
};

type HttpMethod = "GET" | "POST" | "DELETE";

type StreamJobEvent<T = unknown> = {
  event: string;
  data: ServiceJob<T>;
};

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const TENANT_HEADER = "x-tf-tenant-id";

export class TfServiceClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private tenantId?: string;
  private baseHeaders: Record<string, string>;

  constructor(options: TfServiceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
    this.tenantId = options.tenantId;
    this.baseHeaders = { ...(options.headers ?? {}) };
  }

  setTenant(tenantId: string | undefined): void {
    this.tenantId = tenantId;
  }

  async capabilities<T = unknown>(): Promise<T> {
    return this.requestJson<T>({ method: "GET", path: TF_API_ENDPOINTS.capabilities });
  }

  async createDocument<T = unknown>(document: unknown): Promise<T> {
    return this.requestJson<T>({
      method: "POST",
      path: TF_API_ENDPOINTS.documents,
      body: { document },
    });
  }

  async getDocument<T = unknown>(docId: string): Promise<T> {
    return this.requestJson<T>({
      method: "GET",
      path: `${TF_API_ENDPOINTS.documents}/${encodeURIComponent(docId)}`,
    });
  }

  async createBuildSession<T = { sessionId: string; createdAt: string; expiresAt: string }>(): Promise<T> {
    return this.requestJson<T>({
      method: "POST",
      path: TF_API_ENDPOINTS.buildSessions,
      body: {},
    });
  }

  async deleteBuildSession(sessionId: string): Promise<void> {
    await this.requestJson<Record<string, unknown>>({
      method: "DELETE",
      path: `${TF_API_ENDPOINTS.buildSessions}/${encodeURIComponent(sessionId)}`,
    });
  }

  async build(payload: RuntimeBuildRequest): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.build,
      body: payload,
    });
  }

  async buildJob(payload: RuntimeBuildRequest): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.buildJobs,
      body: payload,
    });
  }

  async buildPartial(payload: RuntimeBuildRequest): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.buildPartial,
      body: payload,
    });
  }

  async assemblySolve(payload: RuntimeAssemblySolveRequest): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.assemblySolve,
      body: payload,
    });
  }

  async assemblySolveJob(payload: RuntimeAssemblySolveRequest): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.assemblySolveJobs,
      body: payload,
    });
  }

  async mesh(payload: unknown): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.mesh,
      body: payload,
    });
  }

  async exportStep(payload: unknown): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.exportStep,
      body: payload,
    });
  }

  async exportStl(payload: unknown): Promise<ServiceJobAccepted> {
    return this.requestJson<ServiceJobAccepted>({
      method: "POST",
      path: TF_API_ENDPOINTS.exportStl,
      body: payload,
    });
  }

  async getJob<T = unknown>(jobId: string): Promise<ServiceJob<T>> {
    const job = await this.requestJson<ServiceJob<T>>({
      method: "GET",
      path: `${TF_API_ENDPOINTS.jobs}/${encodeURIComponent(jobId)}`,
    });
    return normalizeServiceJob(job);
  }

  async cancelJob<T = unknown>(jobId: string): Promise<ServiceJob<T> | Record<string, unknown>> {
    const payload = await this.requestJson<ServiceJob<T> | Record<string, unknown>>({
      method: "DELETE",
      path: `${TF_API_ENDPOINTS.jobs}/${encodeURIComponent(jobId)}`,
    });
    if (isJobLike(payload)) return normalizeServiceJob(payload);
    return payload;
  }

  async pollJob<T = unknown>(jobId: string, options: PollJobOptions = {}): Promise<ServiceJob<T>> {
    const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (options.signal?.aborted) {
        throw new Error("poll_job_aborted");
      }
      const job = await this.getJob<T>(jobId);
      if (isTerminalState(job.state)) return job;
      await sleep(intervalMs);
    }
    throw new Error(`poll_job_timeout: exceeded ${timeoutMs}ms`);
  }

  async *streamJob<T = unknown>(
    jobId: string,
    options: StreamJobOptions = {}
  ): AsyncGenerator<StreamJobEvent<T>, void, void> {
    const response = await this.requestRaw({
      method: "GET",
      path: `${TF_API_ENDPOINTS.jobs}/${encodeURIComponent(jobId)}/stream`,
      signal: options.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} for /v1/jobs/${jobId}/stream${text ? `: ${text}` : ""}`
      );
    }
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("stream_job_failed: missing response body reader");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      if (options.signal?.aborted) {
        reader.cancel().catch(() => undefined);
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const parsed = parseSseChunk<T>(chunk);
        if (!parsed) continue;
        yield parsed;
        if (parsed.event === "end" || isTerminalState(parsed.data.state)) {
          return;
        }
      }
    }
  }

  async getAssetJson<T = unknown>(assetUrl: string): Promise<T> {
    const response = await this.requestRaw({
      method: "GET",
      path: assetUrl,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} for ${assetUrl}${text ? `: ${text}` : ""}`);
    }
    return response.json() as Promise<T>;
  }

  async getArtifact<T = unknown>(artifactId: string): Promise<T> {
    return this.requestJson<T>({
      method: "GET",
      path: `${TF_API_ENDPOINTS.artifacts}/${encodeURIComponent(artifactId)}`,
    });
  }

  async metrics<T = unknown>(): Promise<T> {
    return this.requestJson<T>({ method: "GET", path: TF_API_ENDPOINTS.metrics });
  }

  async health<T = unknown>(): Promise<T> {
    return this.requestJson<T>({ method: "GET", path: TF_API_ENDPOINTS.health });
  }

  async measure(payload: RuntimeMeasureRequest): Promise<RuntimeMeasureResponse> {
    return this.requestJson<RuntimeMeasureResponse>({
      method: "POST",
      path: TF_API_ENDPOINTS.measure,
      body: payload,
    });
  }

  private async requestJson<T>(req: {
    method: HttpMethod;
    path: string;
    body?: unknown;
    signal?: AbortSignal;
  }): Promise<T> {
    const response = await this.requestRaw(req);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} for ${req.path}${text ? `: ${text}` : ""}`
      );
    }
    if (response.status === 204) {
      return {} as T;
    }
    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private requestRaw(req: {
    method: HttpMethod;
    path: string;
    body?: unknown;
    signal?: AbortSignal;
  }): Promise<Response> {
    const path = req.path.startsWith("/") ? req.path : `/${req.path}`;
    const url = path.startsWith("/v1/") ? `${this.baseUrl}${path}` : `${this.baseUrl}${path}`;
    const headers: Record<string, string> = { ...this.baseHeaders };
    if (this.tenantId) headers[TENANT_HEADER] = this.tenantId;
    const init: RequestInit = {
      method: req.method,
      headers,
      signal: req.signal,
    };
    if (req.body !== undefined) {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      init.body = JSON.stringify(req.body);
    }
    return this.fetchImpl(url, init);
  }
}

function isTerminalState(state: JobState): boolean {
  return state === "succeeded" || state === "failed" || state === "canceled";
}

function parseSseChunk<T>(chunk: string): StreamJobEvent<T> | null {
  const lines = chunk
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0) return null;
  const dataText = dataLines.join("\n");
  const data = normalizeServiceJob(JSON.parse(dataText) as ServiceJob<T>);
  return { event, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJobLike(
  value: unknown
): value is Partial<ServiceJob<unknown>> & { state: unknown; id?: unknown; jobId?: unknown } {
  if (!value || typeof value !== "object") return false;
  return "state" in value && ("id" in value || "jobId" in value);
}

function normalizeServiceJob<T>(
  job: Partial<ServiceJob<T>> & { id?: unknown; jobId?: unknown }
): ServiceJob<T> {
  const id = String((job as { id?: unknown }).id ?? (job as { jobId?: unknown }).jobId ?? "");
  const jobId = String(
    (job as { jobId?: unknown }).jobId ?? (job as { id?: unknown }).id ?? ""
  );
  return {
    ...job,
    state: (job.state as JobState | undefined) ?? "queued",
    progress: typeof job.progress === "number" ? job.progress : 0,
    createdAt: String(job.createdAt ?? ""),
    updatedAt: String(job.updatedAt ?? ""),
    result: (job.result as T | null | undefined) ?? null,
    error: (job.error as ServiceJob<T>["error"] | undefined) ?? null,
    id,
    jobId,
  };
}
