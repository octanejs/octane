import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { App } from '../_fixtures/ssr-provider.tsx';
import { ProviderApp } from '../_fixtures/jsx-context-children.tsx';
import { hydrationMarkerSummary } from './_marker-summary.js';

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
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
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
		const { html } = await ServerRT.renderToString(server.App, {});
		expect(html).toContain('class="leaf"');
		expect(html).toContain('provided'); // children NOT dropped (bug 1)
		container.innerHTML = html;
		const leaf = container.querySelector('.leaf')!;
		const before = hydrationMarkerSummary(container);
		const root = hydrateRoot(container, App as any, {});
		flushSync(() => {});
		expect(container.querySelector('.leaf')).toBe(leaf); // adopted, not rebuilt
		expect(leaf.textContent).toBe('provided');
		const after = hydrationMarkerSummary(container);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBeLessThan(before.physicalPairs);
		expect(after.countedPairs).toBeGreaterThanOrEqual(1);
		root.unmount();
	});

	// A de-opt HOST element whose children are COMPONENTS (`<div><Comp/><Comp/></div>`
	// returned via the de-opt path) renders those children on the client through
	// `hostElementBody` → `childSlot` → the de-opt keyed list, which ADOPTS markers on
	// hydration. The client now adopts the server host node (instead of building fresh),
	// and the server emits the matching childSlot/forSlot/component block nesting
	// (`ssrDeoptBlockChildren`) — so this round-trips without rebuilding hosts;
	// hydration may compact exactly-coextensive protocol ranges afterward.
	it('hydrates a de-opt host with a component-list child without mismatch', async () => {
		const dserver = serverModule('packages/octane/tests/_fixtures/jsx-context-children.tsx');
		const { html } = await ServerRT.renderToString(dserver.ProviderApp, {});
		container.innerHTML = html;
		const wrap = container.querySelector('.wrap')!;
		const leaves = [...container.querySelectorAll('.leaf')];
		const before = hydrationMarkerSummary(container);
		const root = hydrateRoot(container, ProviderApp as any, {});
		flushSync(() => {});
		expect(container.querySelector('.wrap')).toBe(wrap);
		expect([...container.querySelectorAll('.leaf')]).toEqual(leaves);
		for (const el of leaves) {
			expect(el.textContent).toBe('provided');
		}
		const after = hydrationMarkerSummary(container);
		expect(after.logicalPairs).toBe(before.logicalPairs);
		expect(after.physicalPairs).toBeLessThan(before.physicalPairs);
		expect(after.countedPairs).toBeGreaterThanOrEqual(1);
		root.unmount();
	});
});
