import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount, act } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import {
	App,
	Mixed,
	MixedFragment,
	MixedInline,
	MixedList,
	MixedTransitionApp,
	NestedMixed,
	NestedMixedInline,
} from './_fixtures/non-jsx-return.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/non-jsx-return.tsrx');
function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'non-jsx-return.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}

// A function used as a component (`<Foo/>`) may return a non-JSX value — a
// primitive coerced to text, via an early return or the trailing return. The
// renderable return-path (childSlot) handles the coercion; "component-ness" is
// decided at the use-site, not by whether the declaration returns JSX.
describe('component that returns a non-JSX value', () => {
	it('renders the trailing primitive return (string)', () => {
		const r = mount(App as any, { foo: false, title: 'hello' });
		expect(r.find('div').textContent).toBe('hello');
		r.unmount();
	});

	it('renders the early-return primitive (number, coerced to text)', () => {
		const r = mount(App as any, { foo: true, title: 'hello' });
		expect(r.find('div').textContent).toBe('123');
		r.unmount();
	});
});

describe('generic component return reconciliation', () => {
	function exercisesEveryShape(body: typeof Mixed | typeof NestedMixed) {
		const r = mount(body as any, { mode: 'host', label: 'one' });
		const host = r.find('.host');
		expect(host.textContent).toBe('one');

		r.update(body as any, { mode: 'host', label: 'two' });
		expect(r.find('.host')).toBe(host);
		expect(host.textContent).toBe('two');

		r.update(body as any, { mode: 'text', label: 'plain' });
		expect(r.container.textContent).toBe('plain');
		r.update(body as any, { mode: 'number', label: 'unused' });
		expect(r.container.textContent).toBe('42');
		r.update(body as any, { mode: 'null', label: 'unused' });
		expect(r.container.textContent).toBe('');
		r.update(body as any, { mode: 'host', label: 'before-void' });
		expect(r.container.textContent).toBe('before-void');
		r.update(body as any, { mode: 'void', label: 'unused' });
		expect(r.container.textContent).toBe('');
		r.update(body as any, { mode: 'host', label: 'before-undefined' });
		expect(r.container.textContent).toBe('before-undefined');
		r.update(body as any, { mode: 'undefined', label: 'unused' });
		expect(r.container.textContent).toBe('');
		r.update(body as any, { mode: 'array', label: 'unused' });
		expect(r.container.textContent).toBe('AB');
		expect(r.find('.array-a').nextElementSibling).toBe(r.find('.array-b'));

		r.update(body as any, { mode: 'host', label: 'again' });
		expect(r.find('.host').textContent).toBe('again');
		r.unmount();
	}

	it('preserves every return shape at a public root', () => {
		exercisesEveryShape(Mixed);
	});

	it('preserves every return shape through a nested component', () => {
		exercisesEveryShape(NestedMixed);
	});

	it('switches a shorthand component between early values and its compiled template', () => {
		const r = mount(NestedMixedInline as any, {
			mode: 'null',
			label: 'hidden',
			detail: true,
		});
		expect(r.container.textContent).toBe('');

		r.update(NestedMixedInline as any, { mode: 'inline', label: 'one', detail: true });
		const section = r.find('.mixed-inline');
		expect(section.textContent).toBe('onedetail');

		r.update(NestedMixedInline as any, { mode: 'inline', label: 'two', detail: false });
		expect(r.find('.mixed-inline')).toBe(section);
		expect(section.textContent).toBe('two');
		expect(r.findAll('.mixed-detail')).toHaveLength(0);

		r.update(NestedMixedInline as any, { mode: 'text', label: 'fallback', detail: false });
		expect(r.findAll('.mixed-inline')).toHaveLength(0);
		expect(r.container.textContent).toBe('fallback');

		r.update(NestedMixedInline as any, { mode: 'null', label: 'hidden', detail: false });
		expect(r.container.textContent).toBe('');

		r.update(NestedMixedInline as any, { mode: 'inline', label: 'before-void', detail: false });
		expect(r.container.textContent).toBe('before-void');
		r.update(NestedMixedInline as any, { mode: 'void', label: 'hidden', detail: false });
		expect(r.container.textContent).toBe('');

		r.update(NestedMixedInline as any, {
			mode: 'inline',
			label: 'before-undefined',
			detail: false,
		});
		expect(r.container.textContent).toBe('before-undefined');
		r.update(NestedMixedInline as any, {
			mode: 'undefined',
			label: 'hidden',
			detail: false,
		});
		expect(r.container.textContent).toBe('');

		r.update(NestedMixedInline as any, { mode: 'inline', label: 'again', detail: true });
		expect(r.findAll('.mixed-inline')).toHaveLength(1);
		expect(r.find('.mixed-inline').textContent).toBe('againdetail');
		r.unmount();
	});

	it('holds an early returned value while its trailing template suspends in a transition', async () => {
		const initial = deferred<string>();
		const next = deferred<string>();
		const refs: string[] = [];
		const r = mount(MixedTransitionApp as any, {
			initialMode: 'text',
			initialPromise: initial.promise,
			nextMode: 'inline',
			nextPromise: next.promise,
			onRef: (node: Element | null) => refs.push(node === null ? 'clear' : 'set'),
		});
		const stage = r.find('.mixed-transition-stage');
		const committedText = stage.firstChild;
		expect(stage.textContent).toBe('committed');

		r.click('.mixed-transition-swap');
		expect(stage.firstChild).toBe(committedText);
		expect(stage.textContent).toBe('committed');
		expect(r.findAll('.mixed-transition-fallback')).toHaveLength(0);
		expect(r.find('.mixed-transition-pending').textContent).toBe('pending');
		expect(refs).toEqual([]);

		await act(() => next.resolve('ready'));
		expect(r.find('.mixed-transition-inline').textContent).toBe('ready');
		expect(r.findAll('.mixed-transition-fallback')).toHaveLength(0);
		expect(r.find('.mixed-transition-pending').textContent).toBe('idle');
		expect(refs).toEqual(['set']);
		r.unmount();
		expect(refs).toEqual(['set', 'clear']);
	});

	it('holds the trailing template while an early returned component suspends', async () => {
		const initial = deferred<string>();
		const next = deferred<string>();
		initial.resolve('inline-ready');
		await Promise.resolve();
		const r = mount(MixedTransitionApp as any, {
			initialMode: 'inline',
			initialPromise: initial.promise,
			nextMode: 'returned',
			nextPromise: next.promise,
		});
		await act(() => {});
		const inline = r.find('.mixed-transition-inline');
		expect(inline.textContent).toBe('inline-ready');

		r.click('.mixed-transition-swap');
		expect(r.find('.mixed-transition-inline')).toBe(inline);
		expect(inline.textContent).toBe('inline-ready');
		expect(r.findAll('.mixed-transition-fallback')).toHaveLength(0);

		await act(() => next.resolve('returned-ready'));
		expect(r.findAll('.mixed-transition-inline')).toHaveLength(0);
		expect(r.find('.mixed-transition-value').textContent).toBe('returned-ready');
		expect(r.findAll('.mixed-transition-fallback')).toHaveLength(0);
		r.unmount();
	});

	it('threads folded-list cache dependencies through a returned template', () => {
		const items = [
			{ id: 1, label: 'one' },
			{ id: 2, label: 'two' },
		];
		const r = mount(MixedList as any, { items: null, prefix: 'hidden' });
		expect(r.container.textContent).toBe('');

		r.update(MixedList as any, { items, prefix: 'first' });
		const rows = r.findAll('.mixed-list li');
		expect(rows.map((row) => row.textContent)).toEqual(['first:one', 'first:two']);

		r.update(MixedList as any, { items, prefix: 'second' });
		const updatedRows = r.findAll('.mixed-list li');
		expect(updatedRows[0]).toBe(rows[0]);
		expect(updatedRows[1]).toBe(rows[1]);
		expect(updatedRows.map((row) => row.textContent)).toEqual(['second:one', 'second:two']);
		r.unmount();
	});
});

