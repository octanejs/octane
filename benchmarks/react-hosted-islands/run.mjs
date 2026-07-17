// react-hosted-islands bench harness — Node-only structural baseline for the
// React-hosted Octane compat plan (docs/react-hosted-octane-compat-plan.md
// §8.1/§13, Phase 0). NO browser, NO ports, NO timing: every number is a
// deterministic structural COUNT, measured in jsdom against production React
// 19 plus the real compiled Octane runtime.
//
// What it pins (the Phase 5 "selective hosted delegation" baseline):
//   - per-island Octane delegated-listener cost for 1/100/1000 islands under
//     one React root, for three scenarios: `empty` (no handlers anywhere),
//     `one-click` (one island among N binds click), `all-click` (every island
//     binds click). TODAY all three cost the same O(all loaded event types)
//     per island — that equality IS the baseline; Phase 5 must drop the empty/
//     unused cost toward zero while `ratios.json` guards that per-island cost
//     never grows super-linearly with island count.
//   - React's own root-container listener count (constant per React root).
//   - bridge bindings and hosted roots per island (1 each).
//   - late `delegateEvents()` back-attach cost with N live roots (O(N) today).
//   - listener add/remove balance after full teardown (leak gate, must be 0).
//
// Usage:  node run.mjs [--no-build] [--quick]
//   --no-build  reuse the existing dist/ bundle (fast re-runs).
//   --quick     accepted for runner symmetry; counts are deterministic, so it
//               changes nothing.
//   BENCH_JSON=/path/out.json  env: also write machine-readable results.

// Externalized react/react-dom select their production builds off NODE_ENV —
// set BEFORE anything resolves them.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');

const COUNTS = [1, 100, 1000];
const SCENARIOS = ['empty', 'one-click', 'all-click'];

// ── build phase ───────────────────────────────────────────────────────────────

async function buildEntry() {
	const { build } = await import('vite');
	const { octane } = await import('octane/compiler/vite');
	await build({
		root: __dirname,
		logLevel: 'warn',
		plugins: [octane({ hmr: false })],
		// A CLIENT-mode lib build (an SSR build would compile the .tsrx fixtures
		// against octane/server): octane is bundled in from workspace source;
		// react/react-dom stay external and resolve from this package's
		// node_modules at import time, picking production builds via NODE_ENV.
		build: {
			lib: { entry: 'src/entry.ts', formats: ['es'], fileName: () => 'entry.js' },
			outDir: DIST,
			emptyOutDir: true,
			minify: false,
			rollupOptions: {
				external: ['react', 'react-dom', 'react-dom/client'],
			},
		},
	});
}

// ── jsdom environment + listener instrumentation ─────────────────────────────

async function setupDom() {
	const { JSDOM } = await import('jsdom');
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		pretendToBeVisual: true,
		url: 'http://localhost/',
	});
	const expose = [
		'window',
		'document',
		'navigator',
		'EventTarget',
		'Event',
		'UIEvent',
		'MouseEvent',
		'KeyboardEvent',
		'InputEvent',
		'FocusEvent',
		'CustomEvent',
		'Node',
		'Element',
		'HTMLElement',
		'HTMLInputElement',
		'HTMLIFrameElement',
		'SVGElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'MutationObserver',
		'getComputedStyle',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	];
	for (const key of expose) {
		const value = key === 'window' ? dom.window : dom.window[key];
		if (value === undefined) continue;
		Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
	}

	// Count every listener add/remove by target — the structural signal.
	const adds = [];
	const removes = [];
	const proto = dom.window.EventTarget.prototype;
	const originalAdd = proto.addEventListener;
	const originalRemove = proto.removeEventListener;
	proto.addEventListener = function (type, listener, options) {
		adds.push({ target: this, type });
		return originalAdd.call(this, type, listener, options);
	};
	proto.removeEventListener = function (type, listener, options) {
		removes.push({ target: this, type });
		return originalRemove.call(this, type, listener, options);
	};
	return { dom, adds, removes };
}

// ── measurement ───────────────────────────────────────────────────────────────

function classify(record, hostSet, container) {
	if (hostSet.has(record.target)) return 'island-host';
	const isNode = record.target != null && typeof record.target.nodeType === 'number';
	if (
		isNode &&
		container !== null &&
		(record.target === container || container.contains(record.target))
	) {
		return 'react-root';
	}
	// window / document listeners (React's selectionchange etc.) and anything else.
	return 'environment';
}

