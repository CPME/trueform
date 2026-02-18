import assert from "node:assert/strict";
import { InMemoryJobQueue } from "../job_queue.js";
import { runTests } from "./occt_test_utils.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tests = [
  {
    name: "job queue: cancels queued job",
    fn: async () => {
      const queue = new InMemoryJobQueue({ maxConcurrent: 1 });
      let ranSecond = false;

      queue.enqueue(async () => {
        await sleep(50);
      });
      const second = queue.enqueue(async () => {
        ranSecond = true;
      });

      const canceled = queue.cancel(second.id);
      assert.equal(canceled, true);

      const record = queue.get(second.id);
      assert.equal(record?.state, "canceled");
      await sleep(80);
      assert.equal(ranSecond, false);
    },
  },
  {
    name: "job queue: cancels running job",
    fn: async () => {
      const queue = new InMemoryJobQueue({ maxConcurrent: 1 });
      const job = queue.enqueue(async () => {
        await sleep(80);
      });

      for (let i = 0; i < 20; i += 1) {
        const state = queue.get(job.id)?.state;
        if (state === "running") break;
        await sleep(5);
      }

      const canceled = queue.cancel(job.id);
      assert.equal(canceled, true);
      const record = queue.get(job.id);
      assert.equal(record?.state, "canceled");
    },
  },
  {
    name: "job queue: times out long-running job",
    fn: async () => {
      const queue = new InMemoryJobQueue({ maxConcurrent: 1 });
      const job = queue.enqueue(
        async () => {
          await sleep(60);
        },
        { timeoutMs: 10 }
      );

      let record = queue.get(job.id);
      for (let i = 0; i < 40; i += 1) {
        record = queue.get(job.id);
        if (record?.state === "failed") break;
        await sleep(5);
      }

      assert.equal(record?.state, "failed");
      assert.equal(record?.error?.code, "job_timeout");
    },
  },
  {
    name: "job queue: timeout frees slot for next job",
    fn: async () => {
      const queue = new InMemoryJobQueue({ maxConcurrent: 1 });
      const timedOut = queue.enqueue(
        async ({ signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            });
          }),
        { timeoutMs: 20 }
      );
      const next = queue.enqueue(async () => {
        await sleep(5);
        return 42;
      });

      let nextRecord = queue.get(next.id);
      for (let i = 0; i < 80; i += 1) {
        nextRecord = queue.get(next.id);
        if (nextRecord?.state === "succeeded") break;
        await sleep(5);
      }

      assert.equal(queue.get(timedOut.id)?.state, "failed");
      assert.equal(nextRecord?.state, "succeeded");
      assert.equal(nextRecord?.result, 42);
    },
  },
  {
    name: "job queue: cancellation checkpoint can prevent side effects",
    fn: async () => {
      const queue = new InMemoryJobQueue({ maxConcurrent: 1 });
      let sideEffect = false;
      const job = queue.enqueue(async (ctx) => {
        await sleep(40);
        ctx.throwIfCanceled();
        sideEffect = true;
      });

      for (let i = 0; i < 20; i += 1) {
        if (queue.get(job.id)?.state === "running") break;
        await sleep(5);
      }
      const canceled = queue.cancel(job.id);
      assert.equal(canceled, true);

      await sleep(120);
      assert.equal(queue.get(job.id)?.state, "canceled");
      assert.equal(sideEffect, false);
    },
  },
  {
    name: "job queue: prunes completed records by retention limit",
    fn: async () => {
      const queue = new InMemoryJobQueue({
        maxConcurrent: 1,
        maxRetainedJobs: 2,
        terminalRetentionMs: 60_000,
      });

      const jobs = [
        queue.enqueue(async () => 1),
        queue.enqueue(async () => 2),
        queue.enqueue(async () => 3),
      ];

      for (const job of jobs) {
        for (let i = 0; i < 80; i += 1) {
          const record = queue.get(job.id);
          if (record?.state === "succeeded") break;
          await sleep(5);
        }
      }

      // Trigger prune on read and verify oldest completion was evicted.
      void queue.get(jobs[2]?.id ?? "");
      assert.equal(queue.get(jobs[0]?.id ?? ""), undefined);
      assert.equal(queue.get(jobs[1]?.id ?? "")?.state, "succeeded");
      assert.equal(queue.get(jobs[2]?.id ?? "")?.state, "succeeded");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
