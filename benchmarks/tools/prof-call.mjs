// Call profiler for any Octane fixture page: drives a window function (a
// harness hook such as __bumpAt1 or the js-framework __select) N times with
// CDP Profiler attached, brackets each call with spinning sentinels and
// attributes only the samples between them — CPU self/inclusive by function.
// Generic sibling of uibench/tools/prof.mjs (which speaks __prepare/__run).
//
//   node tools/prof-call.mjs --url=http://localhost:5390/ --fn=__bumpAt1
//        [--mount=__mount] [--setup=<window fn run once after mount>]
//        [--reps=2000] [--warmup=500] [--interval=20] [--top=40] [--mode=time|both]
//
// Serve an UNMINIFIED build first, e.g. from the fixture dir:
//   npx vite build --minify false --outDir dist-prof
//   npx vite preview --outDir dist-prof --port 5390 --strictPort
// Hooks that return a thenable (Vapor's nextTick) are awaited inside the
// window, as run.mjs does.
import { chromium } from 'playwright';
const arg = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a === undefined ? d : a.slice(n.length + 3); };
const URL = arg('url', 'http://localhost:5390/');
const FN = arg('fn', '__bumpAt1');
const MOUNT = arg('mount', '__mount');
const SETUP = arg('setup', '');
const REPS = Number(arg('reps', '2000'));
const WARMUP = Number(arg('warmup', '500'));
const INTERVAL = Number(arg('interval', '20'));
const TOP = Number(arg('top', '40'));
const MODE = arg('mode', 'both');
// Alternative to --fn: a JS snippet run per call with the rep index `i` in
// scope (e.g. a DOM click, as js-framework's harness does); the page's
// `__benchFlush` is awaited after it when present. --setupSnippet runs once
// after mount (e.g. "document.getElementById('run').click()").
const SNIPPET = arg('snippet', '');
const SETUP_SNIPPET = arg('setupSnippet', '');
const READY = arg('ready', ''); // a selector to wait for instead of window.__ready / __mount (js-framework: "#run")

const browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.goto(URL, { waitUntil: 'load' });
if (READY) await page.waitForSelector(READY, { timeout: 10000 });
else await page.waitForFunction(() => window.__ready === true || typeof window.__mount === 'function', null, { timeout: 10000 });
await page.evaluate(() => {
  window.__profStart = function __PROF_START() { const t = performance.now(); while (performance.now() - t < 0.3); };
  window.__profEnd = function __PROF_END() { const t = performance.now(); while (performance.now() - t < 0.3); };
});
if (MOUNT) await page.evaluate(m => { if (typeof window[m] === 'function') window[m](); }, MOUNT);
if (SETUP) await page.evaluate(s => window[s](), SETUP);
if (SETUP_SNIPPET) await page.evaluate(async s => { new Function(s)(); if (window.__benchFlush) await window.__benchFlush(); }, SETUP_SNIPPET);
await page.evaluate(({ fn, snippet }) => {
  // One call = the hook, or the snippet followed by the harness flush.
  const call = snippet
    ? (f => async i => { f(i); if (window.__benchFlush) await window.__benchFlush(); })(new Function('i', snippet))
    : window[fn];
  window.__profCall = call;
}, { fn: FN, snippet: SNIPPET });
await page.evaluate(() => new Promise(r => setTimeout(r, 50)));
const cdp = await context.newCDPSession(page);

// Plain timing: batches of calls per performance.now() read (the sub-µs ops
// need it), like signal-favoring's run.mjs.
const timing = await page.evaluate(async ({ fn, reps, warmup }) => {
  const f = window.__profCall;
  for (let i = 0; i < warmup; i++) { const r = f(i); if (r && typeof r.then === 'function') await r; }
  let n = 0; const batch = async count => { const t0 = performance.now(); for (let i = 0; i < count; i++) { const r = f(n++); if (r && typeof r.then === 'function') await r; } return performance.now() - t0; };
  // Size a batch by time, as signal-favoring's run.mjs does: a page served
  // without COOP/COEP has a 100 µs clock, so a sub-µs op needs thousands of
  // calls per reading. Double until one batch spans 20 ms.
  let per = 50; while (per < 1 << 20 && (await batch(per)) < 20) per *= 2;
  const out = [];
  for (let s = 0; s < 20; s++) out.push((await batch(per)) / per);
  out.sort((a, b) => a - b);
  return { medianUs: out[out.length >> 1] * 1000, minUs: out[0] * 1000, p90Us: out[Math.floor(out.length * 0.9)] * 1000, per };
}, { fn: FN, reps: REPS, warmup: WARMUP });
console.log(`#### ${SNIPPET ? 'snippet' : FN} @ ${URL}: median ${timing.medianUs.toFixed(3)} µs/call  min ${timing.minUs.toFixed(3)}  p90 ${timing.p90Us.toFixed(3)}  (batched timing, 20 readings of ${timing.per}-call batches)`);
if (MODE === 'time') { await browser.close(); process.exit(errors.length ? 1 : 0); }

await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: INTERVAL });
await cdp.send('Profiler.start');
await page.evaluate(async ({ fn, reps }) => {
  const f = window.__profCall;
  for (let i = 0; i < reps; i++) {
    window.__profStart();
    const r = f(i); if (r && typeof r.then === 'function') await r;
    window.__profEnd();
  }
}, { fn: FN, reps: REPS });
const { profile } = await cdp.send('Profiler.stop');
await browser.close();

const shortUrl = u => (u ? u.replace(/^https?:\/\/[^/]+\//, '').replace(/\?.*$/, '').replace(/^assets\//, '') : '');
const key = cf => `${cf.functionName || '(anonymous)'} ${shortUrl(cf.url)}:${cf.lineNumber + 1}`;
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const stackHas = (id, fn) => { for (let c = id; c !== undefined; c = parent.get(c)) if (byId.get(c).callFrame.functionName === fn) return true; return false; };
const self = new Map(), incl = new Map();
let inside = false, windows = 0, totalUs = 0, samplesIn = 0;
const { samples, timeDeltas } = profile;
for (let i = 0; i < samples.length; i++) {
  const id = samples[i], dt = timeDeltas[i + 1] ?? 0, node = byId.get(id);
  if (stackHas(id, '__PROF_START')) { if (!inside) { inside = true; windows++; } continue; }
  if (stackHas(id, '__PROF_END')) { inside = false; continue; }
  if (!inside) continue;
  samplesIn++; totalUs += dt;
  const k = key(node.callFrame);
  self.set(k, (self.get(k) ?? 0) + dt);
  const seen = new Set();
  for (let c = id; c !== undefined; c = parent.get(c)) { const kk = key(byId.get(c).callFrame); if (seen.has(kk)) continue; seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + dt); }
}
const per = us => (us / windows).toFixed(3);
console.log(`\n== CPU per call, ${SNIPPET ? 'snippet' : FN}: ${windows} windows, ${samplesIn} samples, ${per(totalUs)} µs/call attributed (interval ${INTERVAL} µs)`);
console.log('self µs/call  incl µs/call  %self  function');
for (const [k, us] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP))
  console.log(`${per(us).padStart(12)}  ${per(incl.get(k)).padStart(12)}  ${((us / totalUs) * 100).toFixed(1).padStart(5)}  ${k}`);
console.log('-- inclusive, top --');
for (const [k, us] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${per(us).padStart(12)}  ${k}`);
if (errors.length) { console.error('page errors:', errors.slice(0, 5)); process.exit(1); }
