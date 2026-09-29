import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	KeyedCall,
	OnlyChildText,
	OptionalKeyCall,
	SiblingCalls,
	SiblingText,
	SoleRootCall,
} from './_fixtures/compiled-call-abi.tsrx';

// Compiled call sites pass optional runtime arguments positionally and omit
// trailing undefined ones: componentSlot's tail (invocation site, anchor,
// singleRoot, inherit, key, hasKey) and a signal-capable text hole's mount
// (mountSignalText) and update (bindSignalText's previousValue). Each shape
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
		expect([...container.querySelectorAll('*')]).toEqual(adopted);
	}
	return root;
}

const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

describe.each(['render', 'hydrate'] as const)('compiled call ABI (%s)', (mode) => {
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
