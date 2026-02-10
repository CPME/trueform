import { readFile } from "node:fs/promises";
import { readTfContainer } from "../../dist/tf/container.js";

const RUNTIME_URL = process.env.TF_RUNTIME_URL || "http://127.0.0.1:8080";
const TFP_PATH = process.env.TF_RUNTIME_TFP || "./tools/viewer/assets/block-basic.tfp";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${url}${text ? `: ${text}` : ""}`);
  }
  return res.json();
}

async function pollJob(jobId) {
  for (let i = 0; i < 180; i += 1) {
    const job = await fetchJson(`${RUNTIME_URL}/v1/jobs/${jobId}`);
    if (["succeeded", "failed", "canceled"].includes(job.state)) return job;
    await sleep(200);
  }
  throw new Error(`Job ${jobId} polling timed out`);
}

async function submitBuild(document, overrides) {
  const payload = {
    irVersion: document.irVersion ?? 1,
    document,
    units: document?.context?.units ?? "mm",
    options: { meshProfile: "interactive" },
    params: overrides,
  };
  const { jobId } = await fetchJson(`${RUNTIME_URL}/v1/build`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!jobId) throw new Error("Missing jobId in build response");
  return jobId;
}

async function loadDocument() {
  const bytes = await readFile(TFP_PATH);
  const { document } = await readTfContainer(bytes);
  if (!document) throw new Error("Missing document in .tfp container");
  return document;
}

async function main() {
  await fetchJson(`${RUNTIME_URL}/v1/capabilities`);

  const document = await loadDocument();

  const overridesA = { w: 60 };
  const overridesB = { w: 90 };

  const jobA = await submitBuild(document, overridesA);
  const resultA = await pollJob(jobA);
  if (resultA.state !== "succeeded") {
    throw new Error(`Build A failed: ${resultA.error?.message || resultA.state}`);
  }

  const jobA2 = await submitBuild(document, overridesA);
  const resultA2 = await pollJob(jobA2);
  if (resultA2.state !== "succeeded") {
    throw new Error(`Build A2 failed: ${resultA2.error?.message || resultA2.state}`);
  }

  const jobB = await submitBuild(document, overridesB);
  const resultB = await pollJob(jobB);
  if (resultB.state !== "succeeded") {
    throw new Error(`Build B failed: ${resultB.error?.message || resultB.state}`);
  }

  const assetA = resultA.result?.mesh?.asset?.url;
  const assetA2 = resultA2.result?.mesh?.asset?.url;
  const assetB = resultB.result?.mesh?.asset?.url;
  const boundsA = resultA.result?.metadata?.bounds;
  const boundsA2 = resultA2.result?.metadata?.bounds;
  const boundsB = resultB.result?.metadata?.bounds;

  console.log(JSON.stringify({
    runtime: RUNTIME_URL,
    tfp: TFP_PATH,
    buildA: {
      jobId: jobA,
      buildId: resultA.result?.buildId,
      mesh: assetA,
      bounds: boundsA,
      overrides: overridesA,
    },
    buildA2: {
      jobId: jobA2,
      buildId: resultA2.result?.buildId,
      mesh: assetA2,
      bounds: boundsA2,
      overrides: overridesA,
    },
    buildB: {
      jobId: jobB,
      buildId: resultB.result?.buildId,
      mesh: assetB,
      bounds: boundsB,
      overrides: overridesB,
    },
    meshReuse: assetA && assetB ? assetA === assetB : false,
    meshReuseSameParams: assetA && assetA2 ? assetA === assetA2 : false,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
