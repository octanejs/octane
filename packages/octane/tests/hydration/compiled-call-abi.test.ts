import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	BareGuardedReturnedEditor,
	KeyedCall,
	OnlyChildText,
	OptionalKeyCall,
	PlainReturnedEditor,
	ReturnedRows,
	ReturnedDynamicBoundary,
	SeededReturnedEditor,
	SiblingCalls,
	SiblingText,
	SoleRootCall,
} from './_fixtures/compiled-call-abi.tsrx';

// Compiled call sites pass optional runtime arguments positionally and omit
// trailing undefined ones: componentSlot's tail (invocation site, anchor,
// singleRoot, inherit, key, hasKey) and a signal-capable text hole's update
// (bindSignalText's previousValue). Each shape
// must keep its identity, placement, and hydration adoption whether it renders
// fresh or adopts server markup.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/compiled-call-abi.tsrx',
);
const server = loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
	id: 'compiled-call-abi.tsrx',
	mode: 'server',
});

// A real server response produced by e4691c176 before the wire version was
// introduced. Keep this as input, independent of what the current server emits.
const LEGACY_ROWS =
	'<section><i>before</i><!--[f1--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><input data-row="a" value="a"><button data-row="a">a:0</button><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><input data-row="b" value="b"><button data-row="b">b:0</button><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><!--[--><input data-row="c" value="c"><button data-row="c">c:0</button><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><!--]--><strong>after</strong></section>';

let container: HTMLElement;
let root: Root | null = null;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	root?.unmount();
	root = null;
	container.remove();
});

async function start(
	mode: 'render' | 'hydrate',
	name: string,
	client: (props: any) => void,
	props: Record<string, unknown>,
): Promise<Root> {
	if (mode === 'render') {
		root = createRoot(container);
		root.render(client as any, props);
	} else {
		const { html } = await ServerRT.renderToString(server[name], props);
		container.innerHTML = html;
		const adopted = [...container.querySelectorAll('*')];
		root = hydrateRoot(container, client as any, props);
		flushSync(() => {});
		const hydrated = [...container.querySelectorAll('*')];
		expect(hydrated).toHaveLength(adopted.length);
		for (const [index, element] of adopted.entries()) expect(hydrated[index]).toBe(element);
	}
	return root;
}

const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

describe('hydrating returned components from independently generated documents', () => {
	it('adopts a matching unversioned plain document at an existing sole-root call', async () => {
		container.innerHTML = '<button class="b">b:0</button>';
		const button = container.querySelector('button')!;
		button.focus();
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			SoleRootCall as any,
			{ label: 'b' },
			{
				onRecoverableError: (error) => recoverable.push(error),
			},
		);
		await act(() => {});
		expect(container.querySelector('button')).toBe(button);
		expect(document.activeElement).toBe(button);
		flushSync(() => button.click());
		expect(button.textContent).toBe('b:1');
		expect(recoverable).toEqual([]);
	});

	it.each([
		['without seeded data', 'PlainReturnedEditor', PlainReturnedEditor],
		['with seeded data', 'SeededReturnedEditor', SeededReturnedEditor],
	] as const)(
		'recovers a root built with a newer hydration wire version %s',
		async (_label, name, Component) => {
			const data = Object.assign(Promise.resolve('b'), {
				status: 'fulfilled' as const,
				value: 'b',
			});
			const props = { id: 'b', visible: true, data, onInputRef: vi.fn() };
			// This document advertises a newer wire encoding that the runtime cannot
			// interpret. Recovery belongs to this root, with one public report.
			container.innerHTML =
				ServerRT.renderToString(server[name], props).html.replace(
					/<!--octane-hydration:\d+-->/,
					'',
				) + '<!--octane-hydration:999-->';
			const oldInput = container.querySelector('input')!;
			const oldButton = container.querySelector('button')!;
			const recoverable: unknown[] = [];
			root = hydrateRoot(container, Component as any, props, {
				onRecoverableError: (error) => recoverable.push(error),
			});
			await act(() => {});
			expect(oldInput.isConnected).toBe(false);
			expect(oldButton.isConnected).toBe(false);
			expect(recoverable).toHaveLength(1);
			const input = container.querySelector('input')!;
			const button = container.querySelector('button')!;
			expect(input.value).toBe('b');
			expect(props.onInputRef).toHaveBeenCalledWith('b', input);
			flushSync(() => button.click());
			expect(button.textContent).toBe('b:1');
		},
	);
});

