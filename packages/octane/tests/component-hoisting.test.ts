import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import { flushSync, hydrateRoot } from 'octane';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture.js';
// Client compile of the same module: importing it at all is half the contract —
// a TDZ lowering would throw during module evaluation, before any test runs.
import { Registry } from './_fixtures/hoisted-component-ref.tsrx';

// Components referenced ABOVE their declarations (the canonical TanStack
// route-file shape: `createFileRoute(...)({ component: Home })` before
// `function Home`) rely on JS function-declaration hoisting. The compiler
// must preserve it in BOTH compile modes — a `const` lowering turns the
// authored, valid reference into "Cannot access 'X' before initialization".

const FIXTURE = 'packages/octane/tests/_fixtures/hoisted-component-ref.tsrx';

describe('mutable template initializers', () => {
	it.each([
		['let', '() =>', 'View'],
		['var', '() =>', 'View'],
		['let', 'function Original()', 'Original'],
	])('keeps a writable %s %s in client and server modules', (kind, initializer, name) => {
		const source = `
			export ${kind} View = ${initializer} @{
				<span>first</span>
			};
			const Replacement = () => 'second';
			export function replace() { View = Replacement; return View === Replacement; }
			export function current() { return View; }
			export function App() @{ <div><View /></div> }
		`;
		for (const strong of [false, true]) {
			const options = {
				id: 'mutable-template.tsrx',
				compileOptions: { dev: true, strong },
			};
			const input = strong ? source.slice(0, source.indexOf('export function App')) : source;
			const client = loadCompiledFixtureSource(input, { ...options, mode: 'client' });
			const server = loadCompiledFixtureSource(input, { ...options, mode: 'server' });
			// The fixture evaluator substitutes its own assignment for a direct
			// variable export, so check name inference on a local initialized value.
			for (const mode of ['client', 'server'] as const) {
				const local = input.replace(`export ${kind} View`, `${kind} View`);
				expect(loadCompiledFixtureSource(local, { ...options, mode }).current().name).toBe(name);
			}
			if (strong) {
				expect(client.replace()).toBe(true);
				expect(server.replace()).toBe(true);
				continue;
			}
			const mounted = mount(client.App);
			try {
				expect(mounted.container.textContent).toBe('first');
				client.replace();
				mounted.update(client.App);
				expect(mounted.container.textContent).toBe('second');
			} finally {
				mounted.unmount();
			}
			expect(ServerRuntime.renderToString(server.App).html).toContain('first');
			server.replace();
			expect(ServerRuntime.renderToString(server.App).html).toContain('second');
		}
	});

	it.each(['client', 'server'] as const)(
		'keeps pre-declaration var and let reads in %s',
		(mode) => {
			const source = (kind: string) => `
			export const before = View;
			${kind} View = () => @{ <span /> };
		`;
			const options = { id: 'early-template-binding.tsrx', mode };
			expect(loadCompiledFixtureSource(source('var'), options).before).toBeUndefined();
			expect(() => loadCompiledFixtureSource(source('let'), options)).toThrow(ReferenceError);
		},
	);

	it('updates the outer binding from a hydrated component and scopes server styles', () => {
		const source = `
			export let View = () => @{
				<button class="first" onClick={() => { View = Replacement; }}>
					<style>.first { color: red; }</style>
					first
				</button>
			};
			const Replacement = () => 'second';
			export function App({ show }) @{
				<main>@if (show) { <View />; }</main>
			}
		`;
		const options = { id: 'mutable-template-hydration.tsrx' };
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		expect(ServerRuntime.renderToString(server.App, { show: false }).css).not.toContain('red');
		const { html, css } = ServerRuntime.renderToString(server.App, { show: true });
		expect(css).toContain('red');
		const host = document.createElement('div');
		host.innerHTML = html;
		document.body.append(host);
		const button = host.querySelector('button');
		const root = hydrateRoot(host, client.App, { show: true });
		try {
			expect(host.querySelector('button')).toBe(button);
			flushSync(() => button!.click());
			flushSync(() => root.render(client.App, { show: true }));
			expect(host.textContent).toBe('second');
		} finally {
			root.unmount();
			host.remove();
		}
	});

	it('keeps a named initializer private in a component tag and a direct call', () => {
		const source = `
			function Self() @{ <i>outer</i> }
			let View = function Self({ depth }) @{
				@if (depth > 0) {
					<Self depth={depth - 1} />
				} @else {
					<b>{Self.name as string}</b>
				}
			};
			export function App() @{ <main><View depth={1} />{View({ depth: 0 })}</main> }
		`;
		const options = { id: 'mutable-template-self.tsrx' };
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const mounted = mount(client.App);
		try {
			expect(mounted.container.textContent).toBe('SelfSelf');
		} finally {
			mounted.unmount();
		}
		const { html } = ServerRuntime.renderToString(server.App);
		expect(html.match(/<b>Self<\/b>/g)).toHaveLength(2);
	});

	it.each(['client', 'server'] as const)(
		'preserves named initializer parameter shadowing in %s',
		(mode) => {
			const fixture = loadCompiledFixtureSource(
				`
				let View = function Private(value = Private, Private = 'late') @{
					<span>{String(value)}</span>
				};
				export function call() { return View(); }
			`,
				{ id: 'mutable-template-parameter.tsrx', mode },
			);
			expect(fixture.call).toThrow(ReferenceError);
		},
	);
});

