import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const viewerDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const pidFile = path.join(viewerDir, ".viewer-server.pid");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readPid = async () => {
  try {
    const raw = await fs.readFile(pidFile, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitForExit = async (pid, timeoutMs) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAlive(pid)) {
      return true;
    }
    await sleep(100);
  }
  return !isAlive(pid);
};

const killPreviousServer = async () => {
  const pid = await readPid();
  if (!pid || pid === process.pid) {
    return;
  }
  if (!isAlive(pid)) {
    await fs.rm(pidFile, { force: true });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    await fs.rm(pidFile, { force: true });
    return;
  }
  const exited = await waitForExit(pid, 1500);
  if (!exited) {
    try {
      process.kill(pid, "SIGKILL");
      await waitForExit(pid, 1500);
    } catch {
      // If we can't kill it, leave the pid file alone for visibility.
      return;
    }
  }
  await fs.rm(pidFile, { force: true });
};

const run = (cmd, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...options });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });

const main = async () => {
  await killPreviousServer();

  const exportCode = await run("npm", ["run", "viewer:export", "--", "--pretty", "false"], {
    cwd: repoRoot,
  });
  if (exportCode !== 0) {
    process.exit(exportCode);
  }

  const server = spawn("python3", ["-m", "http.server", "8001"], {
    cwd: viewerDir,
    stdio: "inherit",
  });

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await fs.rm(pidFile, { force: true });
  };

  await fs.writeFile(pidFile, `${server.pid}\n`, "utf8");

  const forward = (signal) => {
    if (server.exitCode == null) {
      server.kill(signal);
    }
  };

  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));

  server.on("exit", async (code) => {
    await cleanup();
    process.exit(code ?? 0);
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
