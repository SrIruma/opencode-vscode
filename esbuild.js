const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const common = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

async function build() {
  if (watch) {
    const ctx = await esbuild.context(common);
    await ctx.watch();
    console.log("Watching for changes...");
    return;
  }
  await esbuild.build(common);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
