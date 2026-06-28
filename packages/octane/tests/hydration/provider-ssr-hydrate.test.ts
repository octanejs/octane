import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { App } from '../_fixtures/ssr-provider.tsx';
import { ProviderApp } from '../_fixtures/jsx-context-children.tsx';

// Round-trip SSR→hydrate for `.tsx` `<Ctx.Provider>` with descriptor children.
// Regression for two server bugs:
//   1. ProviderBody only rendered children when they were a render FUNCTION, so a
//      `.tsx` `createElement(Provider, {}, <child/>)` (descriptor children) SSR'd empty.
//   2. ssrComponent assumed the body returned a string, so a component that returns a
//      `createElement` descriptor (the de-opt return path) SSR'd as `[object Object]`.

function serverModule(file: string): Record<string, any> {
	let { code } = compile(readFileSync(join(process.cwd(), file), 'utf8'), file.split('/').pop()!, {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
const server = serverModule('packages/octane/tests/_fixtures/ssr-provider.tsx');

describe('hydration — .tsx <Context.Provider> descriptor children', () => {
	let container: HTMLElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	afterEach(() => container.remove());

	it('SSR renders the provider child + context, and the client adopts it (no mismatch)', async () => {
		const { body } = await ServerRT.render(server.App, {});
		expect(body).toContain('class="leaf"');
		expect(body).toContain('provided'); // children NOT dropped (bug 1)
		container.innerHTML = body;
		const before = container.innerHTML;
		const root = hydrateRoot(container, App as any, {});
		flushSync(() => {});
		expect(container.innerHTML).toBe(before); // adopted, not rebuilt
		expect(container.querySelector('.leaf')!.textContent).toBe('provided');
		root.unmount();
	});

	// GAP: a de-opt HOST element whose children are COMPONENTS routes those children
	// through the Block path (hostElementBody / the de-opt keyed list) on the client,
	// whose hydration marker structure the server's ssrHostElement does not yet mirror —
	// so hydrating a `<div><Comp/><Comp/></div>` de-opt host throws a DOM NotFoundError.
	// SSR OUTPUT is correct (see jsx-context-children-ssr.test.ts); only hydration of
	// this specific subtree is unsupported. Auto-flips green when the server emits the
	// hostElementBody-compatible child markers.
	it.fails('GAP: de-opt host with component-list children does not yet hydrate', async () => {
		const dserver = serverModule('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const { body } = await ServerRT.render(dserver.ProviderApp, {});
		container.innerHTML = body;
		const before = container.innerHTML;
		const root = hydrateRoot(container, ProviderApp as any, {});
		flushSync(() => {});
		expect(container.innerHTML).toBe(before);
		root.unmount();
	});
});
