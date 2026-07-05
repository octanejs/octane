import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from './_helpers';
import { hydrateRoot, flushSync } from '../src/index.js';
import { App } from './_fixtures/non-jsx-return.tsrx';

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/non-jsx-return.tsrx');
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
