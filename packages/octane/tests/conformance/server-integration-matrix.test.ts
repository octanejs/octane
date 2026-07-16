import { expect } from 'vitest';
import { flushSync } from 'octane';
import { loadServerFixture } from '../_server-fixture.js';
import * as anonymousDefaultClient from './_fixtures/anonymous-default-root.tsrx';
import * as client from './_fixtures/server-integration-matrix.tsrx';
import { createServerRenderMatrix } from './_helpers/server-render-matrix.js';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/server-integration-matrix.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const matrix = createServerRenderMatrix({ clientModule: client, serverModule: server });
const anonymousDefaultServer = loadServerFixture<typeof anonymousDefaultClient>(
	'packages/octane/tests/conformance/_fixtures/anonymous-default-root.tsrx',
);
const anonymousDefaultMatrix = createServerRenderMatrix({
	clientModule: anonymousDefaultClient,
	serverModule: anonymousDefaultServer,
});
Object.freeze(anonymousDefaultClient.default);

function replaceWithMismatchedMarkup(container: HTMLElement): void {
	const wrong = document.createElement('aside');
	wrong.id = 'wrong-server-tree';
	wrong.textContent = 'wrong';
	container.replaceChildren(wrong);
}

function appendTrailingServerNode(container: HTMLElement): void {
	const extra = document.createElement('aside');
	extra.id = 'extra-server-root';
	extra.textContent = 'extra';
	container.appendChild(extra);
}

function replaceWithMismatchedMarkupAndTrailingNode(container: HTMLElement): void {
	replaceWithMismatchedMarkup(container);
	appendTrailingServerNode(container);
}

const structuralMismatch = { mutateServerDom: replaceWithMismatchedMarkup } as const;

// Per ReactDOMServerIntegrationBasic-test.js:87, "an array with several children".
matrix.itRenders('renders an array with several children', {
	component: 'BasicArray',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#basic-first')?.textContent).toBe('text1');
		expect(root.querySelector('#basic-second')?.textContent).toBe('text2');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	captureBeforeHydrate: (container) => container.querySelector('#basic-first'),
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#basic-first')).toBe(before);
		},
	},
});