async function main() {
	if (!noBuild || !fs.existsSync(path.join(DIST, 'entry.js'))) await buildEntry();
	const { adds, removes } = await setupDom();
	const entry = await import(pathToFileURL(path.join(DIST, 'entry.js')).href);

	const targets = new Map(COUNTS.map((count) => [count, { name: `islands-${count}`, ops: {} }]));
	const gates = [];
	const val = (value) => ({ score: value, median: value, min: value, samples: 1 });

	for (const count of COUNTS) {
		const target = targets.get(count);
		for (const scenario of SCENARIOS) {
			const baseAdds = adds.length;
			const baseRemoves = removes.length;
			const page = entry.mountIslandPage(count, scenario);
			if (page.hosts.length !== count) {
				gates.push(`hosts mismatch: expected ${count}, got ${page.hosts.length} (${scenario})`);
			}
			const hostSet = new Set(page.hosts);
			const container = page.hosts[0]?.closest('main')?.parentElement ?? null;
			const mountAdds = adds.slice(baseAdds);
			const islandAdds = mountAdds.filter(
				(record) => classify(record, hostSet, container) === 'island-host',
			);
			const reactAdds = mountAdds.filter(
				(record) => classify(record, hostSet, container) === 'react-root',
			);
			const key = scenario.replace(/-/g, '_');
			target.ops[`${key}_listeners_per_island`] = val(islandAdds.length / count);
			if (scenario === 'empty') {
				target.ops.react_root_listeners = val(reactAdds.length);
				target.ops.bridge_bindings_per_island = val(page.bridgeBindings / count);
				target.ops.octane_roots = val(page.octaneRoots);
			}

			page.unmount();
			const islandAddTotal = adds
				.slice(baseAdds)
				.filter((record) => hostSet.has(record.target)).length;
			const islandRemoveTotal = removes
				.slice(baseRemoves)
				.filter((record) => hostSet.has(record.target)).length;
			const leaked = islandAddTotal - islandRemoveTotal;
			if (scenario === 'empty') target.ops.leaked_listeners_after_unmount = val(leaked);
			if (leaked !== 0) {
				gates.push(
					`listener leak: ${leaked} island listeners not removed (${scenario}, n=${count})`,
				);
			}
		}
	}

	// ── late delegateEvents() back-attach (measured LAST: each fresh type
	// permanently joins the module-global delegated set and would otherwise
	// inflate every later scenario's per-island counts) ─────────────────────
	for (const count of COUNTS) {
		const target = targets.get(count);
		const page = entry.mountIslandPage(count, 'empty');
		const hostSet = new Set(page.hosts);
		const before = adds.length;
		// A new event type registered while N roots are live back-attaches to
		// every delegation target — O(islands) today.
		entry.registerLateEventType(`bench-late-${count}`);
		const lateAdds = adds.slice(before).filter((record) => hostSet.has(record.target)).length;
		target.ops.late_delegate_backattach_total = val(lateAdds);
		page.unmount();
	}

	// ── Phase 2 structural gate: transparent-context Fiber walks happen only
	// at discovery — a provider update must never walk (§13 / Phase 2 exit
	// gate). Runs through the PUBLIC OctaneCompat surface. ──────────────────
	const CONTEXT_UPDATES = 5;
	for (const count of COUNTS) {
		const target = targets.get(count);
		const walksBefore = entry.__hostContextFiberWalks();
		const page = entry.mountContextIslandPage(count);
		const walksAtMount = entry.__hostContextFiberWalks() - walksBefore;
		for (let update = 1; update <= CONTEXT_UPDATES; update++) page.setTheme(`t${update}`);
		const walkDelta = entry.__hostContextFiberWalks() - walksBefore - walksAtMount;
		target.ops.context_fiber_walks_at_mount_per_island = val(walksAtMount / count);
		target.ops.context_fiber_walks_per_update = val(walkDelta / CONTEXT_UPDATES);
		if (walkDelta !== 0) {
			gates.push(
				`post-subscription fiber walks: ${walkDelta} across ${CONTEXT_UPDATES} provider updates (n=${count})`,
			);
		}
		page.unmount();
		// Island disposal is deferred to microtasks (the §5 rule 7 discriminator);
		// drain before the next scenario mounts.
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	// ── report ──────────────────────────────────────────────────────────────
	const rows = [...targets.values()];
	console.log('react-hosted-islands — structural counts (deterministic)');
	for (const target of rows) {
		const ops = target.ops;
		console.log(
			`  ${target.name.padEnd(12)} per-island listeners: empty ${ops.empty_listeners_per_island.score}` +
				` | one-click ${ops.one_click_listeners_per_island.score}` +
				` | all-click ${ops.all_click_listeners_per_island.score}` +
				` | react-root ${ops.react_root_listeners.score}` +
				` | late back-attach ${ops.late_delegate_backattach_total.score}` +
				` | leak ${ops.leaked_listeners_after_unmount.score}` +
				` | ctx walks mount/update ${ops.context_fiber_walks_at_mount_per_island.score}/${ops.context_fiber_walks_per_update.score}`,
		);
	}

	if (gates.length > 0) {
		console.error('✗ structural gates failed:');
		for (const gate of gates) console.error(`  - ${gate}`);
	}

	if (process.env.BENCH_JSON) {
		const payload = {
			suite: 'react-hosted-islands',
			iterations: 1,
			targets: rows,
		};
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	}
	process.exit(gates.length > 0 ? 1 : 0);
}

await main();
