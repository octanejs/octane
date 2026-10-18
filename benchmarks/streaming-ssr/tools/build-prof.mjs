// Unminified, fully inlined build of the Solid streaming-ssr fixture (every
// dependency bundled, names kept) for profiling by function: dist-prof/solid.
// The harness's own build keeps @solidjs/web external; this one inlines it so
// the profiler attributes frames to the runtime's source names.
//   node tools/build-prof.mjs [--out=dist-prof]
import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (process.argv.find(a => a.startsWith("--out=")) || "--out=dist-prof").slice(6);
process.env.NODE_ENV = "production";
await build({
  root: path.join(here, "..", "solid"),
  logLevel: "warn",
  build: { ssr: "src/entry-server.ts", outDir: path.join(here, "..", out, "solid"), emptyOutDir: true, minify: false, target: "esnext" },
  ssr: { noExternal: true },
  define: { "process.env.NODE_ENV": '"production"' }
});
console.log("built", path.join(out, "solid/entry-server.js"));
