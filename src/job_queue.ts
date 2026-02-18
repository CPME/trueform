export type JobState = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type JobError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type JobRecord<T> = {
  id: string;
  state: JobState;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result: T | null;
  error: JobError | null;
};

export type JobContext = {
  updateProgress: (progress: number) => void;
  isCanceled: () => boolean;
  signal: AbortSignal;
  throwIfCanceled: () => void;
};

export type JobTask<T> = (ctx: JobContext) => Promise<T> | T;

export type JobQueueOptions = {
  maxConcurrent?: number;
  defaultTimeoutMs?: number;
  maxRetainedJobs?: number;
  terminalRetentionMs?: number;
};

export type EnqueueOptions = {
  timeoutMs?: number;
};

type JobInternal<T> = {
  record: JobRecord<T>;
  task: JobTask<T>;
  canceled: boolean;
  controller: AbortController;
  inFlight: boolean;
  settled: boolean;
  completedAtMs?: number;
  timeoutMs?: number;
  timeoutId?: ReturnType<typeof setTimeout> | null;
};

export class InMemoryJobQueue {
  private counter = 0;
  private queue: Array<JobInternal<unknown>> = [];
  private jobs = new Map<string, JobInternal<unknown>>();
  private active = 0;
  private maxConcurrent: number;
  private defaultTimeoutMs?: number;
  private maxRetainedJobs: number;
  private terminalRetentionMs: number;

