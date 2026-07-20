import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as ServerRuntime from 'octane/server';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
// Client compile of the same module: importing it at all is half the contract —
// a TDZ lowering would throw during module evaluation, before any test runs.
import { Registry } from './_fixtures/hoisted-component-ref.tsrx';

// Components referenced ABOVE their declarations (the canonical TanStack
// route-file shape: `createFileRoute(...)({ component: Home })` before
// `function Home`) rely on JS function-declaration hoisting. The compiler
// must preserve it in BOTH compile modes — a `const` lowering turns the
// authored, valid reference into "Cannot access 'X' before initialization".

const FIXTURE = 'packages/octane/tests/_fixtures/hoisted-component-ref.tsrx';

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

	it('server compile mirrors the string-blindness (const form retained)', () => {
		const src =
			"export const Route = { path: '/Home' };\n" +
			'function Home() @{\n\t<p>h</p>\n}\n' +
			'export { Home };\n';
		const { code } = compile(src, 'App.tsrx', { mode: 'server' });
		expect(code).not.toMatch(/^function Home\(/m);
	});
});
