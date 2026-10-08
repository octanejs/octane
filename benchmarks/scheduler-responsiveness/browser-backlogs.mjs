import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { summarizeSamples } from '../lib/stats.mjs';

const repository = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(repository, 'packages/octane/tests/browser/scheduler-backlogs');

/** Production bundles and one local server shared by Vitest and the CLI. */
export async function serveBacklogs(source = repository) {
	const dependencies = createRequire(path.join(repository, 'packages/octane/package.json'));
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
	const islands = Array.from(
		{ length: 60 },
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
				'alien-signals': dependencies.resolve('alien-signals'),
				'alien-signals/system': dependencies.resolve('alien-signals/system'),
				react: react.resolve('react'),
				'react-dom/client': react.resolve('react-dom/client'),
			},
			plugins: [
				{
					name: 'source-checkout',
					setup(builder) {
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
				`<!doctype html><meta charset="utf-8"><title>Scheduler backlog</title><div id="root"></div><div id="islands">${url.searchParams.get('scenario') === 'islands' ? islands : ''}</div><script type="module" src="/${target}.js"></script>`,
			);
		} else {
			response.statusCode = 404;
			response.end();
		}
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	return {
		url: `http://127.0.0.1:${server.address().port}`,
		close: () =>
			new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			),
	};
}

export async function measureBacklog(browser, url, scenario, target = 'octane') {
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
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
		await page.goto(`${url}/?target=${target}&scenario=${scenario}`);
		const input = page.locator('#draft');
		await input.focus();
		// The first trusted input releases the entire ready backlog. Awaiting a
		// preceding evaluate/click would allow a microtask megatask to finish
		// before typing even begins, producing a false responsiveness result.
		await input.pressSequentially('responsive input');
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
		const result = await page.evaluate(() => {
			const state = window.__schedulerBacklog;
			const input = document.querySelector('#draft');
			return {
				...state,
				events: window.__schedulerEvents,
				value: input.value,
				caret: input.selectionEnd,
				focused: document.activeElement === input,
				output: document.querySelector('#result')?.textContent,
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
		assert.deepEqual(
			result.values,
			Array.from({ length: result.count }, (_, index) => index + 1),
		);
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
		const interactions = new Map();
		for (const event of result.events)
			interactions.set(
				event.interactionId,
				Math.max(interactions.get(event.interactionId) ?? 0, event.duration),
			);
		const durations = [...interactions.values()];
		return {
			target,
			scenario,
			cpuRate: 6,
			values: result.values.length,
			commits: result.commits,
			completionMs: result.completedAt - result.startedAt,
			inputsDuringWork: result.inputs.filter(
				(entry) => entry.progress > 0 && entry.progress < result.count,
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
	const server = await serveBacklogs(source);
	let browser;
	try {
		browser = await launchBrowser({ headless: true });
		const samples = process.argv.includes('--quick') ? 1 : 5;
		for (const [scenario, target] of [
			['query', 'octane'],
			['derived', 'octane'],
			['actions', 'octane'],
			['islands', 'octane'],
			['actions', 'react'],
		]) {
			await measureBacklog(browser, server.url, scenario, target); // Warmup, excluded.
			const results = [];
			for (let sample = 0; sample < samples; sample++)
				results.push(await measureBacklog(browser, server.url, scenario, target));
			console.log(
				JSON.stringify({
					target,
					scenario,
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
