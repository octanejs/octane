// Shell (first-chunk) CPU profile for the Solid streaming-ssr fixture.
// Drives dist/solid/entry-server.js the way run.mjs does, with the V8
// profiler attached in-process (node:inspector) at a fine sampling interval,
// and attributes only the samples between a sentinel spun just before
// renderStream() and one spun inside the first onChunk — i.e. the path from
// render start to the first write. Everything after the shell (fragment
// resolution, stream end) is excluded.
//
//   node tools/shell-prof.mjs [--scenario=staggered|all-fast] [--reps=300]
//        [--interval=20] [--top=35] [--warmup=60]
//
// The fixture bundle must be current: the harness rebuilds dist/ on every
// run (`node run.mjs 1` builds every target; see --no-build).
import { Session } from "node:inspector";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a === undefined ? d : a.slice(n.length + 3); };
const SCENARIO = arg("scenario", "staggered");
const REPS = Number(arg("reps", "300"));
const INTERVAL = Number(arg("interval", "20"));
const TOP = Number(arg("top", "35"));
const WARMUP = Number(arg("warmup", "60"));
const TARGET = arg("target", "solid");            // any dist/<target>/entry-server.js
const PRESPIN = Number(arg("prespin", "0"));      // ms of busy-wait right before each render, OUTSIDE the timing
const MODE = arg("mode", "both");                 // time | both
const DIST = arg("dist", "dist");                 // bundle dir under the suite (e.g. dist-prof for an unminified build)
const PREALLOC = Number(arg("prealloc", "0")); // thousands of small objects allocated (and dropped) right before each render, OUTSIDE the timing: warms the new space after an idle gap
const PREWARM = arg("prewarm", "");          // "sync": run the fixture's synchronous render pass (createBenchmarkStream, unpiped) right before each timed render, no idle gap — warms the render's own code/data; "allfast": a full untimed all-fast render first
const UNDER = arg("under", "");            // also attribute the samples whose stack contains this function (a subtree table)
const PROBE = arg("probe", "0") === "1";          // time a fixed integer loop before each render: a slow-core / cold-cache tell
if (arg("nostack", "0") === "1") Error.stackTraceLimit = 0; // experiment: what do Error stack captures cost on this path?
const MARKS = arg("marks", "0") === "1";          // the bundle under --dist carries __mark() hops (dist-marks): report per-hop medians
const PIN = arg("pin", "0") === "1";              // keep a Worker spinning so the main thread stays on a performance core (the harness default since 2026-10-16)
import { Worker } from "node:worker_threads";
const keepBusy = PIN ? new Worker("for(;;){}", { eval: true }) : null;
const exit = async code => { if (keepBusy) await keepBusy.terminate(); process.exit(code); };
process.env.NODE_ENV = "production";              // the harness sets this before importing the bundles

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.join(here, "..", DIST, TARGET, "entry-server.js")).href);

function __SHELL_START() { const t = performance.now(); while (performance.now() - t < 0.2); }
function __SHELL_END() { const t = performance.now(); while (performance.now() - t < 0.2); }

