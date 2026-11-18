import { expect, test } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

type Sample = {
	t: number;
	scrollTop: number;
	clientHeight: number;
	scrollHeight: number;
	gap: number;
	absoluteGap: number;
	lastVisible: boolean;
};
type Capture = {
	done: Promise<void>;
	heights: Record<string, { offsetHeight: number; rectHeight: number }>;
	samples: Sample[];
	hold: {
		delayMs: number;
		startedAt: number | null;
		releasedAt: number | null;
		held: number;
		canceled: number;
		released: number;
	};
};

const seed = Number(process.env.OCTANE_VIRTUAL_REPLAY_SEED ?? 1);
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)
	throw new Error('OCTANE_VIRTUAL_REPLAY_SEED must be an unsigned 32-bit integer');
const delayMs = Number(process.env.OCTANE_VIRTUAL_REPLAY_DELAY_MS ?? 0);
if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 2000)
	throw new Error('OCTANE_VIRTUAL_REPLAY_DELAY_MS must be between 0 and 2000');
const sampleMode = process.env.OCTANE_VIRTUAL_REPLAY_SAMPLE_MODE ?? 'trajectory';
if (sampleMode !== 'trajectory' && sampleMode !== 'oneshot')
	throw new Error('OCTANE_VIRTUAL_REPLAY_SAMPLE_MODE must be trajectory or oneshot');

test('captures scroll-to-last sizes and geometry for replay', async ({ page, browser }, info) => {
	await page.addInitScript((initial) => {
		let state = initial;
		Math.random = () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32;
	}, seed);
	await page.goto('/scroll/');
	await page.evaluate(
		({ delayMs, sampleMode }) => {
			const button = document.querySelector('#scroll-to-last')!;
			const container = document.querySelector<HTMLElement>('#scroll-container')!;
			const heights: Record<string, { offsetHeight: number; rectHeight: number }> = {};
			const samples: Sample[] = [];
			const originalRequest = window.requestAnimationFrame;
			const originalCancel = window.cancelAnimationFrame;
			const request = (callback: FrameRequestCallback) => originalRequest.call(window, callback);
			const cancel = (id: number) => originalCancel.call(window, id);
			const hold: Capture['hold'] = {
				delayMs,
				startedAt: null,
				releasedAt: null,
				held: 0,
				canceled: 0,
				released: 0,
			};
			const pending = new Map<number, { callback: FrameRequestCallback; scheduled?: number }>();
			const restoreCancel = () => {
				if (hold.releasedAt !== null && pending.size === 0)
					window.cancelAnimationFrame = originalCancel;
			};
			const readHeights = () => {
				for (const row of container.querySelectorAll<HTMLElement>('[data-index]'))
					heights[row.dataset.index!] = {
						offsetHeight: row.offsetHeight,
						rectHeight: row.getBoundingClientRect().height,
					};
			};
			readHeights();
			const done = new Promise<void>((resolve) =>
				button.addEventListener(
					'click',
					() => {
						const start = performance.now();
						if (delayMs > 0) {
							hold.startedAt = 0;
							window.requestAnimationFrame = (callback) => {
								const id = request(() => {});
								pending.set(id, { callback });
								hold.held++;
								return id;
							};
							window.cancelAnimationFrame = (id) => {
								const frame = pending.get(id);
								if (!frame) return cancel(id);
								cancel(id);
								if (frame.scheduled !== undefined) cancel(frame.scheduled);
								pending.delete(id);
								hold.canceled++;
								restoreCancel();
							};
							setTimeout(() => {
								window.requestAnimationFrame = originalRequest;
								hold.releasedAt = performance.now() - start;
								for (const [id, frame] of pending) {
									cancel(id);
									frame.scheduled = request((time) => {
										pending.delete(id);
										hold.released++;
										frame.callback(time);
										restoreCancel();
									});
								}
								restoreCancel();
							}, delayMs);
						}
						const duration = delayMs > 0 ? 6200 : 3500;
						const record = (now: number) => {
							readHeights();
							const last = container.querySelector<HTMLElement>('[data-testid="item-1001"]');
							const outer = container.getBoundingClientRect(),
								rect = last?.getBoundingClientRect();
							const gap = container.scrollHeight - container.scrollTop - container.clientHeight;
							samples.push({
								t: now - start,
								scrollTop: container.scrollTop,
								clientHeight: container.clientHeight,
								scrollHeight: container.scrollHeight,
								gap,
								absoluteGap: Math.abs(gap),
								lastVisible: !!rect && rect.bottom > outer.top && rect.top < outer.bottom,
							});
						};
						const finish = () => {
							window.requestAnimationFrame = originalRequest;
							window.cancelAnimationFrame = originalCancel;
							for (const [id, frame] of pending) {
								cancel(id);
								if (frame.scheduled !== undefined) cancel(frame.scheduled);
							}
							pending.clear();
							resolve();
						};
						if (sampleMode === 'oneshot') {
							setTimeout(() => record(performance.now()), 1000);
							setTimeout(() => {
								record(performance.now());
								finish();
							}, duration);
						} else {
							let previous = -Infinity;
							const sample = (now: number) => {
								if (now - previous >= 40 || now - start >= duration) {
									previous = now;
									record(now);
								}
								if (now - start < duration) request(sample);
								else finish();
							};
							request(sample);
						}
					},
					{ capture: true, once: true },
				),
			);
			(window as Window & { __virtualReplay?: Capture }).__virtualReplay = {
				done,
				heights,
				samples,
				hold,
			};
		},
		{ delayMs, sampleMode },
	);
	await page.locator('#scroll-to-last').click();
	const result = await page.evaluate(async () => {
		const { done, heights, samples, hold } = (window as Window & { __virtualReplay?: Capture })
			.__virtualReplay!;
		await done;
		return { heights, samples, hold };
	});
	const atOneSecond = result.samples.reduce((a, b) =>
		Math.abs(a.t - 1000) < Math.abs(b.t - 1000) ? a : b,
	);
	const path = info.outputPath('scroll-replay.json');
	const manifest = JSON.parse(
		await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
	);
	await writeFile(
		path,
		JSON.stringify(
			{
				lane: process.env.OCTANE_VIRTUAL_BROWSER_MODE ?? 'pristine',
				seed,
				sampleMode,
				browser: browser.version(),
				virtualCore: manifest.dependencies['@tanstack/virtual-core'],
				reactVirtual: manifest.devDependencies['@tanstack/react-virtual'],
				capturedAt: new Date().toISOString(),
				atOneSecond,
				...result,
			},
			null,
			2,
		),
	);
	await info.attach('scroll-replay', { path, contentType: 'application/json' });
	console.log(`scroll replay: ${path}`);
	expect(atOneSecond.lastVisible).toBe(true);
	expect(atOneSecond.absoluteGap).toBeLessThan(1.01);
});
