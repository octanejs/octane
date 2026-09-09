// Production-bundle allocation control: zero, one, and two distinct context
// reads in the same 512 keyed consumer positions. It instruments Map construction
// at the browser boundary without changing compiler-visible source.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { summarizeSamples } from '../lib/stats.mjs';

const fixture = new URL('./octane-tsrx/', import.meta.url);
const requireFixture = createRequire(new URL('package.json', fixture));
const { preview } = await import(requireFixture.resolve('vite'));
const VARIANTS = ['zero', 'one', 'two'];
const ROW_COUNT = 512;

execFileSync('pnpm', ['exec', 'vite', 'build'], {
	cwd: fileURLToPath(fixture),
	stdio: 'inherit',
});

// This page has a distinct HTML entry. An ephemeral port prevents unrelated
// long-running Octane preview servers from serving another worktree's assets.
const server = await preview({
	root: fileURLToPath(fixture),
	configFile: fileURLToPath(new URL('vite.config.js', fixture)),
	preview: { host: '127.0.0.1', port: 0, strictPort: false },
});
const port = server.httpServer.address().port;
console.log(`Context-cache preview port: ${port}`);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = {};
try {
	for (const variant of VARIANTS) {
		const context = await browser.newContext();
		await context.addInitScript(() => {
			const NativeMap = globalThis.Map;
			let constructions = 0;
			globalThis.Map = new Proxy(NativeMap, {
				construct(target, args, newTarget) {
					constructions++;
					return Reflect.construct(target, args, newTarget);
				},
			});
			globalThis.__mapWork = {
				reset() {
					constructions = 0;
				},
				count() {
					return constructions;
				},
			};
		});
		const page = await context.newPage();
		page.on('pageerror', (error) => console.error('Context-cache browser error:', error));
		page.on('response', (response) => {
			if (response.status() >= 400)
				console.error(`Context-cache HTTP ${response.status()}: ${response.url()}`);
		});
		try {
			await page.goto(`http://127.0.0.1:${port}/context-cache.html`);
			await page.waitForFunction(() => window.__readyCache === true);
			const values = await page.evaluate(
				({ mode, rowCount }) => {
					const work = window.__mapWork;
					work.reset();
					new Map(); // Confirm this browser observed actual Map construction.
					if (work.count() !== 1) throw new Error('Map constructor probe was not installed');
					function operation(callback) {
						work.reset();
						callback();
						return work.count();
					}
					function verify(version, secondary, ids) {
						const rows = [...document.querySelectorAll('.cache-row')];
						if (rows.length !== ids.length) throw new Error(`${mode}: ${rows.length} visible rows`);
						for (let index = 0; index < rows.length; index++) {
							const id = ids[index];
							if (rows[index].dataset.id !== String(id))
								throw new Error(`${mode}: row ${index} id`);
							const expected = `${id}|${version}:${secondary}`;
							if (rows[index].textContent !== expected) {
								throw new Error(
									`${mode}: row ${index} text ${rows[index].textContent} != ${expected}`,
								);
							}
						}
						return rows;
					}
					const forwardIds = Array.from({ length: rowCount }, (_, index) => index);
					const reversedIds = [...forwardIds].reverse();
					const mount = operation(() => window.__mountCache(mode));
					const mounted = verify(0, 0, forwardIds);
					const update = operation(window.__updateCache);
					const updated = verify(1, 0, forwardIds);
					if (updated.some((row, index) => row !== mounted[index])) {
						throw new Error(`${mode}: update replaced a keyed row`);
					}
					const secondary = operation(window.__updateSecondaryCache);
					verify(1, mode === 'two' ? 1 : 0, forwardIds);
					const reorder = operation(window.__reorderCache);
					const reversed = verify(1, mode === 'two' ? 1 : 0, reversedIds);
					if (reversed.some((row, index) => row !== mounted[rowCount - 1 - index])) {
						throw new Error(`${mode}: reorder replaced a keyed row`);
					}
					const unmount = operation(window.__unmountCache);
					if (document.querySelectorAll('.cache-row').length !== 0) {
						throw new Error(`${mode}: unmount left rows in DOM`);
					}
					return { mount, update, secondary, reorder, unmount };
				},
				{ mode: variant, rowCount: ROW_COUNT },
			);
			results[variant] = values;
		} finally {
			await context.close();
		}
	}
	// The preceding exact allocation count uses a Map constructor wrapper.
	// Timing takes place in fresh, uninstrumented Chromium realms; report the
	// distribution as observational data, without a noisy wall-time gate.
	for (const variant of VARIANTS) {
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			await page.goto(`http://127.0.0.1:${port}/context-cache.html`);
			await page.waitForFunction(() => window.__readyCache === true);
			const samples = await page.evaluate(
				({ mode, rowCount }) => {
					window.__mountCache(mode);
					for (let i = 0; i < 12; i++) window.__updateCache();
					const times = [];
					const updatesPerSample = 20;
					for (let i = 0; i < 40; i++) {
						const start = performance.now();
						for (let j = 0; j < updatesPerSample; j++) window.__updateCache();
						times.push((performance.now() - start) / updatesPerSample);
					}
					const rows = document.querySelectorAll('.cache-row');
					if (rows.length !== rowCount) throw new Error(`${mode}: timed update lost rows`);
					for (let id = 0; id < rows.length; id++) {
						if (rows[id].textContent !== `${id}|812:0`) {
							throw new Error(`${mode}: timed update did not flush row ${id}`);
						}
					}
					return times;
				},
				{ mode: variant, rowCount: ROW_COUNT },
			);
			results[variant].updateMs = summarizeSamples(samples);
		} finally {
			await context.close();
		}
	}
} finally {
	await browser.close();
	await new Promise((resolve, reject) => {
		server.httpServer.close((error) => (error ? reject(error) : resolve()));
	});
}

