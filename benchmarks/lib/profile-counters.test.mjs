import assert from 'node:assert/strict';
import test from 'node:test';
import { collectProfileCounters } from './profile-counters.mjs';

// A page whose profiler counts each hook's work into `arm.swap`. Hooks named in
// `work` add that much; snapshots and diffs go through the page as they would
// in a browser, so the double sees the same evaluate sequence.
function browserDouble({ work = {}, rejectHook, browserMessage, counters = true } = {}) {
	const events = [];
	const listeners = new Map();
	let swaps = 0;
	const snapshot = () => ({
		schema: 1,
		generation: 1,
		build: 'development',
		renderers: counters ? ['dom'] : [],
		recording: true,
		time: 0,
		counters: counters ? { 'arm.swap': swaps } : {},
	});
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
		async evaluate(fn, arg) {
			if (arg === undefined) {
				events.push(['snapshot']);
				return snapshot();
			}
			if (Array.isArray(arg)) {
				events.push(['diff']);
				const [before, after] = arg;
				const diffed = {};
				for (const name of Object.keys(after.counters))
					diffed[name] = after.counters[name] - before.counters[name];
				return { ...after, duration: 0, counters: diffed };
			}
			events.push(['hook', arg.name, arg.arg]);
			swaps += work[arg.name] ?? 0;
			if (arg.name === rejectHook) throw new Error('semantic verification failed');
			if (arg.name === browserMessage?.hook) {
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
	const context = {
		async newPage() {
			return page;
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

test('counts only the operation: setup and verification run outside the snapshots', async () => {
	const { browser, events } = browserDouble({ work: { __prepare: 5, __update: 2, __verify: 7 } });
	const diff = await collectProfileCounters(browser, {
		url: 'http://127.0.0.1/',
		before: [{ name: '__prepare', arg: 'direct' }],
		operation: '__update',
		after: ['__verify'],
	});
	assert.deepEqual(diff.counters, { 'arm.swap': 2 });
	assert.deepEqual(events, [
		['goto', 'http://127.0.0.1/'],
		['ready'],
		['hook', '__prepare', 'direct'],
		['snapshot'],
		['hook', '__update', undefined],
		['snapshot'],
		['diff'],
		['hook', '__verify', undefined],
		['close'],
	]);
});

test('a failed postcondition fails the sample and still closes the context', async () => {
	const { browser, events } = browserDouble({ rejectHook: '__verify' });
	await assert.rejects(
		collectProfileCounters(browser, {
			url: 'http://127.0.0.1/',
			operation: '__update',
			after: ['__verify'],
		}),
		/semantic verification failed/,
	);
	assert.deepEqual(events.at(-1), ['close']);
});

test('a build without installed counters fails before verification', async () => {
	const { browser, events } = browserDouble({ counters: false });
	await assert.rejects(
		collectProfileCounters(browser, {
			url: 'http://127.0.0.1/',
			operation: '__update',
			after: ['__verify'],
		}),
		/installed no engine counters/,
	);
	assert.equal(
		events.some(([event, name]) => event === 'hook' && name === '__verify'),
		false,
	);
	assert.deepEqual(events.at(-1), ['close']);
});

for (const event of ['pageerror', 'console']) {
	test(`${event} errors fail a sample even when its semantic hook resolves`, async () => {
		const { browser, events } = browserDouble({
			browserMessage: { hook: '__verify', event, type: 'error', text: 'callback failed' },
		});
		await assert.rejects(
			collectProfileCounters(browser, {
				url: 'http://127.0.0.1/',
				operation: '__update',
				after: ['__verify'],
			}),
			/profile browser errors: callback failed/,
		);
		assert.deepEqual(events.at(-1), ['close']);
	});
}
