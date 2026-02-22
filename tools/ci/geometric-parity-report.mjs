import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const manifestPath = resolve(args.manifest ?? "specs/geometric-benchmark-corpus.json");
const runProbes = args.runProbes;
const failOnProbeFail = args.failOnProbeFail;

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
if (entries.length === 0) {
  console.error(`No entries found in ${manifestPath}`);
  process.exit(1);
}

const stagingWeight = Number(manifest.scoring?.stagingWeight ?? 0.5);
const coverageWeight = Number(manifest.scoring?.compositeWeights?.coverage ?? 0.7);
const reliabilityWeight = Number(manifest.scoring?.compositeWeights?.reliability ?? 0.3);
validateWeights(stagingWeight, coverageWeight, reliabilityWeight);

const counts = {
  ready: 0,
  staging: 0,
  missing: 0,
};

for (const entry of entries) {
  validateEntry(entry);
  counts[entry.parity]++;
}

const weightedCoverage = (counts.ready + stagingWeight * counts.staging) / entries.length;

const probeResults = [];
if (runProbes) {
  for (const entry of entries) {
    if (!entry.probe) continue;
    if (entry.probe.kind !== "dist-test") continue;

    const probePath = resolve(entry.probe.path);
    const startedAt = Date.now();
    const result = spawnSync("node", [probePath], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 10,
    });
    const elapsedMs = Date.now() - startedAt;
    const passed = result.status === 0;
    probeResults.push({
      id: entry.id,
      feature: entry.feature,
      path: entry.probe.path,
      passed,
      elapsedMs,
      status: result.status ?? -1,
      stderr: result.stderr ?? "",
      stdout: result.stdout ?? "",
    });
  }
}

const executedProbeCount = probeResults.length;
const passedProbeCount = probeResults.filter((r) => r.passed).length;
const failedProbeCount = executedProbeCount - passedProbeCount;
const reliability =
  executedProbeCount > 0 ? passedProbeCount / executedProbeCount : Number.NaN;

const composite =
  executedProbeCount > 0
    ? coverageWeight * weightedCoverage + reliabilityWeight * reliability
    : weightedCoverage;

const summary = {
  generatedAt: new Date().toISOString(),
  manifestPath,
  totalEntries: entries.length,
  counts,
  stagingWeight,
  coverageWeight,
  reliabilityWeight,
  weightedCoverage,
  probes: {
    run: runProbes,
    total: executedProbeCount,
    passed: passedProbeCount,
    failed: failedProbeCount,
    reliability: Number.isNaN(reliability) ? null : reliability,
  },
  composite,
  thresholds: {
    minCoverage: args.minCoverage ?? null,
    minReliability: args.minReliability ?? null,
    minComposite: args.minComposite ?? null,
  },
  probeResults: probeResults.map((result) => ({
    id: result.id,
    feature: result.feature,
    path: result.path,
    passed: result.passed,
    elapsedMs: result.elapsedMs,
    status: result.status,
  })),
};

printConsoleSummary(summary, probeResults);

if (args.jsonOut) {
  const outPath = resolve(args.jsonOut);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(`Wrote JSON report: ${outPath}`);
}