// Per ReactDOMServerIntegrationBasic-test.js:87, "an array with several children".
matrix.itRenders('diagnoses a mismatched renderable root from an expression-arrow component', {
	component: 'ArrowArrayRoot',
	modes: ['hydrate-mismatch'],
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#arrow-root')?.textContent).toBe('arrow root');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
anonymousDefaultMatrix.itRenders(
	'diagnoses a mismatched renderable root from an anonymous default component',
	{
		component: 'default',
		modes: ['hydrate-mismatch'],
		mismatch: {
			...structuralMismatch,
			diagnostics(messages) {
				if (process.env.OCTANE_TEST_COMPILE_MODE === 'prod') {
					expect(messages).toEqual([]);
				} else {
					expect(messages.join('\n')).toMatch(/anonymous-default-root\.tsrx:\d+:\d+/);
				}
			},
		},
		assertCommon({ root }) {
			expect(root.querySelector('#default-arrow-root')?.textContent).toBe('default arrow root');
			expect(root.querySelector('#wrong-server-tree')).toBeNull();
		},
	},
);

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
matrix.itRenders('diagnoses a mismatched renderable root through memo', {
	component: 'MemoArrayRoot',
	modes: ['hydrate-mismatch'],
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#memo-array-root')?.textContent).toBe('memo array root');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
matrix.itRenders('diagnoses a mismatched renderable root through lazy', {
	component: 'LazyArrayRoot',
	modes: ['hydrate-mismatch'],
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#memo-array-root')?.textContent).toBe('memo array root');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
matrix.itRenders('removes a trailing server sibling after adopting a matching host root', {
	component: 'AttributeValues',
	modes: ['hydrate-mismatch'],
	mismatch: { mutateServerDom: appendTrailingServerNode },
	captureBeforeHydrate: (container) => container.querySelector('#attribute-values'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#attribute-values')).toBe(before);
		expect(root.querySelector('#extra-server-root')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
matrix.itRenders('preserves a rebuilt host root while removing all stale server siblings', {
	component: 'AttributeValues',
	modes: ['hydrate-mismatch'],
	mismatch: { mutateServerDom: replaceWithMismatchedMarkupAndTrailingNode },
	assertCommon({ root }) {
		expect(root.querySelector('#attribute-values')).not.toBeNull();
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
		expect(root.querySelector('#extra-server-root')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:1476, "server renders an extra Fragment node".
matrix.itRenders('removes a trailing server sibling after adopting a matching fragment', {
	component: 'NestedFragment',
	modes: ['hydrate-mismatch'],
	mismatch: { mutateServerDom: appendTrailingServerNode },
	captureBeforeHydrate: (container) => container.querySelector('#fragment-first'),
	assertCommon({ root, before }) {
		expect(root.querySelector('#fragment-first')).toBe(before);
		expect(root.querySelector('#extra-server-root')).toBeNull();
	},
});

// Per ReactDOMHydrationDiff-test.js:944, "server renders an extra element in the end".
matrix.itRenders('preserves an updatable primitive root while removing a trailing server sibling', {
	component: 'PrimitiveRoot',
	props: () => ({ mode: 'text', text: 'primitive text' }),
	modes: ['hydrate-mismatch'],
	mismatch: { mutateServerDom: appendTrailingServerNode },
	assertCommon({ root, octaneRoot }) {
		expect(root.textContent).toBe('primitive text');
		expect(root.querySelector('#extra-server-root')).toBeNull();

		flushSync(() => octaneRoot!.render(client.PrimitiveRoot, { mode: 'empty' }));
		expect(root.textContent).toBe('');
		flushSync(() => octaneRoot!.render(client.PrimitiveRoot, { mode: 'element' }));
		expect(root.querySelector('#primitive-root-element')?.textContent).toBe('element');
	},
});

// Per ReactDOMServerIntegrationBasic-test.js:75, "a bigint".
matrix.itRenders('renders a bigint', {
	component: 'BasicBigInt',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.textContent).toBe('42');
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationElements-test.js:182, "an element with two text children".
matrix.itRenders('renders an element with two adjacent text children', {
	component: 'AdjacentText',
	props: () => ({ first: 'hello ', second: 'world' }),
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#adjacent-text')?.textContent).toBe('hello world');
	},
	captureBeforeHydrate: (container) => container.querySelector('#adjacent-text'),
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#adjacent-text')).toBe(before);
		},
	},
});

// Per ReactDOMServerIntegrationAttributes-test.js:121, :333, :416, and :620.
matrix.itRenders('renders representative standard, data, and style attributes', {
	component: 'AttributeValues',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const section = root.querySelector('#attribute-values') as HTMLElement;
		expect(section.hidden).toBe(true);
		expect(section.getAttribute('data-foobar')).toBe('false');
		expect(section.style.marginTop).toBe('2px');
		expect(section.style.getPropertyValue('--tone')).toBe('blue');
		expect(section.querySelector('label')?.getAttribute('for')).toBe('attribute-target');
		expect(section.querySelector('input')?.getAttribute('size')).toBe('2');
	},
});

// Per ReactDOMServerIntegrationFragment-test.js:79, "a nested fragment".
matrix.itRenders('renders a nested fragment', {
	component: 'NestedFragment',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(Array.from(root.querySelectorAll('[id^="fragment-"]'), (element) => element.id)).toEqual(
			['fragment-first', 'fragment-second', 'fragment-third'],
		);
		expect(root.querySelector('#wrong-server-tree')).toBeNull();
	},
	captureBeforeHydrate: (container) => container.querySelector('#fragment-first'),
	assertByMode: {
		'hydrate-match'({ root, before }) {
			expect(root.querySelector('#fragment-first')).toBe(before);
		},
	},
});

// Per ReactDOMServerIntegrationInput-test.js:74, "an input value overriding defaultValue".
matrix.itRenders('renders an input value overriding defaultValue', {
	component: 'ControlledInputMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-input') as HTMLInputElement;
		expect(input.value).toBe('foo');
		expect(input.getAttribute('value')).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationCheckbox-test.js:74, "a checkbox checked overriding defaultChecked".
matrix.itRenders('renders checked overriding defaultChecked', {
	component: 'ControlledCheckboxMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-checkbox') as HTMLInputElement;
		expect(input.checked).toBe(true);
		expect(input.hasAttribute('checked')).toBe(true);
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:87, "a textarea value overriding defaultValue".
matrix.itRenders('renders a textarea value overriding defaultValue', {
	component: 'ControlledTextareaMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea') as HTMLTextAreaElement;
		expect(textarea.value).toBe('foo');
		expect(textarea.textContent).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:121, "a select value overriding defaultValue".
matrix.itRenders('renders a select value overriding defaultValue', {
	component: 'ControlledSelectMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const select = root.querySelector('#matrix-select') as HTMLSelectElement;
		expect(select.value).toBe('bar');
		expect(Array.from(select.options, (option) => option.selected)).toEqual([false, true, false]);
	},
});

// Per ReactDOMServerIntegrationHooks-test.js:92, "basic render" for useState.
matrix.itRenders('renders the initial useState value', {
	component: 'InitialState',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#initial-state')?.textContent).toBe('Count: 2');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:142, "a child context overriding a parent context".
matrix.itRenders('renders an inner context value over its parent value', {
	component: 'NestedContext',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#context-value')?.textContent).toBe('red');
	},
});

// Per ReactDOMServerIntegrationRefs-test.js:41, :52, and :63.
matrix.itRenders('omits refs on the server and attaches the adopted client element', {
	component: 'HostRef',
	createState: () => ({ attached: [] as Element[] }),
	props: ({ state }) => ({
		refCallback(value: Element | null) {
			if (value !== null) state.attached.push(value);
		},
	}),
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#matrix-ref')?.textContent).toBe('ref target');
	},
	assertByMode: {
		client({ root, state }) {
			expect(state.attached).toEqual([root.querySelector('#matrix-ref')]);
		},
		'server-string'({ state }) {
			expect(state.attached).toEqual([]);
		},
		'server-stream'({ state }) {
			expect(state.attached).toEqual([]);
		},
		'hydrate-match'({ root, state }) {
			expect(state.attached).toEqual([root.querySelector('#matrix-ref')]);
		},
		'hydrate-mismatch'({ root, state }) {
			expect(state.attached).toEqual([root.querySelector('#matrix-ref')]);
		},
	},
});

// Per ReactDOMServerIntegrationSpecialTypes-test.js:101, "basic render" for memo.
matrix.itRenders('renders a memoized function component', {
	component: 'MemoComponent',
	props: () => ({ count: 3 }),
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#memo-value')?.textContent).toBe('Count: 3');
	},
});

// Per ReactDOMServerIntegrationObject-test.js:39, "an object with children".
matrix.itRenders('renders an object element with children', {
	component: 'ObjectElement',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const object = root.querySelector('#matrix-object');
		expect(object?.getAttribute('data')).toBe('/example.webm');
		expect(object?.getAttribute('width')).toBe('600');
		expect(object?.textContent).toBe('preview');
	},
});
