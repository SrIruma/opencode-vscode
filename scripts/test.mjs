import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

rmSync(".test-out", { recursive: true, force: true });
mkdirSync(".test-out", { recursive: true });

// Bundle each test file so extension-less imports resolve (like the SDK).
for (const [name, entry] of [
  ["patch.test.mjs", "test/patch.test.mjs"],
  ["extension.test.mjs", "test/extension.test.mjs"],
]) {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `.test-out/${name}`,
    logLevel: "warning",
    define: {
      "process.env.NODE_ENV": '"test"',
    },
  });
}

const result = spawnSync("node", ["--test", ".test-out"], { stdio: "inherit" });
process.exit(result.status ?? 1);
