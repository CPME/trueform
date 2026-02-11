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
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
