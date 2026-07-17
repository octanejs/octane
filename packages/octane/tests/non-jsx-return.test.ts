import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { App, Mixed, NestedMixed } from './_fixtures/non-jsx-return.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/non-jsx-return.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'non-jsx-return.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
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
});

describe('compiled `@{}` value-return classification', () => {
	const source = `
import { createElement, useState } from 'octane';
function EarlyString(p) @{ if (p.early) return 'early'; <span>final</span> }
function EarlyDescriptor(p) @{ if (p.early) return createElement('em', null, 'early'); <span>final</span> }
function EarlyArray(p) @{ if (p.early) return ['a', 'b']; <span>final</span> }
function VoidStateful() @{ const [value] = useState(0); <i>{value as string}</i> }
export function Parent(p) @{
	<><EarlyString early={p.early}/><EarlyDescriptor early={p.early}/><EarlyArray early={p.early}/><VoidStateful/></>
}`;

	it('keeps own value returns on the generic component path', () => {
		const code = compile(source, 'value-return.tsrx', { hmr: false }).code;
		expect(code).not.toContain('componentSlotLite');
		expect(code).not.toContain('EarlyString.$$singleRoot');
		expect(code).not.toContain('EarlyDescriptor.$$singleRoot');
		expect(code).not.toContain('EarlyArray.$$singleRoot');
		// autoMemo guards eligible value-returning calls outside the ordinary
		// generic return-reconciliation helper; it does not change that helper ABI.
		expect(code.match(/_\$componentSlot\(/g)).toHaveLength(3);
		expect(code.match(/_\$componentSlotVoid\(/g)).toHaveLength(1);
	});

	it('uses the generic component path during HMR', () => {
		const code = compile(source, 'value-return.tsrx', { hmr: true }).code;
		expect(code).not.toContain('componentSlotVoid');
		expect(code.match(/_\$componentSlot\(/g)).toHaveLength(4);
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
});