describe.each(['render', 'hydrate'] as const)('compiled call ABI (%s)', (mode) => {
	it.each([true, false])(
		'adopts a returned editor after a bare guard, then removes and remounts it (initially visible: %s)',
		async (visible) => {
			const onInputRef = vi.fn();
			const props = { id: 'draft', visible, onInputRef };
			const reports: unknown[] = [];
			let draft: HTMLInputElement | null;
			if (mode === 'hydrate') {
				container.innerHTML = ServerRT.renderToString(server.BareGuardedReturnedEditor, props).html;
				draft = container.querySelector('input');
				if (draft) {
					draft.value = 'unfinished draft';
					draft.focus();
					draft.setSelectionRange(2, 8);
				}
				root = hydrateRoot(container, BareGuardedReturnedEditor as any, props, {
					onRecoverableError: (error) => reports.push(error),
				});
				await act(() => {});
			} else {
				await start(mode, 'BareGuardedReturnedEditor', BareGuardedReturnedEditor, props);
				draft = container.querySelector('input');
				if (draft) {
					draft.value = 'unfinished draft';
					draft.focus();
					draft.setSelectionRange(2, 8);
				}
			}
			const before = container.querySelector('i')!;
			const after = container.querySelector('strong')!;
			expect(container.querySelector('input')).toBe(draft);
			expect(reports).toEqual([]);
			if (visible) {
				expect(onInputRef).toHaveBeenCalledWith('draft', draft);
				expect(draft!.value).toBe('unfinished draft');
				expect(document.activeElement).toBe(draft);
				expect([draft!.selectionStart, draft!.selectionEnd]).toEqual([2, 8]);
			}
			flushSync(() => root!.render(BareGuardedReturnedEditor as any, { ...props, visible: true }));
			const button = container.querySelector('button')!;
			flushSync(() => button.click());
			expect(button.textContent).toBe('draft:1');
			if (visible) expect(container.querySelector('input')).toBe(draft);
			flushSync(() => root!.render(BareGuardedReturnedEditor as any, { ...props, visible: false }));
			expect(container.querySelector('input')).toBeNull();
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('i')).toBe(before);
			expect(container.querySelector('strong')).toBe(after);
			flushSync(() => root!.render(BareGuardedReturnedEditor as any, { ...props, visible: true }));
			expect(container.querySelector('input')!.value).toBe('draft');
			expect(container.querySelector('button')!.textContent).toBe('draft:0');
			expect(container.querySelector('i')).toBe(before);
			expect(container.querySelector('strong')).toBe(after);
		},
	);

	it('remounts a keyed call only when its key changes', async () => {
		const r = await start(mode, 'KeyedCall', KeyedCall, { version: 1 });
		const first = container.querySelector('button')!;
		flushSync(() => first.click());
		expect(container.innerHTML.replace(/<!--.*?-->/g, '')).toBe(
			'<section><button class="keyed">keyed:1</button><span>after</span></section>',
		);

		flushSync(() => r.render(KeyedCall as any, { version: 1 }));
		expect(container.querySelector('button')).toBe(first);
		expect(buttons()).toEqual(['keyed:1']);

		flushSync(() => r.render(KeyedCall as any, { version: 2 }));
		expect(container.querySelector('button')).not.toBe(first);
		expect(buttons()).toEqual(['keyed:0']);
		expect(container.querySelector('section')!.lastElementChild!.tagName).toBe('SPAN');
	});

	it('keeps an explicit undefined key stable and remounts on a changed key', async () => {
		const r = await start(mode, 'OptionalKeyCall', OptionalKeyCall, { id: undefined });
		const first = container.querySelector('button')!;
		flushSync(() => first.click());

		flushSync(() => r.render(OptionalKeyCall as any, { id: undefined }));
		expect(container.querySelector('button')).toBe(first);
		expect(buttons()).toEqual(['optional:1']);

		// Leaving an undefined key is intentionally not a remount (runtime
		// componentSlotImpl: undefined means "no key this render").
		flushSync(() => r.render(OptionalKeyCall as any, { id: 'a' }));
		const keyed = container.querySelector('button')!;
		flushSync(() => keyed.click());
		flushSync(() => r.render(OptionalKeyCall as any, { id: 'b' }));
		expect(container.querySelector('button')).not.toBe(keyed);
		expect(buttons()).toEqual(['optional:0']);
	});

	it('updates a sole-root call in place', async () => {
		const r = await start(mode, 'SoleRootCall', SoleRootCall, { label: 'a' });
		const first = container.querySelector('button')!;
		flushSync(() => first.click());

		flushSync(() => r.render(SoleRootCall as any, { label: 'b' }));
		expect(container.querySelector('button')).toBe(first);
		expect(container.querySelectorAll('button')).toHaveLength(1);
		expect(first.className).toBe('b');
		expect(buttons()).toEqual(['b:1']);
	});

	it.each(mode === 'hydrate' ? ['current', 'legacy'] : ['current'])(
		'preserves an editor through returned components, keyed reordering and a neighbouring branch replacement (%s)',
		async (wire) => {
			const refs = new Map<string, HTMLInputElement>();
			const onInputRef = (id: string, node: HTMLInputElement | null) => {
				if (node) refs.set(id, node);
				else refs.delete(id);
			};
			const props = { ids: ['a', 'b', 'c'], hidden: '', onInputRef };
			// Type before hydration to distinguish DOM adoption from equivalent markup.
			let draft: HTMLInputElement;
			if (mode === 'hydrate') {
				container.innerHTML =
					wire === 'legacy'
						? LEGACY_ROWS
						: ServerRT.renderToString(server.ReturnedRows, props).html;
				draft = container.querySelector<HTMLInputElement>('input[data-row="b"]')!;
				draft.value = 'unfinished b draft';
				draft.focus();
				draft.setSelectionRange(3, 9);
				root = hydrateRoot(container, ReturnedRows as any, props);
				flushSync(() => {});
			} else {
				await start(mode, 'ReturnedRows', ReturnedRows, props);
				draft = container.querySelector<HTMLInputElement>('input[data-row="b"]')!;
				draft.value = 'unfinished b draft';
				draft.focus();
				draft.setSelectionRange(3, 9);
			}
			const before = container.querySelector('i')!;
			const after = container.querySelector('strong')!;
			const a = container.querySelector<HTMLInputElement>('input[data-row="a"]')!;
			const bButton = container.querySelector<HTMLButtonElement>('button[data-row="b"]')!;
			expect(refs.get('b')).toBe(draft);
			expect(document.activeElement).toBe(draft);
			expect([draft.selectionStart, draft.selectionEnd]).toEqual([3, 9]);
			flushSync(() => bButton.click());
			expect(bButton.textContent).toBe('b:1');

			flushSync(() =>
				root!.render(ReturnedRows as any, { ...props, ids: ['c', 'b', 'a'], hidden: 'a' }),
			);
			expect(container.querySelector('i')).toBe(before);
			expect(container.querySelector('strong')).toBe(after);
			expect(container.querySelector('input[data-row="b"]')).toBe(draft);
			expect(container.querySelector('button[data-row="b"]')).toBe(bButton);
			expect(draft.value).toBe('unfinished b draft');
			expect(refs.get('b')).toBe(draft);
			expect(refs.has('a')).toBe(false);
			expect(a.isConnected).toBe(false);
			expect([...container.querySelector('section')!.children].map((n) => n.textContent)).toEqual([
				'before',
				'',
				'c:0',
				'',
				'b:1',
				'a hidden',
				'after',
			]);

			flushSync(() => root!.render(ReturnedRows as any, { ...props, ids: ['b', 'a'] }));
			expect(container.querySelector('input[data-row="b"]')).toBe(draft);
			expect(container.querySelector('input[data-row="a"]')).not.toBe(a);
			expect(refs.get('b')).toBe(draft);
			expect(refs.has('c')).toBe(false);
			flushSync(() => bButton.click());
			expect(bButton.textContent).toBe('b:2');
			expect([...container.querySelector('section')!.children].map((n) => n.textContent)).toEqual([
				'before',
				'',
				'b:2',
				'',
				'a:0',
				'after',
			]);
		},
	);

	it('keeps anchored and appended sibling calls in source order', async () => {
		const r = await start(mode, 'SiblingCalls', SiblingCalls, { first: 'x', second: 'y' });
		const [first, second] = container.querySelectorAll('button');
		flushSync(() => second.click());

		flushSync(() => r.render(SiblingCalls as any, { first: 'p', second: 'q' }));
		expect([...container.querySelector('section')!.children].map((el) => el.tagName)).toEqual([
			'BUTTON',
			'HR',
			'BUTTON',
		]);
		expect(container.querySelectorAll('button')[0]).toBe(first);
		expect(container.querySelectorAll('button')[1]).toBe(second);
		expect(buttons()).toEqual(['p:0', 'q:1']);
	});

	it('keeps sibling content outside a returned dynamic Suspense through replacement and remount', async () => {
		await start(mode, 'ReturnedDynamicBoundary', ReturnedDynamicBoundary, { boundary: true });
		const before = container.querySelector('i')!;
		const after = container.querySelector('strong')!;
		const first = container.querySelector('b')!;
		const second = container.querySelector('small')!;
		expect([...container.querySelector('section')!.children].map((el) => el.textContent)).toEqual([
			'before',
			'first',
			'second',
			'after',
		]);
		flushSync(() => root!.render(ReturnedDynamicBoundary as any, { boundary: false }));
		expect(container.querySelector('i')).toBe(before);
		expect(container.querySelector('strong')).toBe(after);
		expect(first.isConnected).toBe(false);
		expect(second.isConnected).toBe(false);
		expect([...container.querySelector('section')!.children].map((el) => el.textContent)).toEqual([
			'before',
			'replacement',
			'after',
		]);
		flushSync(() => root!.render(ReturnedDynamicBoundary as any, { boundary: true }));
		expect(container.querySelector('i')).toBe(before);
		expect(container.querySelector('strong')).toBe(after);
		expect([...container.querySelector('section')!.children].map((el) => el.textContent)).toEqual([
			'before',
			'first',
			'second',
			'after',
		]);
		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});

	it.each([
		['only-child', 'OnlyChildText', OnlyChildText],
		['sibling', 'SiblingText', SiblingText],
	] as const)('mounts and updates %s text holes', async (_position, name, component) => {
		const r = await start(mode, name, component, { value: 'first' });
		const p = container.querySelector('p')!;
		const texts = () => [...p.childNodes].filter((node) => node.nodeType === 3);
		expect(p.textContent).toContain('first');
		expect(texts()).toHaveLength(1);
		const text = texts()[0];

		for (const [value, expected] of [
			[3, '3'],
			[null, ''],
			['last', 'last'],
			[undefined, ''],
			['again', 'again'],
		] as const) {
			flushSync(() => r.render(component as any, { value }));
			expect(p.textContent!.replace(/^before|after$/g, '')).toBe(expected);
		}
		expect(texts()[0]).toBe(text);
		expect(texts()).toHaveLength(1);
	});

	it('coerces an unchanged object text value once', async () => {
		const value = { toString: vi.fn(() => 'object') };
		const r = await start(mode, 'OnlyChildText', OnlyChildText, { value });
		const calls = value.toString.mock.calls.length;
		expect(container.querySelector('p')!.textContent).toBe('object');

		flushSync(() => r.render(OnlyChildText as any, { value }));
		flushSync(() => r.render(OnlyChildText as any, { value }));
		expect(value.toString).toHaveBeenCalledTimes(calls);
		expect(container.querySelector('p')!.textContent).toBe('object');
	});
});
