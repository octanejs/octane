import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { summarizeSamples } from '../lib/stats.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(repository, 'packages/octane/tests/browser/scheduler-backlogs');

/** Production bundles and one local server shared by Vitest and the CLI. */
export async function serveBacklogs(source = repository, policy = 'elapsed') {
	const dependencies = createRequire(path.join(repository, 'packages/octane/package.json'));
	// Archived sources predating the vendored signal graph still import Alien.
	const comparator = createRequire(path.join(repository, 'benchmarks/scoped-signals/package.json'));
	const react = createRequire(path.join(repository, 'benchmarks/news/react/package.json'));
	const serverBundle = await build({
		stdin: {
			contents: `import { Island } from ${JSON.stringify(path.join(fixture, 'island.ts'))}; import {renderToString} from ${JSON.stringify(path.join(source, 'packages/octane/src/runtime.server.ts'))}; export const render = value => renderToString(Island, { value }).html;`,
			loader: 'ts',
			resolveDir: repository,
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		define: { 'process.env.NODE_ENV': '"production"' },
		alias: {
			octane: path.join(source, 'packages/octane/src/runtime.server.ts'),
			devalue: dependencies.resolve('devalue'),
		},
	});
	const { render } = await import(
		`data:text/javascript;base64,${Buffer.from(serverBundle.outputFiles[0].text).toString('base64')}`
	);
	const islandHTML = (count) =>
		Array.from(
			{ length: count },
			(_, index) =>
				`<div data-octane-hydrate-id="island-${index + 1}" data-octane-hydrate-when="load">${render(index + 1)}</div>`,
		).join('');
	const bundles = new Map();
	for (const target of ['octane', 'react']) {
		const result = await build({
			entryPoints: [path.join(fixture, `${target}.ts`)],
			bundle: true,
			write: false,
			minify: true,
			format: 'esm',
			platform: 'browser',
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			alias: {
				octane: path.join(source, 'packages/octane/src/index.ts'),
				devalue: dependencies.resolve('devalue'),
				'alien-signals': comparator.resolve('alien-signals'),
				'alien-signals/system': comparator.resolve('alien-signals/system'),
				react: react.resolve('react'),
				'react-dom/client': react.resolve('react-dom/client'),
			},
			plugins: [
				{
					name: 'source-checkout',
					setup(builder) {
						if (policy !== 'elapsed')
							builder.onLoad({ filter: /[/\\]host-budget\.ts$/ }, (args) => {
								assert.ok(['count', 'combined'].includes(policy));
								// Counterfactual policies exist only in this benchmark build.
								const original = readFileSync(args.path, 'utf8');
								assert.match(original, /now - started >= HOST_BUDGET_MS/);
								const contents = original
									.replace('let started = 0;', 'let started = 0; let checks = 0;')
									.replace('started = now;', 'started = now; checks = 0;')
									.replace(
										'now - started >= HOST_BUDGET_MS',
										policy === 'count'
											? '++checks >= 8'
											: '++checks >= 8 || now - started >= HOST_BUDGET_MS',
									);
								return { contents, loader: 'ts' };
							});
						builder.onResolve({ filter: /^\.\.\/\.\.\/\.\.\/src\// }, (args) => ({
							path: path.join(
								source,
								'packages/octane/src',
								args.path.slice('../../../src/'.length).replace(/\.js$/, '.ts'),
							),
						}));
					},
				},
			],
		});
		bundles.set(`/${target}.js`, result.outputFiles[0].text);
	}
	const server = createServer((request, response) => {
		const url = new URL(request.url, 'http://127.0.0.1');
		if (bundles.has(url.pathname)) {
			response.setHeader('content-type', 'text/javascript');
			response.end(bundles.get(url.pathname));
		} else if (url.pathname === '/') {
			const target = url.searchParams.get('target') === 'react' ? 'react' : 'octane';
			response.setHeader('content-type', 'text/html');
			response.end(
				`<!doctype html><meta charset="utf-8"><title>Scheduler backlog</title><div id="root"></div><div id="islands">${url.searchParams.get('scenario') === 'islands' ? islandHTML(Number(url.searchParams.get('count') ?? 60)) : ''}</div><script type="module" src="/${target}.js"></script>`,
			);
		} else {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		policy,
		bundleBytes: Object.fromEntries(
			[...bundles].map(([name, code]) => [
				name,
				{ raw: Buffer.byteLength(code), gzip: gzipSync(code).length },
			]),
		),
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}

export async function measureBacklog(browser, url, scenario, target = 'octane', options = {}) {
	const context = await browser.newContext();
	try {
		const page = await context.newPage();
		const failures = [];
		page.on('pageerror', (error) => failures.push(error.message));
		await page.addInitScript(() => {
			window.__schedulerEvents = [];
			if (!PerformanceObserver.supportedEntryTypes.includes('event'))
				throw new Error('Event Timing is unavailable');
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.interactionId)
						window.__schedulerEvents.push({
							interactionId: entry.interactionId,
							duration: entry.duration,
							startTime: entry.startTime,
						});
				}
			}).observe({ type: 'event', buffered: true, durationThreshold: 16 });
		});
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: options.cpuRate ?? 6 });
		const trace = [];
		cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
		await cdp.send('Tracing.start', {
			categories:
				'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,v8.execute',
			transferMode: 'ReportEvents',
		});
		await page.goto(`${url}/?${new URLSearchParams({ target, scenario, ...options })}`);
		await page.waitForSelector('#draft');
		let heapBefore;
		if (options.memory) {
			await cdp.send('HeapProfiler.collectGarbage');
			heapBefore = await cdp.send('Runtime.getHeapUsage');
			await cdp.send('HeapProfiler.startSampling', {
				samplingInterval: 32768,
				includeObjectsCollectedByMajorGC: true,
				includeObjectsCollectedByMinorGC: true,
			});
		}
		const input = page.locator('#draft');
		await input.focus();
		// The first trusted input releases the entire ready backlog. Awaiting a
		// preceding evaluate/click would allow a microtask megatask to finish
		// before typing even begins, producing a false responsiveness result.
		await input.pressSequentially('responsive input', { delay: 10 });
		await page.waitForFunction(() => window.__schedulerBacklog.completedAt > 0);
		await page.waitForFunction(
			() => document.querySelector('#draft-output')?.textContent === 'responsive input',
		);
		// Event Timing notifications are batched. Let the final paint and its
		// observer delivery finish; this delay is outside completion measurement.
		await page.evaluate(
			() =>
				new Promise((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 200))),
				),
		);
		const traceDone = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
		await cdp.send('Tracing.end');
		await traceDone;
		const result = await page.evaluate(() => {
			const state = window.__schedulerBacklog;
			const input = document.querySelector('#draft');
			return {
				...state,
				events: window.__schedulerEvents,
				firstContentfulPaintMs:
					performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
				value: input.value,
				caret: input.selectionEnd,
				focused: document.activeElement === input,
				output:
					document.querySelector('#result')?.textContent ??
					document.querySelector('.result')?.textContent,
				outputs: Array.from(document.querySelectorAll('.result'), (node) => node.textContent),
				pending: document.querySelector('#pending')?.textContent,
			};
		});
		assert.deepEqual(failures, []);
		assert.deepEqual(result.errors, []);
		assert.equal(result.value, 'responsive input');
		assert.equal(result.caret, result.value.length);
		assert.equal(result.focused, true);
		assert.ok(
			result.inputs.length === result.value.length && result.inputs.every((entry) => entry.trusted),
		);
		for (const publications of result.publications)
			assert.deepEqual(
				publications,
				scenario === 'deferred'
					? [result.count]
					: Array.from({ length: result.count }, (_, index) => index + 1),
			);
		for (const output of result.outputs) assert.equal(output, String(result.count));
		if (scenario === 'islands') {
			assert.deepEqual(result.activations, result.values);
			assert.equal(result.adopted, result.count);
			await page.locator('#islands button').last().click();
			assert.equal(
				await page.locator('#islands button').last().getAttribute('data-clicked'),
				'yes',
			);
		} else {
			assert.equal(result.output, String(result.count));
			if (scenario === 'actions') assert.equal(result.pending, 'false');
		}

		let memory = null;
		if (options.memory) {
			const { profile } = await cdp.send('HeapProfiler.stopSampling');
			const heapAtCompletion = await cdp.send('Runtime.getHeapUsage');
			await page.evaluate(() => window.__schedulerDispose());
			await cdp.send('HeapProfiler.collectGarbage');
			const heapAfterDisposal = await cdp.send('Runtime.getHeapUsage');
			memory = {
				sampledAllocationBytes: profile.samples.reduce((sum, sample) => sum + sample.size, 0),
				heapBefore,
				heapAtCompletion,
				heapAfterDisposal,
			};
		}
		const interactions = new Map();
		for (const event of result.events)
			interactions.set(
				event.interactionId,
				Math.max(interactions.get(event.interactionId) ?? 0, event.duration),
			);
		const durations = [...interactions.values()];
		const start = trace.find((event) => event.name === 'backlog-start');
		assert.ok(start, 'trace contains the input that released the backlog');
		const end = start.ts + (result.completedAt - result.startedAt) * 1000;
		const main = trace.filter(
			(event) =>
				event.pid === start.pid &&
				event.tid === start.tid &&
				event.ts < end &&
				event.ts + (event.dur ?? 0) >= start.ts,
		);
		const durationsOf = (name) =>
			main
				.filter((event) => event.name === name && event.ph === 'X')
				.map((event) => event.dur / 1000);
		const paints = main.filter((event) => event.name === 'Paint');
		const usefulPaint = trace
			.filter(
				(event) => event.pid === start.pid && event.tid === start.tid && event.name === 'Paint',
			)
			.find((event) => event.ts >= start.ts + (result.firstCommitAt - result.startedAt) * 1000);
		if (options.tracePath) {
			mkdirSync(path.dirname(options.tracePath), { recursive: true });
			writeFileSync(options.tracePath, JSON.stringify({ traceEvents: trace }));
		}
		return {
			target,
			scenario,
			cpuRate: options.cpuRate ?? 6,
			options,
			startupMs: result.readyAt,
			firstContentfulPaintMs: result.firstContentfulPaintMs,
			firstValueMs: result.firstValueAt - result.startedAt,
			firstCommitMs: result.firstCommitAt - result.startedAt,
			firstPaintAfterCommitMs: usefulPaint ? (usefulPaint.ts - start.ts) / 1000 : null,
			framesDuringWork: result.frames.filter((frame) => frame.at < result.completedAt).length,
			paintsDuringWork: paints.length,
			maxTaskMs: Math.max(0, ...durationsOf('RunTask')),
			maxTaskAfterCompletionMs: Math.max(
				0,
				...trace
					.filter(
						(event) =>
							event.pid === start.pid &&
							event.tid === start.tid &&
							event.ts >= end &&
							event.name === 'RunTask' &&
							event.ph === 'X',
					)
					.map((event) => event.dur / 1000),
			),
			maxMicrotaskCheckpointMs: Math.max(0, ...durationsOf('RunMicrotasks')),
			effects: result.effects,
			effectCleanups: result.effectCleanups,
			memory,
			values: result.values.length,
			commits: result.commits,
			completionMs: result.completedAt - result.startedAt,
			inputsDuringWork: result.inputs.filter(
				(entry) =>
					entry.progress > 0 &&
					entry.progress < (scenario === 'deferred' ? 1 : result.count * result.producers),
			).length,
			trustedInputCount: result.inputs.length,
			interactionCount: durations.length,
			// Missing observations are censored by Chromium's 16 ms floor, not 0 ms.
			eventTiming: durations.length ? summarizeSamples(durations, { scoreMode: 'mean' }) : null,
			eventTimingFloorMs: 16,
		};
	} finally {
		await context.close();
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { launchBrowser } = await import('../../test-utils/playwright-browser.ts');
	const source = process.argv.find((value, index) => index > 1 && !value.startsWith('--'));
	const policy = process.argv.find((arg) => arg.startsWith('--policy='))?.slice(9) ?? 'elapsed';
	const server = await serveBacklogs(source, policy);
	let browser;
	try {
		browser = await launchBrowser({ headless: true });
		const samples = process.argv.includes('--quick') ? 1 : 5;
		const matrix = process.argv.includes('--matrix');
		const cpuRate = Number(process.argv.find((arg) => arg.startsWith('--cpu='))?.slice(6) ?? 6);
		const memory = process.argv.includes('--memory');
		const workArg = process.argv.find((arg) => arg.startsWith('--work-ms='));
		const workMs = workArg === undefined ? undefined : Number(workArg.slice(10));
		const onlyMode = process.argv.find((arg) => arg.startsWith('--mode='))?.slice(7);
		const traceDir = process.argv.find((arg) => arg.startsWith('--trace-dir='))?.slice(12);
		const only = process.argv
			.find((arg) => arg.startsWith('--scenario='))
			?.slice(11)
			.split(',');
		const workloads = [];
		for (const scenario of [
			'query',
			'queries',
			'derived',
			'actions',
			'islands',
			'rpc',
			'renderer',
			'deferred',
		]) {
			for (const target of ['actions', 'deferred'].includes(scenario)
				? ['octane', 'react']
				: ['octane']) {
				for (const mode of matrix ? ['ready', 'cold'] : ['ready']) {
					for (const count of matrix ? [4, 100] : [scenario === 'islands' ? 60 : 100]) {
						workloads.push({
							scenario,
							target,
							options: { count, mode, workMs: workMs ?? (count === 4 ? 0 : 2), cpuRate, memory },
						});
					}
				}
			}
		}
		if (matrix)
			for (const scenario of ['query', 'derived', 'rpc', 'renderer']) {
				for (const mode of ['ready', 'cold'])
					workloads.push({
						scenario,
						target: 'octane',
						options: {
							count: 8,
							producers: 12,
							roots: 'many',
							chunks: 'fragmented',
							mode,
							cpuRate,
							memory,
						},
					});
			}
		if (matrix)
			for (const scenario of ['rpc', 'renderer'])
				workloads.push({
					scenario,
					target: 'octane',
					options: { count: 16, payloadBytes: 65536, cpuRate, memory },
				});
		if (matrix)
			for (const target of ['octane', 'react'])
				workloads.push({
					scenario: 'actions',
					target,
					options: { count: 100, mode: 'blocked', actionWorkMs: 2, cpuRate, memory },
				});
		for (const { scenario, target, options } of workloads) {
			if (onlyMode && options.mode !== onlyMode) continue;
			if (only && !only.includes(scenario)) continue;
			await measureBacklog(browser, server.url, scenario, target, options); // Warmup, excluded.
			const results = [];
			for (let sample = 0; sample < samples; sample++)
				results.push(
					await measureBacklog(browser, server.url, scenario, target, {
						...options,
						...(traceDir && sample === 0
							? {
									tracePath: path.join(
										traceDir,
										`${policy}-${target}-${scenario}-${options.mode ?? 'ready'}-${options.count}-${options.producers ?? 1}-${options.payloadBytes ?? 0}.json`,
									),
								}
							: {}),
					}),
				);
			console.log(
				JSON.stringify({
					policy,
					environment: {
						node: process.version,
						chromium: browser.version(),
						platform: process.platform,
						arch: process.arch,
					},
					target,
					scenario,
					options,
					bundleBytes: server.bundleBytes,
					completion: summarizeSamples(results.map((result) => result.completionMs)),
					samples: results,
				}),
			);
		}
	} finally {
		await browser?.close();
		await server.close();
	}
}
