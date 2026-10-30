import { resolve } from 'node:path';
import * as PierreTrees from '@pierre/trees';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../../octane/tests/_server-fixture';

// One test module cannot be compiled for both the client and the server, so the
// upstream suite's server renders go through these server-compiled twins of its
// components. They share the test's `@pierre/trees` module, so a model created in
// a test works on both sides.
const src = resolve(import.meta.dirname, '../src');
const runtimeModules = { '@pierre/trees': PierreTrees };
const binding = {
	...loadServerFixture(resolve(src, 'FileTree.tsrx'), { runtimeModules }),
	...loadServerFixture(resolve(src, 'useFileTree.tsrx'), { runtimeModules }),
};

const fixtureModules = { ...runtimeModules, '../../src/index.ts': binding };

/** The server-compiled factories in `_fixtures/server.tsx`. */
export const Server = loadServerFixture(resolve(import.meta.dirname, '_fixtures/server.tsx'), {
	runtimeModules: fixtureModules,
});

/** The server-compiled `App` in `_fixtures/app.tsrx`. */
export const ServerApp = loadServerFixture(resolve(import.meta.dirname, '_fixtures/app.tsrx'), {
	runtimeModules: fixtureModules,
}).App;

/** Server-render `component` with `props`, as `react-dom/server`'s `renderToString` does. */
export function renderToString(component: unknown, props: object = {}): string {
	return ServerRuntime.renderToString(ServerRuntime.createElement(component as never, props)).html;
}
