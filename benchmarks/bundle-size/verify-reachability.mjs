import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const EXPECTED_SNAPSHOTS = Object.freeze({
	'capture-only': {
		prevented: true,
		bubbled: false,
	},
	'cli-spa-starter': {
		page: true,
		title: 'octane',
		quickStart: 'Quick start',
		quickStartHref: 'https://octanejs.dev/docs/quick-start',
		links: 4,
		styled: true,
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
	'server-hooks': {
		first: 0,
		second: 2,
		escaped: '&lt;Octane &amp; SSR&gt;',
	},
	'server-render': {
		html: '<main id="minimal-server">Octane</main>',
		css: '',
	},
	'component-owned-effects': {
		text: 'retained',
		clicks: 1,
		clickRegistered: true,
		auxclickRegistered: false,
		retainedStyle: true,
		unusedStyle: false,
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
	'binding-base-ui': {
		role: 'separator',
		orientation: 'vertical',
		cleaned: true,
	},
	'binding-aria': {
		id: 'minimal-aria',
		'aria-label': 'Sections',
		role: 'separator',
		'aria-orientation': 'vertical',
	},
	'binding-motion': {
		opacity: '0.25',
		stoppable: true,
		cleaned: true,
	},
	'binding-radix': {
		role: 'separator',
		orientation: 'vertical',
		dataOrientation: 'vertical',
		cleaned: true,
	},
	'binding-floating-ui': {
		x: 20,
		y: 30,
		placement: 'bottom',
	},
	'binding-mantine-hooks': {
		before: '2',
		after: '3',
		cleaned: true,
	},
	'binding-usehooks-ts': {
		before: '4',
		after: '5',
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
	container.id = id === 'cli-spa-starter' ? 'root' : 'octane-reachability-root';
	window.document.body.appendChild(container);
	const focusBefore = window.HTMLElement.prototype.focus;
	const listeners = { document: new Set(), body: new Set(), window: new Set() };
	if (id === 'binding-aria') {
		Object.defineProperty(window, 'PointerEvent', { configurable: true, value: window.MouseEvent });
		for (const [target, key] of [
			[window.document, 'document'],
			[window.document.body, 'body'],
			[window, 'window'],
		]) {
			const add = target.addEventListener.bind(target);
			target.addEventListener = (type, ...args) => {
				listeners[key].add(type);
				return add(type, ...args);
			};
		}
	}

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
		if (id === 'binding-aria') {
			window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
			assert.notEqual(
				window.HTMLElement.prototype.focus,
				focusBefore,
				`${id}: public package import lost its global browser focus patch`,
			);
			for (const type of ['keydown', 'keyup', 'click', 'pointerdown', 'pointermove', 'pointerup']) {
				assert.equal(
					listeners.document.has(type),
					true,
					`${id}: missing document ${type} listener`,
				);
			}
			for (const type of ['focus', 'blur']) {
				assert.equal(listeners.window.has(type), true, `${id}: missing window ${type} listener`);
			}
			for (const type of ['transitionrun', 'transitionend']) {
				assert.equal(listeners.body.has(type), true, `${id}: missing body ${type} listener`);
			}
		}
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
		if (id === 'server-render') {
			// Hydratable output may contain compiler-owned boundary comments. Compare
			// its rendered markup without depending on that private marker protocol.
			const markup = window.document.createElement('template');
			markup.innerHTML = snapshot.html;
			const comments = window.document.createTreeWalker(
				markup.content,
				window.NodeFilter.SHOW_COMMENT,
			);
			let comment = comments.nextNode();
			while (comment !== null) {
				const next = comments.nextNode();
				comment.remove();
				comment = next;
			}
			snapshot.html = markup.innerHTML;
		}
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