describe('component hoisting (reference above declaration)', () => {
	it('client: the early capture is the live component and renders', () => {
		expect(typeof Registry.component).toBe('function');
		expect(typeof Registry.fallback).toBe('function');
		const mounted = mount(Registry.component as any, { title: 'Hoisted' });
		try {
			expect(mounted.find('.card h2').textContent).toBe('Hoisted');
			expect(mounted.find('.empty').textContent).toBe('nothing yet');
		} finally {
			mounted.unmount();
		}
	});

	it('server: the same module evaluates and renders through octane/server', () => {
		const server = loadServerFixture(FIXTURE);
		expect(typeof server.Registry.component).toBe('function');
		const { html } = ServerRuntime.renderToString(server.Registry.component, {
			title: 'Hoisted',
		});
		expect(html).toContain('Hoisted');
		expect(html).toContain('nothing yet');
	});
});

// Emission-shape pins for two hoisting-path hazards. These assert narrow,
// consumer-observable properties of the compiled module (stamp ordering and
// declaration form), not full snapshots.
describe('component hoisting — emission properties', () => {
	// A single-root component captured above its declaration, exported, hmr on:
	// the canonical dev-server route-file shape.
	const EARLY_SINGLE_ROOT =
		'export const Route = { component: Solo };\n' + 'export function Solo() @{\n\t<p>solo</p>\n}\n';

	it('hmr: the module-tail $$singleRoot stamp lands AFTER the _$hmr rebind (wrapper carries the mark)', () => {
		// `hmr()` forwards `__warm` but not `$$singleRoot`; post-rebind consumers
		// hold the wrapper. The inline `_$__s` stamp covers the pre-declaration
		// capture (raw fn); the tail stamp must still fire to mark the wrapper —
		// so the hoisted path must NOT claim `singleRootInitialized` when a
		// rebind follows.
		const { code } = compile(EARLY_SINGLE_ROOT, 'App.tsrx', { hmr: true });
		const rebind = code.indexOf('= _$hmr(Solo)');
		const tailStamp = code.indexOf('Solo.$$singleRoot = true');
		expect(rebind).toBeGreaterThan(0);
		expect(tailStamp).toBeGreaterThan(rebind);
		// The raw function is stamped inline before the rebind for the early capture.
		expect(code.indexOf('_$__s(Solo)')).toBeLessThan(rebind);
	});

	it('prod: hoisted single-root components stamp inline exactly once (no tail duplicate)', () => {
		const { code } = compile(EARLY_SINGLE_ROOT, 'App.tsrx', {});
		expect(code).toContain('_$__s(Solo)');
		expect(code).not.toContain('Solo.$$singleRoot = true');
	});

	it('a name mentioned only inside a string above the declaration keeps the PURE const form', () => {
		// Route paths, messages, and import specifiers routinely contain component
		// names; treating them as references would silently trade away the
		// tree-shakeable `/* @__PURE__ */` const emission.
		const src =
			"export const Route = { path: '/Home' };\n" +
			'function Home() @{\n\t<p>h</p>\n}\n' +
			'export { Home };\n';
		const { code } = compile(src, 'App.tsrx', {});
		expect(code).toContain('const Home = /* @__PURE__ */');
		expect(code).not.toMatch(/^function Home\(/m);
	});

	it('a template-interpolation reference above the declaration still hoists (TDZ safety)', () => {
		// `${Chip}` is a REAL evaluated reference — the string-stripper must not
		// swallow template literals, or this module would crash at evaluation.
		const src =
			'export const label = `x${String(Chip)}`;\n' + 'export function Chip() @{\n\t<p>c</p>\n}\n';
		const { code } = compile(src, 'App.tsrx', {});
		expect(code).toContain('export function Chip(');
	});

	it('classifies multiple ordinary component names independently in both compile modes', () => {
		const src =
			'export const Registry = { component: Card2 };\n' +
			"export const note = 'Unused3'; // Unused3 is still not a reference.\n" +
			'function Card2() @{\n\t<p>card</p>\n}\n' +
			'function Unused3() @{\n\t<p>unused</p>\n}\n' +
			'export { Unused3 };\n';
		for (const mode of ['client', 'server'] as const) {
			const { code } = compile(src, 'App.tsrx', { mode });
			expect(code).toMatch(/^function Card2\(/m);
			expect(code).not.toMatch(/^function Unused3\(/m);
		}
	});

	it('server compile mirrors the string-blindness (const form retained)', () => {
		const src =
			"export const Route = { path: '/Home' };\n" +
			'function Home() @{\n\t<p>h</p>\n}\n' +
			'export { Home };\n';
		const { code } = compile(src, 'App.tsrx', { mode: 'server' });
		expect(code).not.toMatch(/^function Home\(/m);
	});
});
