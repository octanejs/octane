import { resolve } from 'node:path';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../../octane/tests/_server-fixture';

// One test module cannot be compiled for both the client and the server, so the
// upstream suite's server renders go through these server-compiled twins of its
// components. They share the test's `effect` modules, so atoms and registries
// created in a test work on both sides.
const src = resolve(import.meta.dirname, '../src');
const registryContext = loadServerFixture(resolve(src, 'RegistryContext.tsrx'), {
	runtimeModules: { 'effect/reactivity/AtomRegistry': AtomRegistry },
});
const binding = {
	...registryContext,
	...loadServerFixture(resolve(src, 'Hooks.tsrx'), {
		runtimeModules: {
			'effect/Cause': Cause,
			'effect/Effect': Effect,
			'effect/Exit': Exit,
			'effect/reactivity/Atom': Atom,
			'effect/reactivity/AtomRegistry': AtomRegistry,
			'./RegistryContext.tsrx': registryContext,
		},
	}),
};

/** The server-compiled factories in `_fixtures/server.tsx`. */
export const Server = loadServerFixture(resolve(import.meta.dirname, '_fixtures/server.tsx'), {
	runtimeModules: { '../../src/index.ts': binding },
});

/**
 * Server-render `component` the way the test's client tree renders it: inside
 * `<RegistryContext value={registry}>` when the test provides a registry.
 */
export function renderToString(
	component: unknown,
	props: object = {},
	registry?: AtomRegistry.AtomRegistry,
): string {
	const element = ServerRuntime.createElement(component as never, props);
	return ServerRuntime.renderToString(
		registry === undefined
			? element
			: ServerRuntime.createElement(binding.RegistryContext, { value: registry }, element),
	).html;
}

/** `html` without comments, so a comparison pins neither React's nor Octane's hydration markers. */
export function withoutComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}