describe('compiled `@{}` value-return classification', () => {
	const source = `
import { createElement, useState } from 'octane';
function EarlyString(p) @{ if (p.early) return 'early'; <span>final</span> }
function EarlyDescriptor(p) @{ if (p.early) return createElement('em', null, 'early'); <span>final</span> }
function EarlyArray(p) @{ if (p.early) return ['a', 'b']; <span>final</span> }
function EarlyVoid(p) @{ if (p.early) return; <span>final</span> }
function EarlyUndefined(p) @{ if (p.early) return undefined; <span>final</span> }
function VoidStateful() @{ const [value] = useState(0); <i>{value as string}</i> }
export function Parent(p) @{
	<><EarlyString early={p.early}/><EarlyDescriptor early={p.early}/><EarlyArray early={p.early}/><EarlyVoid early={p.early}/><EarlyUndefined early={p.early}/><VoidStateful/></>
}`;

	it('keeps renderable value returns on the generic component path', () => {
		const code = compile(source, 'value-return.tsrx', { hmr: false }).code;
		expect(code).not.toContain('componentSlotLite');
		expect(code).not.toContain('EarlyString.$$singleRoot');
		expect(code).not.toContain('EarlyDescriptor.$$singleRoot');
		expect(code).not.toContain('EarlyArray.$$singleRoot');
		// autoMemo guards eligible value-returning calls outside the ordinary
		// generic return-reconciliation helper; it does not change that helper ABI.
		expect(code).toContain('return undefined ?? null;');
		// A bare return is an empty template branch in production, so EarlyVoid
		// joins the direct-render path without retaining return reconciliation.
		expect(code.match(/_\$componentSlot\(/g)).toHaveLength(4);
		expect(code.match(/_\$componentSlotVoid\(/g)).toHaveLength(2);
	});

	it('uses the generic component path during HMR', () => {
		const code = compile(source, 'value-return.tsrx', { hmr: true }).code;
		expect(code).not.toContain('componentSlotVoid');
		expect(code.match(/_\$componentSlot\(/g)).toHaveLength(5);
		expect(code.match(/_\$componentSlotLite\(/g)).toHaveLength(1);
	});
});

// SSR + hydration: a verbatim `function Foo(props)` returning a primitive is now
// callable on the server too, because the server ABI is props-first (it used to
// call `Foo(scope, props)`, binding props to the scope). This proves the ABI
// unification — the server renders the primitive and the client adopts it.
describe('non-JSX return on the server (props-first ABI)', () => {
	it('SSR renders the trailing primitive return', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.App, { foo: false, title: 'hello' });
		expect(html).toContain('hello');
	});

	it('SSR renders the early-return primitive', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.App, { foo: true, title: 'hello' });
		expect(html).toContain('123');
	});

	it('hydrates the server-rendered primitive (adopts, stays consistent)', async () => {
		const server = serverModule();
		const { html } = await ServerRT.renderToString(server.App, { foo: false, title: 'hello' });
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const div = container.querySelector('div') as HTMLElement;
		const root = hydrateRoot(container, App, { foo: false, title: 'hello' });
		flushSync(() => {});
		expect(container.querySelector('div')).toBe(div); // adopted, not rebuilt
		expect(div.textContent).toBe('hello');
		root.unmount();
		container.remove();
	});

	it('hydrates and then switches a mixed shorthand output', async () => {
		const server = serverModule();
		const props = { mode: 'inline', label: 'server', detail: true };
		const { html } = await ServerRT.renderToString(server.MixedInline, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const section = container.querySelector('.mixed-inline');

		const root = hydrateRoot(container, MixedInline as any, props);
		flushSync(() => {});
		expect(container.querySelector('.mixed-inline')).toBe(section);
		expect(section?.textContent).toBe('serverdetail');

		flushSync(() =>
			root.render(MixedInline as any, { mode: 'text', label: 'client', detail: false }),
		);
		expect(container.querySelector('.mixed-inline')).toBeNull();
		expect(container.textContent).toBe('client');

		flushSync(() =>
			root.render(MixedInline as any, { mode: 'inline', label: 'again', detail: false }),
		);
		expect(container.querySelectorAll('.mixed-inline')).toHaveLength(1);
		expect(container.querySelector('.mixed-inline')?.textContent).toBe('again');
		root.unmount();
		container.remove();
	});

	it('hydrates every root of a mixed shorthand fragment before switching outputs', async () => {
		const server = serverModule();
		const props = { empty: false, label: 'server' };
		const { html } = await ServerRT.renderToString(server.MixedFragment, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const first = container.querySelector('.mixed-fragment-a');
		const second = container.querySelector('.mixed-fragment-b');

		const root = hydrateRoot(container, MixedFragment as any, props);
		flushSync(() => {});
		expect(container.querySelector('.mixed-fragment-a')).toBe(first);
		expect(container.querySelector('.mixed-fragment-b')).toBe(second);
		expect(container.textContent).toBe('serverB');

		flushSync(() => root.render(MixedFragment as any, { empty: true, label: 'hidden' }));
		expect(container.textContent).toBe('');

		flushSync(() => root.render(MixedFragment as any, { empty: false, label: 'again' }));
		expect(container.querySelectorAll('.mixed-fragment-a')).toHaveLength(1);
		expect(container.querySelectorAll('.mixed-fragment-b')).toHaveLength(1);
		expect(container.textContent).toBe('againB');
		root.unmount();
		container.remove();
	});

	it('rebuilds a mismatched mixed shorthand fragment inside its live root range', async () => {
		const server = serverModule();
		const props = { empty: false, label: 'client' };
		const { html } = await ServerRT.renderToString(server.MixedFragment, props);
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		container.querySelector('.mixed-fragment-b')!.outerHTML =
			'<em class="mixed-fragment-b">stale</em>';
		const root = hydrateRoot(container, MixedFragment as any, props);
		flushSync(() => {});
		expect(container.querySelectorAll('.mixed-fragment-a')).toHaveLength(1);
		expect(container.querySelectorAll('span.mixed-fragment-b')).toHaveLength(1);
		expect(container.querySelector('em')).toBeNull();
		expect(container.textContent).toBe('clientB');

		flushSync(() => root.render(MixedFragment as any, { empty: true, label: 'hidden' }));
		expect(container.textContent).toBe('');
		root.unmount();
		container.remove();
	});
});
