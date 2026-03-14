import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const cwd = resolve(".");

const commands = [
  ["npm", ["run", "build", "--", "--pretty", "false"]],
  ["npx", ["tsc", "-p", "packages/tf-core/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-core/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-dsl/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-dsl/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-export/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-export/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-api/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-api/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-service-client/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-service-client/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-backend-ocjs/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-backend-ocjs/tsconfig.build.json"]],
  ["npx", ["tsc", "-p", "packages/tf-backend-native/tsconfig.json"]],
  ["npx", ["tsc", "-p", "packages/tf-backend-native/tsconfig.build.json"]],
  ["node", ["dist/tests/workspace_core_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_core_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_dsl_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_dsl_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_export_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_export_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_api_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_api_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_service_client_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_service_client_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_backend_ocjs_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_backend_ocjs_surface_parity.e2e.test.js"]],
  ["node", ["dist/tests/workspace_backend_native_entrypoint.e2e.test.js"]],
  ["node", ["dist/tests/workspace_backend_native_surface_parity.e2e.test.js"]],
];

for (const [bin, args] of commands) {
  const display = [bin, ...args].join(" ");
  console.log(`\n[verify:workspace-packages] ${display}`);
  const result = spawnSync(bin, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("\nWorkspace package verification passed.");
