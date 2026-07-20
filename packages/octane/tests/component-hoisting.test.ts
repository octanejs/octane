import { describe, it, expect } from 'vitest';
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