function spin(ms) { const t = performance.now(); while (performance.now() - t < ms); }
let allocSink = null;
function prealloc(k) { const a = new Array(k * 1000); for (let i = 0; i < a.length; i++) a[i] = { i, s: "x" + i, n: [i] }; allocSink = a.length; }
// Fixed-work probe: 2e5 iterations of integer arithmetic; its wall time tracks
// the core the thread is on (and its clock), not the render.
let probeSink = 0;
function probe() { const t = performance.now(); let x = 1; for (let i = 0; i < 200000; i++) x = (x * 1103515245 + 12345) & 0x7fffffff; probeSink ^= x; return performance.now() - t; }
const probes = [];
// Per-render hop records: label → ms since t0 (first occurrence), plus the
// attempt count and the span of the drain (first → last attempt).
const hopRuns = [];
async function renderOnce(withSentinels) {
  let first = -1, chunks = 0;
  if (PRESPIN > 0) spin(PRESPIN);
  if (PREALLOC > 0) prealloc(PREALLOC);
  if (PREWARM === "allfast") await mod.renderStream("all-fast", () => {});
  else if (PREWARM === "sync") { const w = mod.createBenchmarkStream("all-fast"); allocSink = w ? 1 : 0; }
  if (PROBE) probes.push(probe());
  const marks = MARKS ? (globalThis.__SHELL_MARKS__ = []) : null;
  const t0 = performance.now();
  if (withSentinels) __SHELL_START();
  let firstAt = -1;
  await mod.renderStream(SCENARIO, chunk => {
    if (chunk.length === 0) return;
    if (chunks++ === 0) { firstAt = performance.now(); first = firstAt - t0; if (withSentinels) __SHELL_END(); if (marks) globalThis.__SHELL_MARKS__ = null; }
  });
  if (marks) {
    const rec = { onChunk: first, attempts: 0 };
    for (let i = 0; i < marks.length; i += 2) {
      const l = marks[i], t = marks[i + 1] - t0;
      if (l === "attempt") { rec.attempts++; if (rec.attempt0 === undefined) rec.attempt0 = t; rec.attemptN = t; continue; }
      if (l === "attempt-stubs") { if (rec.attemptStubs0 === undefined) rec.attemptStubs0 = t; continue; }
      if (rec[l] === undefined) rec[l] = t;
    }
    hopRuns.push(rec);
  }
  return { shell: first, total: performance.now() - t0, chunks };
}
function reportHops(label) {
  const runs = hopRuns.splice(0);
  if (!runs.length) return;
  const q = (xs, p) => { const s = xs.filter(x => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : NaN; };
  const seq = ["rts", "pipe", "flush", "settled", "attempt0", "attemptStubs0", "attemptN", "fn", "doShell", "gates", "rootAssets", "stubs", "head", "assemble", "shellDone", "writeRaw", "onChunk"];
  console.log(`\n== hops, ${TARGET} ${SCENARIO} (${runs.length} renders; ms since t0, median / p10 / p90; Δ = median step from the previous hop)`);
  let prev = null;
  for (const k of seq) {
    const xs = runs.map(r => r[k]);
    if (!xs.some(Number.isFinite)) continue;
    const m = q(xs, 0.5), d = prev === null ? m : m - prev; prev = m;
    console.log(`  ${k.padEnd(14)} ${m.toFixed(4).padStart(8)}  ${q(xs, 0.1).toFixed(4).padStart(8)}  ${q(xs, 0.9).toFixed(4).padStart(8)}   Δ ${d.toFixed(4)}`);
  }
  const att = runs.map(r => r.attempts);
  console.log(`  attempts per render: median ${q(att, 0.5)} (min ${Math.min(...att)}, max ${Math.max(...att)}); drain span (attempt0→attemptN) median ${(q(runs.map(r => r.attemptN - r.attempt0), 0.5)).toFixed(4)} ms`);
}

for (let i = 0; i < WARMUP; i++) await renderOnce(false);
hopRuns.length = 0;

// Plain timing first (no profiler), so the profiled condition can be checked.
const shells = [], totals = [];
for (let i = 0; i < Math.min(REPS, 100); i++) { const r = await renderOnce(false); shells.push(r.shell); totals.push(r.total); }
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
if (PROBE) { const p = probes.slice(-100); console.log(`probe (2e5-iter loop before each render): median ${med(p).toFixed(3)} ms  min ${Math.min(...p).toFixed(3)}  max ${Math.max(...p).toFixed(3)}`); }
console.log(`#### ${TARGET} ${SCENARIO} prespin=${PRESPIN}ms prealloc=${PREALLOC}k prewarm=${PREWARM || 'none'}: shell median ${med(shells).toFixed(3)} ms  min ${Math.min(...shells).toFixed(3)}  p90 ${[...shells].sort((a, b) => a - b)[Math.floor(shells.length * 0.9)].toFixed(3)}  | total median ${med(totals).toFixed(2)} ms  (${shells.length} renders, unprofiled)`);

if (MARKS) reportHops();
if (MODE === "time") await exit(0);
const session = new Session();
session.connect();
const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
await post("Profiler.enable");
await post("Profiler.setSamplingInterval", { interval: INTERVAL });
await post("Profiler.start");
const pShells = [];
for (let i = 0; i < REPS; i++) pShells.push((await renderOnce(true)).shell);
const { profile } = await post("Profiler.stop");
session.disconnect();

const byId = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const shortUrl = u => (u ? u.replace(/^file:\/\//, "").replace(/.*\/node_modules\//, "").replace(/^.*\/Development\//, "") : "");
const key = cf => `${cf.functionName || "(anonymous)"} ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;
const stackHas = (id, fn) => { for (let c = id; c !== undefined; c = parent.get(c)) if (byId.get(c).callFrame.functionName === fn) return true; return false; };

const self = new Map(), incl = new Map();
const selfU = new Map(), inclU = new Map(); let totalU = 0, samplesU = 0;
let inside = false, windows = 0, totalUs = 0, samplesIn = 0;
const { samples, timeDeltas } = profile;
for (let i = 0; i < samples.length; i++) {
  const id = samples[i], dt = timeDeltas[i + 1] ?? 0, node = byId.get(id);
  if (stackHas(id, "__SHELL_START")) { if (!inside) { inside = true; windows++; } continue; }
  if (stackHas(id, "__SHELL_END")) { inside = false; continue; }
  if (!inside) continue;
  samplesIn++; totalUs += dt;
  const k = key(node.callFrame);
  self.set(k, (self.get(k) ?? 0) + dt);
  const seen = new Set();
  for (let c = id; c !== undefined; c = parent.get(c)) { const kk = key(byId.get(c).callFrame); if (seen.has(kk)) continue; seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + dt); }
  if (UNDER && stackHas(id, UNDER)) {
    samplesU++; totalU += dt;
    selfU.set(k, (selfU.get(k) ?? 0) + dt);
    const seenU = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) { const kk = key(byId.get(c).callFrame); if (seenU.has(kk)) continue; seenU.add(kk); inclU.set(kk, (inclU.get(kk) ?? 0) + dt); if (byId.get(c).callFrame.functionName === UNDER) break; }
  }
}
const per = us => (us / windows / 1000).toFixed(4);
console.log(`\n== CPU shell window, ${SCENARIO}: ${windows} windows, ${samplesIn} samples, ${per(totalUs)} ms/render attributed (profiled shell median ${med(pShells).toFixed(3)} ms; interval ${INTERVAL} µs)`);
console.log("self ms/render  incl ms/render  %self  function");
for (const [k, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP))
  console.log(`${per(us).padStart(14)}  ${per(incl.get(k)).padStart(14)}  ${((us / totalUs) * 100).toFixed(1).padStart(5)}  ${k}`);
const watch = ["renderToStream", "renderStream", "doShell", "attempt", "scheduleFlush", "allSettled", "queue", "flushStubBatch", "serializeRootAssets", "renderShellHead", "assembleDocument", "withShellEnd", "resolveSSRSelectValues", "resolveRootHoles", "headShellReady", "coalesceWrites", "createHydrationSerializer", "createSerializer", "write", "flush", "ssr", "ssrElement", "escape", "createComponent", "createMemo", "createOwner", "runWithOwner", "App", "Card", "CardBody", "createLoadingBoundary", "(garbage collector)", "(program)", "(idle)"];
console.log("-- inclusive ms/render, watched --");
for (const w of watch) { const hits = [...incl.entries()].filter(([k]) => k.startsWith(w + " ")); if (hits.length) console.log(`${w.padEnd(26)} ${hits.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, us]) => `${per(us)} (${k.split(" ")[1]})`).join("  ")}`); }
if (UNDER) {
  console.log(`\n== subtree under ${UNDER}: ${samplesU} samples, ${per(totalU)} ms/render (${((totalU / totalUs) * 100).toFixed(1)}% of the shell window)`);
  console.log("self ms/render  incl ms/render  %subtree  function");
  for (const [k, us] of [...selfU.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP))
    console.log(`${per(us).padStart(14)}  ${per(inclU.get(k)).padStart(14)}  ${((us / totalU) * 100).toFixed(1).padStart(8)}  ${k}`);
  console.log("-- inclusive within the subtree, top --");
  for (const [k, us] of [...inclU.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`${per(us).padStart(14)}  ${k}`);
}
await exit(0);
