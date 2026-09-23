import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	createElement,
	createRoot,
	flushSync,
	hydrateRoot,
	useContext as useClientContext,
} from '../../src/index.js';
import { createContext as createNativeContext } from '../../src/universal-native.js';
import * as ServerRT from 'octane/server';
import { App } from '../_fixtures/ssr-provider.tsx';
import { ProviderApp } from '../_fixtures/jsx-context-children.tsx';
import { hydrationMarkerSummary } from './_marker-summary.js';
import { LateProviderApp } from './_fixtures/late-provider.tsrx';

// Round-trip SSR→hydrate for `.tsx` `<Ctx>` with descriptor children.
// Regression for two server bugs:
//   1. ProviderBody only rendered children when they were a render FUNCTION, so a
//      `.tsx` `createElement(Provider, {}, <child/>)` (descriptor children) SSR'd empty.
//   2. ssrComponent assumed the body returned a string, so a component that returns a
//      `createElement` descriptor (the de-opt return path) SSR'd as `[object Object]`.

function serverModule(file: string): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(join(process.cwd(), file), 'utf8'), {
		id: file.split('/').pop()!,
		mode: 'server',
		compileOptions: {
			mode: 'server',
		},
	});
}
const server = serverModule('packages/octane/tests/_fixtures/ssr-provider.tsx');

describe('hydration — .tsx <Context> descriptor children', () => {
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

	it('renders a renderer-local provider on the server and hydrates the same context identity', () => {
		const Theme = createNativeContext('default');
		const ServerReader = () =>
			ServerRT.createElement(
				'span',
				{ className: 'renderer-local-provider' },
				ServerRT.useContext(Theme as any),
			);
		const ServerProvider = () =>
			ServerRT.createElement(
				Theme as any,
				{ value: 'server-provided' },
				ServerRT.createElement(ServerReader as any, null),
			);
		const { html } = ServerRT.renderToString(ServerProvider);
		expect(html).toContain('server-provided');
		container.innerHTML = html;
		const adopted = container.querySelector('.renderer-local-provider');

		const ClientReader = () =>
			createElement(
				'span',
				{ className: 'renderer-local-provider' },
				useClientContext(Theme as any),
			);
		const ClientProvider = () =>
			createElement(Theme as any, { value: 'server-provided' }, createElement(ClientReader, null));
		const root = hydrateRoot(container, ClientProvider as any);
		try {
			flushSync(() => {});
			expect(container.querySelector('.renderer-local-provider')).toBe(adopted);
			expect(adopted?.textContent).toBe('server-provided');
		} finally {
			root.unmount();
		}
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

describe('context providers with initially empty children', () => {
	const fixture = 'packages/octane/tests/hydration/_fixtures/late-provider.tsrx';
	const modes = [
		{ name: 'client-only', server: null },
		{
			name: 'development SSR',
			server: loadServerFixture(fixture, { compileOptions: { dev: true } }),
		},
		{
			name: 'production SSR',
			server: loadServerFixture(fixture, { compileOptions: { dev: false } }),
		},
	];
	const variants = {
		a: 'direct provider with plain late content',
		b: 'late provider without an outer provider',
		c: 'provider around children with a late provider',
		d: 'provider around children with plain late content',
	};

	for (const { name, server } of modes) {
		const hydrate = server !== null;
		for (const [variant, label] of Object.entries(variants)) {
			it(`${name}: ${label} survives repeated opens and closes`, async () => {
				const container = document.createElement('div');
				document.body.appendChild(container);
				if (hydrate) {
					container.innerHTML = ServerRT.renderToString(server.LateProviderApp).html;
				}
				const serverSections = [...container.querySelectorAll('section')];
				const serverButtons = [...container.querySelectorAll('button')];
				const recoveries: unknown[] = [];
				const root = hydrate
					? hydrateRoot(container, LateProviderApp, undefined, {
							onRecoverableError: (error) => recoveries.push(error),
						})
					: createRoot(container);
				try {
					if (!hydrate) root.render(LateProviderApp);
					flushSync(() => {});
					await Promise.resolve();
					expect(recoveries).toEqual([]);
					if (hydrate) {
						const sections = [...container.querySelectorAll('section')];
						const buttons = [...container.querySelectorAll('button')];
						expect(sections).toHaveLength(serverSections.length);
						expect(buttons).toHaveLength(serverButtons.length);
						sections.forEach((section, index) => expect(section).toBe(serverSections[index]));
						buttons.forEach((button, index) => expect(button).toBe(serverButtons[index]));
					}
					const section = container.querySelector(`#${variant}`)!;
					const button = section.querySelector('button')!;
					expect(section.querySelector('.late')).toBeNull();
					for (let cycle = 0; cycle < 3; cycle++) {
						flushSync(() => button.click());
						expect(section.querySelector('.late')?.textContent).toBe('late content');
						expect(button.textContent).toBe('close');
						expect(container.querySelectorAll('.late')).toHaveLength(1);
						flushSync(() => button.click());
						expect(section.querySelector('.late')).toBeNull();
						expect(button.textContent).toBe('open');
					}
					flushSync(() => button.click());
					const late = section.querySelector('.late');
					expect(late?.textContent).toBe('late content');
					root.unmount();
					expect(late?.isConnected).toBe(false);
					expect(container.innerHTML).toBe('');
				} finally {
					root.unmount();
					expect(container.innerHTML).toBe('');
					container.remove();
				}
			});
		}
	}
});
