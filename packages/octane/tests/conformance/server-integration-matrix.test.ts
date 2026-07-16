import { expect, it, vi } from 'vitest';
import { createRoot, flushSync } from 'octane';
import { compile } from 'octane/compiler';
import { renderToString } from 'octane/server';
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
const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function expectSelectedOptions(
	root: ParentNode,
	selector: string,
	selectedValues: readonly string[],
): HTMLSelectElement {
	const select = root.querySelector(selector) as HTMLSelectElement;
	expect(select.getAttribute('value')).toBeNull();
	expect(select.getAttribute('defaultValue')).toBeNull();
	expect(
		Array.from(select.options)
			.filter((option) => option.selected)
			.map((option) => option.value),
	).toEqual(selectedValues);
	return select;
}

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

// Per ReactDOMServerIntegrationHooks-test.js:156, "multiple times when an updater is called".
matrix.itRenders('settles multiple useState updates scheduled during render', {
	component: 'RenderPhaseStateMany',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#render-phase-state-many')?.textContent).toBe('Count: 12');
	},
});

// Per ReactDOMServerIntegrationHooks-test.js:263, "using reducer passed at time of render,
// not time of dispatch".
matrix.itRenders('uses the current reducer while settling render-phase dispatches', {
	component: 'RenderPhaseCurrentReducer',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#render-phase-current-reducer')?.textContent).toBe('Count: 21');
	},
});

// Per ReactDOMServerIntegrationHooks-test.js:263, "using reducer passed at time of render,
// not time of dispatch". Octane's third tuple getter must preserve that converged state.
matrix.itRenders('keeps the reducer getter aligned with current-reducer render retries', {
	component: 'RenderPhaseCurrentReducerGetter',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#render-phase-current-reducer-getter')?.textContent).toBe(
			'Count: 21|Getter: 21',
		);
	},
});