  constructor(options: JobQueueOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 1);
    this.defaultTimeoutMs =
      options.defaultTimeoutMs && options.defaultTimeoutMs > 0
        ? options.defaultTimeoutMs
        : undefined;
    this.maxRetainedJobs = Math.max(1, Math.floor(options.maxRetainedJobs ?? 512));
    this.terminalRetentionMs = Math.max(0, Math.floor(options.terminalRetentionMs ?? 30 * 60 * 1000));
  }

  enqueue<T>(task: JobTask<T>, options: EnqueueOptions = {}): JobRecord<T> {
    const now = new Date().toISOString();
    const id = this.nextId();
    const record: JobRecord<T> = {
      id,
      state: "queued",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      result: null,
      error: null,
    };
    const internal: JobInternal<T> = {
      record,
      task,
      canceled: false,
      controller: new AbortController(),
      inFlight: false,
      settled: false,
      timeoutMs: options.timeoutMs,
      timeoutId: null,
    };
    this.queue.push(internal as JobInternal<unknown>);
    this.jobs.set(id, internal as JobInternal<unknown>);
    this.pump();
    return record;
  }

  get<T>(id: string): JobRecord<T> | undefined {
    this.pruneTerminalJobs();
    const job = this.jobs.get(id) as JobInternal<T> | undefined;
    return job?.record;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.record.state === "queued") {
      this.markCanceled(job);
      this.queue = this.queue.filter((entry) => entry !== job);
      this.pruneTerminalJobs();
      return true;
    }
    if (job.record.state === "running") {
      this.markCanceled(job);
      this.finishJobIfNeeded(job);
      this.pruneTerminalJobs();
      return true;
    }
    return false;
  }

  private nextId(): string {
    this.counter += 1;
    return `job_${Date.now()}_${this.counter}`;
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) return;
      if (next.canceled) continue;
      this.runJob(next);
    }
  }

  private runJob(job: JobInternal<unknown>): void {
    if (job.record.state !== "queued") return;
    this.active += 1;
    job.inFlight = true;
    job.record.state = "running";
    job.record.updatedAt = new Date().toISOString();

    const timeoutMs = job.timeoutMs ?? this.defaultTimeoutMs;
    if (timeoutMs && timeoutMs > 0) {
      job.timeoutId = setTimeout(() => {
        if (job.record.state !== "running") return;
        job.canceled = true;
        job.controller.abort();
        this.markFailed(job, {
          code: "job_timeout",
          message: `Job exceeded timeout of ${timeoutMs}ms`,
        });
        this.finishJobIfNeeded(job);
        this.pruneTerminalJobs();
      }, timeoutMs);
    }

    const ctx: JobContext = {
      updateProgress: (progress) => {
        if (job.record.state !== "running") return;
        const value = Number.isFinite(progress)
          ? Math.max(0, Math.min(1, progress))
          : job.record.progress;
        job.record.progress = value;
        job.record.updatedAt = new Date().toISOString();
      },
      isCanceled: () => job.canceled,
      signal: job.controller.signal,
      throwIfCanceled: () => {
        if (!job.canceled) return;
        throw { code: "job_canceled", message: "Job canceled" };
      },
    };

    Promise.resolve()
      .then(() => job.task(ctx))
      .then((result) => {
        if (job.record.state !== "running") return;
        this.markSucceeded(job, result);
        this.finishJobIfNeeded(job);
        this.pruneTerminalJobs();
      })
      .catch((err) => {
        if (job.record.state !== "running") return;
        this.markFailed(job, normalizeError(err));
        this.finishJobIfNeeded(job);
        this.pruneTerminalJobs();
      });
  }

  private markCanceled(job: JobInternal<unknown>): void {
    job.canceled = true;
    job.controller.abort();
    job.record.state = "canceled";
    job.record.error = null;
    job.record.updatedAt = new Date().toISOString();
    job.completedAtMs = Date.now();
  }

  private markSucceeded(job: JobInternal<unknown>, result: unknown): void {
    job.record.state = "succeeded";
    job.record.progress = 1;
    job.record.result = result as never;
    job.record.error = null;
    job.record.updatedAt = new Date().toISOString();
    job.completedAtMs = Date.now();
  }

  private markFailed(job: JobInternal<unknown>, error: JobError): void {
    job.record.state = "failed";
    job.record.error = error;
    job.record.updatedAt = new Date().toISOString();
    job.completedAtMs = Date.now();
  }

  private finishJobIfNeeded(job: JobInternal<unknown>): void {
    if (job.timeoutId) {
      clearTimeout(job.timeoutId);
      job.timeoutId = null;
    }
    if (!job.inFlight || job.settled) return;
    job.settled = true;
    this.active = Math.max(0, this.active - 1);
    this.pump();
  }

  private pruneTerminalJobs(): void {
    const now = Date.now();
    if (this.terminalRetentionMs > 0) {
      for (const [id, job] of this.jobs) {
        if (!isTerminal(job.record.state)) continue;
        const completedAt = job.completedAtMs;
        if (typeof completedAt !== "number") continue;
        if (now - completedAt < this.terminalRetentionMs) continue;
        if (job.inFlight && !job.settled) continue;
        this.jobs.delete(id);
      }
    }

    if (this.jobs.size <= this.maxRetainedJobs) return;
    const candidates: Array<{ id: string; completedAt: number }> = [];
    for (const [id, job] of this.jobs) {
      if (!isTerminal(job.record.state)) continue;
      if (job.inFlight && !job.settled) continue;
      candidates.push({ id, completedAt: job.completedAtMs ?? 0 });
    }
    candidates.sort((a, b) => a.completedAt - b.completedAt);
    for (const candidate of candidates) {
      if (this.jobs.size <= this.maxRetainedJobs) break;
      this.jobs.delete(candidate.id);
    }
  }
}

function normalizeError(err: unknown): JobError {
  if (err && typeof err === "object") {
    const message = "message" in err ? String((err as { message?: unknown }).message) : "Unknown error";
    const code = "code" in err ? String((err as { code?: unknown }).code) : "job_failed";
    const details = "details" in err && typeof (err as { details?: unknown }).details === "object"
      ? ((err as { details?: Record<string, unknown> }).details ?? undefined)
      : undefined;
    return { code, message, details };
  }
  return { code: "job_failed", message: String(err ?? "Unknown error") };
}

function isTerminal(state: JobState): boolean {
  return state === "succeeded" || state === "failed" || state === "canceled";
}
