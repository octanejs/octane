import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const EXPECTED_SNAPSHOTS = Object.freeze({
	'capture-only': {
		prevented: true,
		bubbled: false,
	},
	'root-static': {
		text: 'Octane',
		cleaned: true,
	},
	'root-static-specialized': {
		text: 'Octane',
	},
	'hooks-state': {
		before: '0',
		after: '1',
		clicks: 1,
		effects: 1,
		cleanups: 1,
		cleaned: true,
	},
	context: {
		before: 'light',
		after: 'dark',
		cleaned: true,
	},
	'hydrate-root': {
		adopted: true,
		before: 'server',
		after: 'client',
		cleaned: true,
	},
	'deferred-hydration': {
		before: 'dormant',
		after: 'active',
		clicks: 1,
		cleaned: true,
	},
	'suspense-transition': {
		pending: 'loading',
		resolved: 'ready',
		transition: 'next',
		cleaned: true,
	},
	'binding-vanilla': {
		before: 0,
		after: 1,
		notifications: 1,
	},
	'binding-hooks': {
		before: '0',
		after: '1',
		cleaned: true,
	},
});

/**
 * Execute the same production bytes whose reachability and size were measured.
 * Every scenario receives a fresh browser realm, so delegated events, pending
 * work, hydration listeners, and application globals cannot leak across runs.
 */
export async function verifyScenario(id, code) {
	const expected = EXPECTED_SNAPSHOTS[id];
	assert.notEqual(expected, undefined, `Unknown minimal-import scenario: ${id}`);
	assert.equal(typeof code, 'string', `${id}: expected executable production JavaScript`);
	assert.notEqual(code.length, 0, `${id}: production JavaScript must not be empty`);

	const failures = [];
	const virtualConsole = new VirtualConsole();
	virtualConsole.on('jsdomError', (error) => failures.push(error));
	const dom = new JSDOM('<!doctype html><html><body></body></html>', {
		url: 'https://octane.test/',
		runScripts: 'dangerously',
		pretendToBeVisual: true,
		virtualConsole,
	});
	const { window } = dom;
	const container = window.document.createElement('div');
	container.id = 'octane-reachability-root';
	window.document.body.appendChild(container);

	const handleError = (event) => {
		failures.push(event.error ?? new Error(event.message ?? 'Uncaught browser error'));
		event.preventDefault();
	};
	const handleRejection = (event) => {
		failures.push(event.reason ?? new Error('Unhandled browser promise rejection'));
		event.preventDefault();
	};
	window.addEventListener('error', handleError);
	window.addEventListener('unhandledrejection', handleRejection);

	try {
		window.eval(code);
		const scenario = window.__OCTANE_REACHABILITY__;
		assert.equal(
			typeof scenario?.run,
			'function',
			`${id}: production bundle must expose its public scenario runner`,
		);

		const actual = await scenario.run(container);
		if (failures.length !== 0) {
			throw new AggregateError(failures, `${id}: production bundle raised a browser error`);
		}

		// Objects produced by an isolated browser realm have different prototypes.
		// The fixtures intentionally return JSON-only public observations.
		const snapshot = JSON.parse(JSON.stringify(actual));
		assert.deepEqual(snapshot, expected, `${id}: production bundle changed observable behavior`);
		if (expected.cleaned === true) {
			assert.equal(
				container.childNodes.length,
				0,
				`${id}: root.unmount() left rendered content behind`,
			);
		}
		return snapshot;
	} finally {
		window.removeEventListener('error', handleError);
		window.removeEventListener('unhandledrejection', handleRejection);
		dom.window.close();
	}
}