console.log('variant  mount Map  update Map  other Map  reorder Map  unmount Map');
for (const variant of VARIANTS) {
	const { mount, update, secondary, reorder, unmount } = results[variant];
	console.log(
		`${variant.padEnd(7)} ${String(mount).padStart(9)} ${String(update).padStart(11)} ${String(secondary).padStart(10)} ${String(reorder).padStart(12)} ${String(unmount).padStart(12)}`,
	);
}

// One-context and two-context variants differ only in the consumer reads.
// The zero-context variant captures shared keyed-row, root, and provider work.
const oneExtra = results.one.mount - results.zero.mount;
const twoExtra = results.two.mount - results.zero.mount;
console.log(
	`Consumer Map constructions above zero-context control: one=${oneExtra}, two=${twoExtra}`,
);
for (const variant of VARIANTS) {
	const { median, min, p95 } = results[variant].updateMs;
	console.log(
		`${variant} update (uninstrumented): median=${median.toFixed(3)}ms min=${min.toFixed(3)}ms p95=${p95.toFixed(3)}ms`,
	);
}

// The first context resolution uses the per-reader inline entry. A second
// *distinct* context spills that reader into exactly one Map. The zero-context
// variant establishes the shared root/keyed/provider allocation control.
if (oneExtra !== 0 || twoExtra !== ROW_COUNT) {
	throw new Error(
		`Context-cache Map gate: one extra=${oneExtra} (expected 0), two extra=${twoExtra} (expected ${ROW_COUNT})`,
	);
}
const ceilings = { mount: 6, update: 1, secondary: 1, reorder: 2, unmount: 0 };
for (const [op, max] of Object.entries(ceilings)) {
	if (results.zero[op] > max) {
		throw new Error(`Zero-context ${op} allocated ${results.zero[op]} Maps (maximum ${max})`);
	}
	for (const variant of ['one', 'two']) {
		if (op !== 'mount' && results[variant][op] > results.zero[op]) {
			throw new Error(`${variant} ${op} allocated more Maps than the zero-context control`);
		}
	}
}
console.log('Context-cache allocation and semantic gates passed.');

export { results as contextCacheResults };
