// Reproduces the real website scenario: a page is server-rendered, the profiler
// is started (at import, before hydration), the app hydrates, and only then does
// the user hover/click. The element→component registry must name the hydrated
// component — this is the path that was showing "Unknown".
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from 'octane';
import * as ServerRT from 'octane/server';
import { profiler } from 'octane/profiling';
import { App } from './_fixtures/hydrate-app.tsrx';
import { getSession } from '../src/index.ts';

// Server-compile the same fixture the client imports (see control-hydrate.test).
const FIXTURE = join(process.cwd(), 'packages/scan/tests/_fixtures/hydrate-app.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'hydrate-app.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

const registry = () => getSession().registry;

beforeEach(() => {
	profiler.clear();
	registry().clear();
});

afterEach(() => {
	registry().clear();
	profiler.clear();
});

describe('hydrated-page naming', () => {
	it('names a component on a hydrated page — the source started before hydration', () => {
		const { html } = ServerRT.renderToString(server.App, { title: 'Hi' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);

		// The Octane source started at import (getSession), so the profiler is
		// already active before this hydrateRoot — exactly the website scenario.
		const root = hydrateRoot(container, App, { title: 'Hi' });
		flushSync(() => {});

		const title = container.querySelector('#title')!;
		const instance = registry().resolveByDom(title);
		expect(instance).not.toBeNull();
		expect(['App', 'Card']).toContain(instance!.component.name);

		root.unmount();
		container.remove();
	});
});
