// Two-sided geomean board: for each suite, per-op ratio solid/<baseline-col>
// within EACH results dir (same-machine same-run pairing), then geomean per
// suite and overall. Run: node board-compare.mjs <dirA> <dirB> [labelA labelB]
import fs from "node:fs";
import path from "node:path";

const [dirA, dirB, labelA = "A", labelB = "B"] = process.argv.slice(2);
const SUITES = [
  "js-framework", "js-framework-reorder", "dbmon", "todomvc", "chat-stream",
  "svg-dashboard", "signal-favoring", "effectful-list", "list-clear",
  "memo-wall", "store-selector-fanout", "scaling-curves", "spa-navigation",
  "recursive-context", "external-store-fanout", "controlled-form",
  "event-delegation", "application-composition", "suspense-recovery",
  "scheduler-responsiveness", "hydration-interactivity", "lifecycle-memory",
  "ssr-throughput", "streaming-ssr"
];

const geo = xs => (xs.length ? Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length) : null);

function suiteRatios(dir, suite, baseCol) {
  const f = path.join(dir, suite + ".json");
  if (!fs.existsSync(f)) return null;
  const d = JSON.parse(fs.readFileSync(f));
  const targets = {};
  for (const t of d.targets ?? []) targets[t.name] = t.ops ?? {};
  const solidKey = Object.keys(targets).find(k => k === "solid" || k.startsWith("solid"));
  const baseKey = Object.keys(targets).find(k => k === baseCol || k.startsWith(baseCol));
  if (!solidKey || !baseKey) return null;
  const rs = [];
  for (const [op, v] of Object.entries(targets[solidKey])) {
    const b = targets[baseKey][op];
    if (v?.score && b?.score) rs.push(v.score / b.score);
  }
  return rs.length ? geo(rs) : null;
}

for (const baseCol of ["octane-tsrx", "vue-vapor"]) {
  console.log(`\n=== solid vs ${baseCol} (lower = solid faster) ===`);
  console.log(`${"suite".padEnd(28)} ${labelA.padStart(10)} ${labelB.padStart(10)}  delta`);
  const gmA = [], gmB = [];
  for (const s of SUITES) {
    const a = suiteRatios(dirA, s, baseCol);
    const b = suiteRatios(dirB, s, baseCol);
    if (a) gmA.push(a);
    if (b) gmB.push(b);
    const fmt = x => (x ? x.toFixed(2) + "x" : "—");
    const delta = a && b ? (((a - b) / b) * 100).toFixed(1) + "%" : "";
    console.log(`${s.padEnd(28)} ${fmt(a).padStart(10)} ${fmt(b).padStart(10)}  ${delta}`);
  }
  console.log(
    `${"OVERALL GEOMEAN".padEnd(28)} ${(geo(gmA)?.toFixed(3) + "x").padStart(10)} ${(geo(gmB)?.toFixed(3) + "x").padStart(10)}  (${gmA.length}/${gmB.length} suites)`
  );
}