// Per ReactDOMServerIntegrationHooks-test.js:353/:380, :468/:491, and :576.
matrix.itRenders('preserves memo, callback, and ref hook cells across render retries', {
	component: 'RenderPhaseMemoCallbackRef',
	createState: () => ({ computations: [] as string[] }),
	props: ({ state }) => ({
		onCompute(value: string) {
			state.computations.push(value);
		},
	}),
	mismatch: structuralMismatch,
	assertCommon({ root, mode, state }) {
		expect(root.querySelector('#render-phase-memo-callback-ref')?.textContent).toBe(
			'HELLO, WORLD./HELLO, WORLD.',
		);
		const onePass = ['hello', 'hello, world.'];
		expect(state.computations).toEqual(
			mode === 'hydrate-match' || mode === 'hydrate-mismatch' ? [...onePass, ...onePass] : onePass,
		);
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:110, "stateless child with wrong context".
matrix.itRenders('reads a context default outside a provider', {
	component: 'DefaultContextValue',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#default-context')?.textContent).toBe('none');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:123, "with context passed through to a grandchild".
matrix.itRenders('passes a context value through function-component intermediaries', {
	component: 'GrandchildContextValue',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#grandchild-context')?.textContent).toBe('purple');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:200, "multiple contexts".
matrix.itRenders('keeps multiple context values independent', {
	component: 'MultipleContexts',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#multiple-theme')?.textContent).toBe('light');
		expect(root.querySelector('#multiple-language')?.textContent).toBe('english');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:239, "nested context unwinding".
matrix.itRenders('unwinds deeply nested context providers to each enclosing value', {
	component: 'NestedContextUnwinding',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#theme1')?.textContent).toBe('dark');
		expect(root.querySelector('#theme2')?.textContent).toBe('light');
		expect(root.querySelector('#theme3')?.textContent).toBe('blue');
		expect(root.querySelector('#language1')?.textContent).toBe('chinese');
		expect(root.querySelector('#language2')?.textContent).toBe('sanskrit');
		expect(root.querySelector('#language3')?.textContent).toBe('french');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:297, "should treat Context as Context.Provider".
matrix.itRenders('supports the React 19 context provider shorthand', {
	component: 'ContextProviderShorthand',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(client.contextProviderIdentity).toBe(true);
		expect(server.contextProviderIdentity).toBe(true);
		expect(root.querySelector('#context-provider-shorthand')?.textContent).toBe('dark');
	},
});

// Per ReactDOMServerIntegrationHooks-test.js:705, "can use the same context multiple times in
// the same function". React's class indirection is unnecessary for this function-hook outcome.
matrix.itRenders('reads the same context repeatedly in one function component', {
	component: 'SameContextMultipleReads',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expect(root.querySelector('#same-context-foo-bar')?.textContent).toBe('Foo: 1, Bar: 3');
		expect(root.querySelector('#same-context-baz')?.textContent).toBe('Baz: 5');
	},
});

// Per ReactDOMServerIntegrationNewContext-test.js:321 and
// ReactDOMServerIntegrationHooks-test.js:888. A failed server pass must restore
// both ambient context and hook state before the next public render.
it('does not pollute a later server render after a context or hook error', () => {
	expect(() => renderToString(server.ContextRenderThatThrows)).toThrow('Boo!');
	expect(renderToString(server.ContextAfterThrow).html).toContain('>default</span>');
	expect(() => renderToString(server.RenderPhaseCurrentReducer)).not.toThrow();
});

// Per ReactDOMServerIntegrationInput-test.js:44/:49.
matrix.itRenders('serializes controlled text inputs with native handlers', {
	component: 'InputWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-input-handler') as HTMLInputElement;
		expect(input.value).toBe('foo');
		expect(input.getAttribute('value')).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationInput-test.js:49.
matrix.itRenders('coerces a bigint controlled input value', {
	component: 'BigIntInputWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-input-bigint') as HTMLInputElement;
		expect(input.value).toBe('5');
		expect(input.getAttribute('value')).toBe('5');
	},
});

// Per ReactDOMServerIntegrationInput-test.js:67/:84.
matrix.itRenders('serializes an uncontrolled input default value', {
	component: 'DefaultInputMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-input-default') as HTMLInputElement;
		expect(input.value).toBe('foo');
		expect(input.getAttribute('value')).toBe('foo');
		expect(input.getAttribute('defaultValue')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationInput-test.js:84.
matrix.itRenders('lets an input value override an earlier defaultValue prop', {
	component: 'ReverseControlledInputMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-input-reverse') as HTMLInputElement;
		expect(input.value).toBe('foo');
		expect(input.getAttribute('value')).toBe('foo');
		expect(input.getAttribute('defaultValue')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationCheckbox-test.js:44/:68/:88.
matrix.itRenders('serializes a controlled checkbox with its native change handler', {
	component: 'CheckboxWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-checkbox-handler') as HTMLInputElement;
		expect(input.checked).toBe(true);
	},
});

// Per ReactDOMServerIntegrationCheckbox-test.js:68.
matrix.itRenders('serializes an uncontrolled checkbox default', {
	component: 'DefaultCheckboxMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-checkbox-default') as HTMLInputElement;
		expect(input.checked).toBe(true);
		expect(input.getAttribute('defaultChecked')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationCheckbox-test.js:88.
matrix.itRenders('lets checkbox checked override an earlier defaultChecked prop', {
	component: 'ReverseControlledCheckboxMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const input = root.querySelector('#matrix-checkbox-reverse') as HTMLInputElement;
		expect(input.checked).toBe(true);
		expect(input.getAttribute('defaultChecked')).toBeNull();
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:42/:50/:56/:80/:97.
matrix.itRenders('serializes a controlled textarea with its native input handler', {
	component: 'TextareaWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea-handler') as HTMLTextAreaElement;
		expect(textarea.getAttribute('value')).toBeNull();
		expect(textarea.value).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:50.
matrix.itRenders('coerces a bigint controlled textarea value', {
	component: 'BigIntTextareaWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea-bigint') as HTMLTextAreaElement;
		expect(textarea.getAttribute('value')).toBeNull();
		expect(textarea.value).toBe('5');
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:56.
matrix.itRenders('treats an undefined textarea value as empty and uncontrolled', {
	component: 'UndefinedTextareaMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea-undefined') as HTMLTextAreaElement;
		expect(textarea.getAttribute('value')).toBeNull();
		expect(textarea.value).toBe('');
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:80.
matrix.itRenders('serializes an uncontrolled textarea default value', {
	component: 'DefaultTextareaMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea-default') as HTMLTextAreaElement;
		expect(textarea.getAttribute('value')).toBeNull();
		expect(textarea.getAttribute('defaultValue')).toBeNull();
		expect(textarea.value).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationTextarea-test.js:97.
matrix.itRenders('lets textarea value override an earlier defaultValue prop', {
	component: 'ReverseControlledTextareaMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const textarea = root.querySelector('#matrix-textarea-reverse') as HTMLTextAreaElement;
		expect(textarea.getAttribute('value')).toBeNull();
		expect(textarea.getAttribute('defaultValue')).toBeNull();
		expect(textarea.value).toBe('foo');
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:73/:91/:100.
matrix.itRenders('projects a controlled select with its native change handler', {
	component: 'SelectWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-handler', ['bar']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:91.
matrix.itRenders('projects multiple controlled values with a native change handler', {
	component: 'MultipleSelectWithNativeHandler',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-multiple-handler', ['bar', 'baz']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:100.
matrix.itRenders('projects multiple controlled values on a read-only select', {
	component: 'MultipleSelectReadOnly',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-multiple-readonly', ['bar', 'baz']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:116/:205.
matrix.itRenders('projects an uncontrolled select default value', {
	component: 'DefaultSelectMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-default', ['bar']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:205.
matrix.itRenders('lets select value override an earlier defaultValue prop', {
	component: 'ReverseControlledSelectMarkup',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-reverse', ['bar']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:131.
matrix.itRenders('projects options whose text comes from dangerouslySetInnerHTML', {
	component: 'SelectDangerousOptions',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const select = expectSelectedOptions(root, '#matrix-select-danger', ['bar']);
		expect(Array.from(select.options, (option) => option.textContent)).toEqual([
			'Foo',
			'Bar',
			'Baz',
		]);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:218/:232.
matrix.itRenders('flattens mixed primitive option children', {
	component: 'SelectFlattenedOption',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const select = expectSelectedOptions(root, '#matrix-select-flattened', ['bar']);
		expect(select.options[0].textContent).toBe('A B 5');
		expect(select.options[0].value).toBe('bar');
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:232.
matrix.itRenders('uses flattened option text when value is omitted', {
	component: 'SelectFlattenedOptionWithoutValue',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		const select = expectSelectedOptions(root, '#matrix-select-flattened-no-value', ['A B']);
		expect(select.options[0].textContent).toBe('A B');
		expect(select.options[0].value).toBe('A B');
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:247/:261.
matrix.itRenders('coerces a boolean select value to its matching option string', {
	component: 'SelectBooleanValue',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-boolean', ['true']);
	},
});

// Per ReactDOMServerIntegrationSelect-test.js:261.
matrix.itRenders('does not coerce a missing select value to undefined text', {
	component: 'SelectMissingValue',
	mismatch: structuralMismatch,
	assertCommon({ root }) {
		expectSelectedOptions(root, '#matrix-select-missing', ['first']);
	},
});

// React's text controls rely on synthetic onChange. Octane's corresponding
// native-event diagnostic names onInput for text entry and native change/input
// for select/checkbox, while preserving the same read-only DOM outcome.
// Per ReactDOMServerIntegrationInput-test.js:59,
// ReactDOMServerIntegrationTextarea-test.js:69,
// ReactDOMServerIntegrationSelect-test.js:109, and
// ReactDOMServerIntegrationCheckbox-test.js:58.
it('diagnoses controlled form fields that have no usable native handler', () => {
	const error = vi.spyOn(console, 'error').mockImplementation(() => {});
	const container = document.createElement('div');
	const root = createRoot(container);
	try {
		for (const component of [
			client.InputWithoutHandler,
			client.TextareaWithoutHandler,
			client.SelectWithoutHandler,
			client.CheckboxWithoutHandler,
		]) {
			flushSync(() => root.render(component));
		}
		const diagnostics = error.mock.calls.map((call) => String(call[0]));
		expect(diagnostics).toHaveLength(PROD_COMPILE ? 0 : 4);
		if (!PROD_COMPILE) {
			expect(
				diagnostics.filter((message) =>
					message.startsWith('You provided a `value` prop to a form field'),
				),
			).toHaveLength(2);
			expect(diagnostics.some((message) => message.includes('select'))).toBe(true);
			expect(diagnostics.some((message) => message.includes('`checked`'))).toBe(true);
		}
	} finally {
		root.unmount();
		container.remove();
		error.mockRestore();
	}
});

// Per ReactDOMServerIntegrationSelect-test.js:165/:185. Static TSRX can reject
// this contradictory authoring shape before either renderer executes it.
it('rejects option children together with dangerouslySetInnerHTML in both compile modes', () => {
	for (const child of ['{0}', "{''}"]) {
		const source = `export function Invalid() @{
			<select value="foo" readOnly>
				<option value="foo" dangerouslySetInnerHTML={{ __html: 'Foo' }}>${child}</option>
			</select>
		}`;
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, 'invalid-option-children.tsrx', { mode })).toThrow(
				/Can only set one of `children` or `props\.dangerouslySetInnerHTML`/,
			);
		}
	}
});
