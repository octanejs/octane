// Optional paired browser timing for branches.mjs's unobserved bundles.
// Build each variant with BRANCH_BUNDLE_DIRECTORY, then pass its branches.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const files = process.argv.slice(2).map((file) => path.resolve(file));
assert.ok(files.length >= 2, 'pass baseline bundle, followed by one or more candidate bundles');
const samples = Number(process.env.BRANCH_BROWSER_SAMPLES || 31);
const cycles = Number(process.env.BRANCH_BROWSER_CYCLES || 512);
const warmup = Number(process.env.BRANCH_BROWSER_WARMUP || 1024);
for (const value of [samples, cycles, warmup]) assert.ok(Number.isSafeInteger(value) && value > 0);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
	const variants = [];
	for (const file of files) {
		const code = readFileSync(file, 'utf8');
		const page = await browser.newPage();
		await page.evaluate(async (source) => {
			const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
			try {
				window.branchApi = await import(url);
			} finally {
				URL.revokeObjectURL(url);
			}
		}, code);
		variants.push({ page, file, hash: createHash('sha256').update(code).digest('hex') });
	}
	for (const mode of ['stable', 'toggle', 'absent']) {
		for (const { page } of variants) {
			await page.evaluate(
				({ mode, warmup }) => {
					const { App, createRoot, flushSync } = window.branchApi;
					const container = document.createElement('div');
					document.body.appendChild(container);
					const root = createRoot(container);
					let update, effectLabel, picked;
					let effects = 0,
						cleanups = 0,
						tick = 0;
					root.render(App, {
						mode,
						label: 'value',
						bind(value) {
							update = value;
						},
						effect(value) {
							effects++;
							effectLabel = value;
						},
						cleanup() {
							cleanups++;
						},
						pick(value) {
							picked = value;
						},
					});
					flushSync(() => {});
					const original = [...container.querySelectorAll('button')];
					const render = () => flushSync(() => update(++tick));
					for (let i = 0; i < warmup; i++) render();
					window.branchWork = {
						run(count) {
							const start = performance.now();
							for (let i = 0; i < count; i++) render();
							return (performance.now() - start) / count;
						},
						finish() {
							const buttons = [...container.querySelectorAll('button')];
							const label = `value:${tick}`;
							const active = mode !== 'absent' && (mode !== 'toggle' || tick % 2 === 0);
							if (buttons.length !== (active ? 32 : 0)) throw new Error('incorrect active output');
							for (const [index, button] of buttons.entries()) {
								if (button.textContent !== label || button.title !== label)
									throw new Error('stale output');
								if (mode === 'stable' && button !== original[index])
									throw new Error('lost same-arm identity');
								if (mode === 'toggle' && button === original[index])
									throw new Error('reused switched arm');
								button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
								if (picked !== label) throw new Error('stale event capture');
							}
							if (effectLabel !== label || effects !== cleanups + 1)
								throw new Error('incorrect effect lifetime');
							const snapshot = {
								text: container.textContent,
								buttons: buttons.length,
								effects,
								cleanups,
							};
							root.unmount();
							if (container.childNodes.length !== 0 || effects !== cleanups)
								throw new Error('incomplete cleanup');
							container.remove();
							return snapshot;
						},
					};
				},
				{ mode, warmup },
			);
		}
		const times = variants.map(() => []);
		for (let sample = 0; sample < samples; sample++) {
			const order = variants.map((_, index) => (index + sample) % variants.length);
			if (Math.floor(sample / variants.length) % 2) order.reverse();
			for (const index of order)
				times[index].push(
					await variants[index].page.evaluate((count) => window.branchWork.run(count), cycles),
				);
		}
		let baseline;
		for (const [index, variant] of variants.entries()) {
			const semantic = await variant.page.evaluate(() => window.branchWork.finish());
			if (index === 0) baseline = semantic;
			else
				assert.deepEqual(semantic, baseline, 'all variants preserve browser output and lifecycle');
			const sorted = times[index].toSorted((a, b) => a - b);
			results.push({
				mode,
				file: variant.file,
				bundleHash: variant.hash,
				semantic,
				median: sorted[Math.floor(sorted.length / 2)],
				min: sorted[0],
				max: sorted.at(-1),
				samples: times[index],
			});
		}
	}
	const report = {
		node: process.version,
		chromium: browser.version(),
		platform: process.platform,
		arch: process.arch,
		samples,
		cycles,
		warmup,
		unit: 'ms per update',
		results,
	};
	console.log(JSON.stringify(report, null, 2));
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
} finally {
	await browser.close();
}
