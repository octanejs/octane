import assert from 'node:assert/strict';
import test from 'node:test';
import { collectPreciseCalls } from './precise-work.mjs';

function browserDouble({ operationCount = 3, rejectHook, browserMessage } = {}) {
	const events = [];
	const listeners = new Map();
	let snapshots = 0;
	const page = {
		on(event, listener) {
			listeners.set(event, listener);
		},
		async goto(url) {
			events.push(['goto', url]);
		},
		async waitForFunction() {
			events.push(['ready']);
		},
		async evaluate(_fn, hook) {
			events.push(['hook', hook.name, hook.arg]);
			if (hook.name === rejectHook) throw new Error('semantic verification failed');
			if (hook.name === browserMessage?.hook) {
				if (browserMessage.event === 'pageerror') {
					listeners.get('pageerror')?.(new Error(browserMessage.text));
				} else {
					listeners.get('console')?.({
						type: () => browserMessage.type,
						text: () => browserMessage.text,
					});
				}
			}
		},
	};
	const cdp = {
		async send(method) {
			events.push([method]);
			if (method !== 'Profiler.takePreciseCoverage') return {};
			snapshots++;
			return {
				result: [
					{
						url: 'http://127.0.0.1/assets/fixture.js',
						functions: [
							{
								functionName: 'measuredWork',
								ranges: [{ count: snapshots === 3 ? operationCount : 100 }],
							},
						],
					},
					{
						url: 'http://127.0.0.1/driver.js',
						functions: [{ functionName: 'measuredWork', ranges: [{ count: 100 }] }],
					},
				],
			};
		},
	};
	const context = {
		async newPage() {
			return page;
		},
		async newCDPSession() {
			return cdp;
		},
		async close() {
			events.push(['close']);
		},
	};
	return {
		events,
		browser: {
			async newContext() {
				return context;
			},
		},
	};
}

test('postconditions run after the measured snapshot and preserve only operation counts', async () => {
	const { browser, events } = browserDouble();
	const counts = await collectPreciseCalls(browser, {
		url: 'http://127.0.0.1/',
		before: [{ name: '__prepare', arg: 'direct' }],
		operation: '__update',
		after: [{ name: '__verify', arg: 'unchanged' }, '__cleanup'],
		metrics: ['measuredWork', 'unusedWork'],
	});
	assert.deepEqual(counts, { measuredWork: 3, unusedWork: 0 });
	assert.deepEqual(events, [
		['Profiler.enable'],
		['Profiler.startPreciseCoverage'],
		['goto', 'http://127.0.0.1/'],
		['ready'],
		['Profiler.takePreciseCoverage'],
		['hook', '__prepare', 'direct'],
		['Profiler.takePreciseCoverage'],
		['hook', '__update', undefined],
		['Profiler.takePreciseCoverage'],
		['hook', '__verify', 'unchanged'],
		['hook', '__cleanup', undefined],
		['Profiler.stopPreciseCoverage'],
		['Profiler.disable'],
		['close'],
	]);
});

test('a failed postcondition fails the sample and still closes the profiler and context', async () => {
	const { browser, events } = browserDouble({ rejectHook: '__verify' });
	await assert.rejects(
		collectPreciseCalls(browser, {
			url: 'http://127.0.0.1/',
			operation: '__update',
			after: ['__verify'],
			metrics: ['measuredWork'],
		}),
		/semantic verification failed/,
	);
	assert.deepEqual(events.slice(-3), [
		['Profiler.stopPreciseCoverage'],
		['Profiler.disable'],
		['close'],
	]);
});

test('postconditions cannot rescue an operation with no production call coverage', async () => {
	const { browser, events } = browserDouble({ operationCount: 0 });
	await assert.rejects(
		collectPreciseCalls(browser, {
			url: 'http://127.0.0.1/',
			operation: '__update',
			after: ['__verify'],
			metrics: ['measuredWork'],
		}),
		/no production asset call coverage/,
	);
	assert.equal(
		events.some(([event, name]) => event === 'hook' && name === '__verify'),
		false,
	);
	assert.deepEqual(events.slice(-3), [
		['Profiler.stopPreciseCoverage'],
		['Profiler.disable'],
		['close'],
	]);
});

for (const event of ['pageerror', 'console']) {
	test(`${event} errors fail a sample even when its semantic hook resolves`, async () => {
		const { browser, events } = browserDouble({
			browserMessage: { hook: '__verify', event, type: 'error', text: 'callback failed' },
		});
		await assert.rejects(
			collectPreciseCalls(browser, {
				url: 'http://127.0.0.1/',
				operation: '__update',
				after: ['__verify'],
				metrics: ['measuredWork'],
			}),
			/production browser errors: callback failed/,
		);
		assert.deepEqual(events.slice(-3), [
			['Profiler.stopPreciseCoverage'],
			['Profiler.disable'],
			['close'],
		]);
	});
}

test('non-error console messages do not fail a measured sample', async () => {
	const { browser } = browserDouble({
		browserMessage: { hook: '__verify', event: 'console', type: 'warning', text: 'diagnostic' },
	});
	assert.deepEqual(
		await collectPreciseCalls(browser, {
			url: 'http://127.0.0.1/',
			operation: '__update',
			after: ['__verify'],
			metrics: ['measuredWork'],
		}),
		{ measuredWork: 3 },
	);
});
