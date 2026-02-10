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
};

export type JobTask<T> = (ctx: JobContext) => Promise<T> | T;

export type JobQueueOptions = {
  maxConcurrent?: number;
  defaultTimeoutMs?: number;
};

export type EnqueueOptions = {
  timeoutMs?: number;
};

type JobInternal<T> = {
  record: JobRecord<T>;
  task: JobTask<T>;
  canceled: boolean;
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

  constructor(options: JobQueueOptions = {}) {
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 1);
    this.defaultTimeoutMs =
      options.defaultTimeoutMs && options.defaultTimeoutMs > 0
        ? options.defaultTimeoutMs
        : undefined;
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
      timeoutMs: options.timeoutMs,
      timeoutId: null,
    };
    this.queue.push(internal as JobInternal<unknown>);
    this.jobs.set(id, internal as JobInternal<unknown>);
    this.pump();
    return record;
  }

  get<T>(id: string): JobRecord<T> | undefined {
    const job = this.jobs.get(id) as JobInternal<T> | undefined;
    return job?.record;
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.record.state === "queued") {
      job.canceled = true;
      job.record.state = "canceled";
      job.record.updatedAt = new Date().toISOString();
      this.queue = this.queue.filter((entry) => entry !== job);
      return true;
    }
    if (job.record.state === "running") {
      job.canceled = true;
      job.record.state = "canceled";
      job.record.updatedAt = new Date().toISOString();
      if (job.timeoutId) {
        clearTimeout(job.timeoutId);
        job.timeoutId = null;
      }
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
    this.active += 1;
    job.record.state = "running";
    job.record.updatedAt = new Date().toISOString();

    const timeoutMs = job.timeoutMs ?? this.defaultTimeoutMs;
    if (timeoutMs && timeoutMs > 0) {
      job.timeoutId = setTimeout(() => {
        if (job.record.state !== "running") return;
        job.canceled = true;
        job.record.state = "failed";
        job.record.error = {
          code: "job_timeout",
          message: `Job exceeded timeout of ${timeoutMs}ms`,
        };
        job.record.updatedAt = new Date().toISOString();
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
    };

    Promise.resolve()
      .then(() => job.task(ctx))
      .then((result) => {
        if (job.record.state !== "running") return;
        job.record.state = "succeeded";
        job.record.progress = 1;
        job.record.result = result as never;
        job.record.updatedAt = new Date().toISOString();
      })
      .catch((err) => {
        if (job.record.state !== "running") return;
        job.record.state = "failed";
        job.record.error = normalizeError(err);
        job.record.updatedAt = new Date().toISOString();
      })
      .finally(() => {
        if (job.timeoutId) {
          clearTimeout(job.timeoutId);
          job.timeoutId = null;
        }
        this.active -= 1;
        this.pump();
      });
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