if (args.mdOut) {
  const outPath = resolve(args.mdOut);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${renderMarkdown(summary)}\n`, "utf8");
  console.log(`Wrote Markdown report: ${outPath}`);
}

let failed = false;
if (args.minCoverage != null && weightedCoverage < args.minCoverage) {
  console.error(
    `Coverage threshold failed: ${weightedCoverage.toFixed(3)} < ${args.minCoverage.toFixed(3)}`
  );
  failed = true;
}
if (args.minReliability != null) {
  if (Number.isNaN(reliability) || reliability < args.minReliability) {
    console.error(
      `Reliability threshold failed: ${
        Number.isNaN(reliability) ? "n/a" : reliability.toFixed(3)
      } < ${args.minReliability.toFixed(3)}`
    );
    failed = true;
  }
}
if (args.minComposite != null && composite < args.minComposite) {
  console.error(
    `Composite threshold failed: ${composite.toFixed(3)} < ${args.minComposite.toFixed(3)}`
  );
  failed = true;
}
if (failOnProbeFail && failedProbeCount > 0) {
  console.error(`Probe failures: ${failedProbeCount}`);
  failed = true;
}

if (failed) {
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    manifest: undefined,
    runProbes: true,
    failOnProbeFail: false,
    jsonOut: undefined,
    mdOut: undefined,
    minCoverage: undefined,
    minReliability: undefined,
    minComposite: undefined,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--manifest") {
      out.manifest = argv[++i];
      continue;
    }
    if (arg === "--run") {
      out.runProbes = true;
      continue;
    }
    if (arg === "--no-run") {
      out.runProbes = false;
      continue;
    }
    if (arg === "--fail-on-probe-fail") {
      out.failOnProbeFail = true;
      continue;
    }
    if (arg === "--json-out") {
      out.jsonOut = argv[++i];
      continue;
    }
    if (arg === "--md-out") {
      out.mdOut = argv[++i];
      continue;
    }
    if (arg === "--min-coverage") {
      out.minCoverage = parseFloat(argv[++i]);
      continue;
    }
    if (arg === "--min-reliability") {
      out.minReliability = parseFloat(argv[++i]);
      continue;
    }
    if (arg === "--min-composite") {
      out.minComposite = parseFloat(argv[++i]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function validateWeights(stagingWeight, coverageWeight, reliabilityWeight) {
  if (!Number.isFinite(stagingWeight) || stagingWeight < 0 || stagingWeight > 1) {
    throw new Error(`Invalid stagingWeight: ${stagingWeight}`);
  }
  if (!Number.isFinite(coverageWeight) || !Number.isFinite(reliabilityWeight)) {
    throw new Error("Invalid composite weights");
  }
}

function validateEntry(entry) {
  if (!entry?.id) throw new Error("Corpus entry missing id");
  if (!entry?.feature) throw new Error(`Corpus entry ${entry.id} missing feature`);
  if (!entry?.category) throw new Error(`Corpus entry ${entry.id} missing category`);
  if (!["ready", "staging", "missing"].includes(entry?.parity)) {
    throw new Error(`Corpus entry ${entry.id} has invalid parity: ${entry?.parity}`);
  }
  if (entry.probe !== undefined) {
    if (!entry.probe || typeof entry.probe !== "object") {
      throw new Error(`Corpus entry ${entry.id} has invalid probe shape`);
    }
    if (entry.probe.kind !== "dist-test") {
      throw new Error(`Corpus entry ${entry.id} has unsupported probe kind`);
    }
    if (!entry.probe.path || typeof entry.probe.path !== "string") {
      throw new Error(`Corpus entry ${entry.id} probe path is required`);
    }
  }
}

function printConsoleSummary(summary, probeResults) {
  console.log("Geometric parity report");
  console.log(`- Manifest: ${summary.manifestPath}`);
  console.log(`- Generated: ${summary.generatedAt}`);
  console.log(
    `- Coverage: ${summary.weightedCoverage.toFixed(3)} (ready=${summary.counts.ready}, staging=${summary.counts.staging}, missing=${summary.counts.missing}, total=${summary.totalEntries}, stagingWeight=${summary.stagingWeight})`
  );
  if (summary.probes.run) {
    console.log(
      `- Probe reliability: ${
        summary.probes.reliability == null ? "n/a" : summary.probes.reliability.toFixed(3)
      } (${summary.probes.passed}/${summary.probes.total} passing)`
    );
  } else {
    console.log("- Probe reliability: not run");
  }
  console.log(`- Composite: ${summary.composite.toFixed(3)}`);

  const failed = probeResults.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log("Failing probes:");
    for (const item of failed) {
      console.log(`- ${item.id}: ${item.path} (status=${item.status}, ${item.elapsedMs}ms)`);
    }
  }
}

function renderMarkdown(summary) {
  const lines = [];
  lines.push("# Geometric Parity Report");
  lines.push("");
  lines.push(`- Generated: ${summary.generatedAt}`);
  lines.push(`- Manifest: \`${summary.manifestPath}\``);
  lines.push(`- Coverage score: \`${summary.weightedCoverage.toFixed(3)}\``);
  lines.push(
    `- Coverage counts: ready=\`${summary.counts.ready}\`, staging=\`${summary.counts.staging}\`, missing=\`${summary.counts.missing}\`, total=\`${summary.totalEntries}\``
  );
  if (summary.probes.run) {
    lines.push(
      `- Probe reliability: \`${
        summary.probes.reliability == null ? "n/a" : summary.probes.reliability.toFixed(3)
      }\` (\`${summary.probes.passed}/${summary.probes.total}\` passing)`
    );
  } else {
    lines.push("- Probe reliability: `not run`");
  }
  lines.push(`- Composite score: \`${summary.composite.toFixed(3)}\``);
  lines.push("");
  lines.push("## Probes");
  lines.push("");
  lines.push("| id | feature | parity probe | result | elapsed (ms) |");
  lines.push("| --- | --- | --- | --- | ---: |");
  for (const probe of summary.probeResults) {
    lines.push(
      `| ${probe.id} | ${escapeCell(probe.feature)} | \`${probe.path}\` | ${
        probe.passed ? "pass" : "fail"
      } | ${probe.elapsedMs} |`
    );
  }
  if (summary.probeResults.length === 0) {
    lines.push("| n/a | n/a | n/a | not run | 0 |");
  }
  return lines.join("\n");
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
