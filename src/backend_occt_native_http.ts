import type { MeshData } from "./backend.js";
import type {
  NativeExecFeatureRequest,
  NativeExecFeatureResponse,
  NativeExportPmiRequest,
  NativeExportRequest,
  NativeMeshRequest,
  NativeOcctTransport,
  NativeStlExportRequest,
} from "./backend_occt_native.js";

export type FetchLike = (
  input: RequestInfo,
  init?: RequestInit
) => Promise<Response>;

export type HttpOcctTransportOptions = {
  baseUrl: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export class HttpOcctTransport implements NativeOcctTransport {
  private baseUrl: string;
  private fetcher: FetchLike;
  private headers: Record<string, string>;
  private timeoutMs?: number;

  constructor(options: HttpOcctTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetcher =
      options.fetch ??
      ((globalThis.fetch as FetchLike | undefined) ??
        (() => {
          throw new Error("HttpOcctTransport requires a fetch implementation");
        }));
    this.headers = options.headers ?? {};
    this.timeoutMs = options.timeoutMs;
  }

  async execFeature(
    request: NativeExecFeatureRequest
  ): Promise<NativeExecFeatureResponse> {
    return this.postJson<NativeExecFeatureResponse>("/v1/exec-feature", request);
  }

  async mesh(request: NativeMeshRequest): Promise<MeshData> {
    return this.postJson<MeshData>("/v1/mesh", request);
  }

  async exportStep(request: NativeExportRequest): Promise<Uint8Array> {
    return this.postBinary("/v1/export-step", request);
  }

  async exportStepWithPmi(request: NativeExportPmiRequest): Promise<Uint8Array> {
    return this.postBinary("/v1/export-step-pmi", request);
  }

  async exportStl(request: NativeStlExportRequest): Promise<Uint8Array> {
    return this.postBinary("/v1/export-stl", request);
  }

  private async postJson<T>(path: string, payload: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(this.buildUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify(payload),
    });
    await assertOk(response, path);
    return (await response.json()) as T;
  }

  private async postBinary(path: string, payload: unknown): Promise<Uint8Array> {
    const response = await this.fetchWithTimeout(this.buildUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify(payload),
    });
    await assertOk(response, path);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private buildUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private async fetchWithTimeout(
    input: RequestInfo,
    init: RequestInit
  ): Promise<Response> {
    if (!this.timeoutMs) return this.fetcher(input, init);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function assertOk(response: Response, path: string): Promise<void> {
  if (response.ok) return;
  let details = "";
  try {
    details = await response.text();
  } catch {
    details = "";
  }
  const suffix = details ? `: ${details}` : "";
  throw new Error(`HTTP transport ${path} failed with ${response.status}${suffix}`);
}
