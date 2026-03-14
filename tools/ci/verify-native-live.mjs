import { spawn } from "node:child_process";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env,
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

await run("npm", ["run", "build", "--", "--pretty", "false"]);
await run("make", ["-C", "native/occt_server/build"]);
await run("node", ["dist/tests/occt_native_http.e2e.test.js"]);
await run(
  "node",
  ["dist/tests/occt_native_server_pmi.e2e.test.js"],
  { ...process.env, TF_NATIVE_SERVER: "1" }
);
await run(
  "node",
  ["dist/tests/occt_native_server_parity.e2e.test.js"],
  { ...process.env, TF_NATIVE_SERVER: "1" }
);
