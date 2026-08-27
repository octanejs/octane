import assert from 'node:assert/strict';
import test from 'node:test';
import { runTarget } from './run.mjs';
import { CASES, elementCount, modelSignature } from './shared/workloads.js';

function successfulGates() {
	return [0, 1].flatMap((cycle) =>
		CASES.map((entry) => ({
			name: entry.name,
			cycle,
			before: {
				signature: modelSignature(entry.before),
				elements: elementCount(entry.before),
			},
			after: {
				signature: modelSignature(entry.after),
				elements: elementCount(entry.after),
			},
			identityShared: 0,
			identityBroken: 0,
		})),
	);
}

function browserDouble() {
	const listeners = new Map();
	let contextClosed = false;
	let deferredPageError = null;
	const page = {
		on(event, listener) {
			listeners.set(event, listener);
		},
		async goto() {},
		async waitForFunction() {},
		async evaluate(callback) {
			if (callback.toString().includes('window.crossOriginIsolated')) return true;
			if (callback.toString().includes('setTimeout(resolvePromise') && deferredPageError !== null) {
				listeners.get('pageerror')?.(deferredPageError);
				deferredPageError = null;
			}
		},
		deferPageError(error) {
			deferredPageError = error;
		},
	};
	return {
		page,
		get contextClosed() {
			return contextClosed;
		},
		browser: {
			async newContext() {
				return {
					async newPage() {
						return page;
					},
					async close() {
						contextClosed = true;
					},
				};
			},
		},
	};
}

test('a browser error raised during timing fails the case and closes its context', async () => {
	const double = browserDouble();
	const firstCase = CASES[0].name;
	await assert.rejects(
		runTarget(
			double.browser,
			{ name: 'fixture', url: 'http://127.0.0.1/' },
			{
				gateTargetFn: async () => successfulGates(),
				timeCaseFn: async (page) => {
					page.deferPageError(new Error('measurement callback failed'));
					return [1];
				},
			},
		),
		(error) => {
			assert.match(error.message, /fixture browser errors during timing/);
			assert.ok(error.message.includes(firstCase));
			assert.match(error.message, /measurement callback failed/);
			return true;
		},
	);
	assert.equal(double.contextClosed, true);
});
