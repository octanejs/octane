import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = process.env.OCTANE_VT_BROWSER_PACKAGE ?? resolve(HERE, '../../..');
const packageRequire = createRequire(resolve(PACKAGE, 'package.json'));
const servers = new Map<'dev' | 'prod', ViteDevServer>();
let browser: Browser;
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
	await Promise.all([...servers.values()].map((server) => server.close()));
});

async function fixtureServer(mode: 'dev' | 'prod') {
	const existing = servers.get(mode);
	if (existing) return existing;
	const server = await createServer({
		cacheDir: resolve(HERE, `../../../../../node_modules/.vite/octane-vt-scopes-${mode}`),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [
			{
				name: 'view-transition-package',
				enforce: 'pre',
				resolveId(id) {
					if (id === 'octane' || id.startsWith('octane/')) return packageRequire.resolve(id);
					return null;
				},
			},
			octane(mode === 'prod' ? { hmr: false } : {}),
		],
		server: {
			host: '127.0.0.1',
			port: 0,
			fs: { allow: [resolve(HERE, '../../../../..'), PACKAGE] },
		},
	});
	try {
		await server.listen();
	} catch (error) {
		await server.close();
		throw error;
	}
	servers.set(mode, server);
	return server;
}

async function openPage(
	mode: 'dev' | 'prod',
	scenario = 'single',
	unsupported = false,
	initialClass?: string,
) {
	const server = await fixtureServer(mode);
	const errors: string[] = [];
	const page = await browser.newPage();
	try {
		if (unsupported)
			await page.addInitScript(() => {
				Object.defineProperty(Element.prototype, 'startViewTransition', {
					configurable: true,
					writable: true,
					value: undefined,
				});
			});
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
		});
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string') throw new Error('Vite has no TCP port');
		await page.goto(
			`http://127.0.0.1:${address.port}/?mode=${scenario}${initialClass ? '&initialClass=' + encodeURIComponent(initialClass) : ''}`,
		);
		await page.waitForFunction(() => Boolean(window.__viewTransitionScopes));
		return {
			page,
			errors,
			async close() {
				try {
					await page.evaluate(() => window.__viewTransitionScopes.unmount());
				} finally {
					await page.close();
				}
			},
		};
	} catch (error) {
		await page.close();
		throw error;
	}
}

type Update = Parameters<Window['__viewTransitionScopes']['render']>[0];
async function update(page: Page, update: Update, types: string[] = [], urgent = false) {
	const mark = await page.evaluate(
		({ update, types, urgent }) => window.__viewTransitionScopes.render(update, types, urgent),
		{ update, types, urgent },
	);
	await page.waitForFunction(
		(generation) => window.__viewTransitionScopes.snapshot().layouts.includes(generation),
		mark.generation,
		{ polling: 10 },
	);
	const result = await page.evaluate((mark) => window.__viewTransitionScopes.ready(mark), mark);
	return { mark, result };
}

async function updateLocal(
	page: Page,
	id: string,
	text: string,
	types: string[] = [],
	urgent = false,
) {
	const mark = await page.evaluate(
		({ id, text, types, urgent }) =>
			window.__viewTransitionScopes.renderLocal(id, text, types, urgent),
		{ id, text, types, urgent },
	);
	await page.waitForFunction(
		({ id, text }) => document.querySelector(`[data-content="${id}"]`)?.textContent === text,
		{ id, text },
		{ polling: 10 },
	);
	const result = await page.evaluate((mark) => window.__viewTransitionScopes.ready(mark), mark);
	return { mark, result };
}

describe.sequential.each(['dev', 'prod'] as const)(
	'element-scoped View Transitions (%s)',
	(mode) => {
		it('keeps an ordinary urgent update synchronous and preserves the persistent host', async () => {
			const fixture = await openPage(mode);
			try {
				const host = await fixture.page.locator('#left').elementHandle();
				const result = await fixture.page.evaluate(() => {
					window.__viewTransitionScopes.render({ left: 'urgent' }, [], true);
					return {
						...window.__viewTransitionScopes.snapshot(),
						text: document.querySelector('[data-content="left"]')!.textContent,
					};
				});
				expect(result.text).toBe('urgent');
				expect(await host!.evaluate((element) => element === document.querySelector('#left'))).toBe(
					true,
				);
				expect(result.layouts).toEqual([0, 1]);
				expect(result.calls).toEqual([]);
				expect(fixture.errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('attaches native animation handles and transition types to the element while outside controls remain interactive', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).roots[0]!.scope,
				).toBe('all');
				const { result } = await update(page, { left: 'left-after' }, ['first']);
				expect(result.calls.map((call) => call.owner)).toEqual(['left']);
				expect(result.calls[0]!.ready).toBe('fulfilled');
				expect(result.active).toEqual(['left']);
				const child = result.events.find((event) => event.id === 'left');
				expect(child).toMatchObject({
					name: 'shared',
					types: ['first'],
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				expect(child!.targets.length).toBeGreaterThan(0);
				expect(new Set(child!.targets)).toEqual(new Set(['left']));
				expect(result.events.find((event) => event.id === 'left-root')).toMatchObject({
					name: 'root',
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				expect(result.roots[0]!.types).toEqual(['first']);
				await page.locator('#outside').click();
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).outsideClicks,
				).toBe(1);
				const finished = await page.evaluate(() => window.__viewTransitionScopes.finish());
				expect(finished.active).toEqual([]);
				expect(finished.cleanups.filter((id) => id === 'left')).toEqual(['left']);
				expect(finished.roots[0]).toMatchObject({ scope: 'all', inlineName: '' });
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
		it('preserves authored inline scope declarations and lets important opt out of persistent isolation', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				await update(page, { scopeValue: 'none!important', left: 'authored' }, [], true);
				expect(
					await page.locator('#left').evaluate((el) => ({
						computed: getComputedStyle(el).getPropertyValue('view-transition-scope'),
						inline: (el as HTMLElement).style.getPropertyValue('view-transition-scope'),
						priority: (el as HTMLElement).style.getPropertyPriority('view-transition-scope'),
					})),
				).toEqual({ computed: 'none', inline: 'none', priority: 'important' });
				await update(page, { scopeValue: 'none', left: 'isolated' }, [], true);
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).roots[0]!.scope,
				).toBe('all');
				expect(
					await page
						.locator('#left')
						.evaluate((el) => (el as HTMLElement).style.getPropertyValue('view-transition-scope')),
				).toBe('none');
				const { result } = await update(page, { left: 'animated' });
				expect(result.calls[0]!.ready).toBe('fulfilled');
				expect(result.events.some((event) => event.id === 'left')).toBe(true);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
		it('keeps shared-host isolation until its final scope declaration is removed', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				const host = await page.locator('#left').elementHandle();
				await update(page, { outerScope: true, scopeValue: 'none' }, [], true);
				await update(page, { elementScope: false }, [], true);
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).roots[0]!.scope,
				).toBe('all');
				await update(page, { outerScope: false }, [], true);
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).roots[0]!.scope,
				).toBe('none');
				expect(await host!.evaluate((el) => el === document.querySelector('#left'))).toBe(true);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
		it('does not activate a scope entirely outside the viewport at its bottom edge', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				await page.addStyleTag({ content: '#left{position:fixed;left:0;top:100vh;margin:0}' });
				const { result } = await update(page, { left: 'outside' });
				expect(result.events).toEqual([]);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('commits sibling, nested and document scopes together with independent names and one layout publication', async () => {
			const fixture = await openPage(mode, 'mixed');
			try {
				const { page, errors } = fixture;
				const { result } = await update(
					page,
					{ left: 'left-after', right: 'right-after', inner: 'inner-after', page: 'page-after' },
					['first'],
				);
				expect(result.calls.map((call) => call.owner).sort()).toEqual([
					'document',
					'inner',
					'left',
					'right',
				]);
				expect(
					result.calls.every((call) => call.ready === 'fulfilled' && call.update === 'fulfilled'),
				).toBe(true);
				expect(result.active.sort()).toEqual(['document', 'inner', 'left', 'right']);
				expect(result.layouts).toEqual([0, 1]);
				expect(await page.locator('[data-content]').allTextContents()).toEqual([
					'page-after',
					'left-after',
					'inner-after',
					'right-after',
				]);
				for (const id of ['page', 'left', 'inner', 'right']) {
					const owner = id === 'page' ? 'document' : id;
					const event = result.events.find((event) => event.id === id);
					expect(event).toMatchObject({ name: 'shared', animatedTarget: owner, styleOwner: owner });
					expect(event!.targets.length).toBeGreaterThan(0);
					expect(new Set(event!.targets)).toEqual(new Set([owner]));
				}
				const finished = await page.evaluate(() => window.__viewTransitionScopes.finish());
				expect(finished.calls.every((call) => call.finished === 'fulfilled')).toBe(true);
				expect(finished.active).toEqual([]);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('keeps a sibling animation active when another scope starts and is interrupted again', async () => {
			const fixture = await openPage(mode, 'siblings');
			try {
				const { page, errors } = fixture;
				const first = await updateLocal(page, 'left', 'left-first', ['first']);
				expect(first.result.active, JSON.stringify(first.result)).toEqual(['left']);
				const second = await updateLocal(page, 'right', 'right-first', ['second']);
				expect(second.result.active.sort()).toEqual(['left', 'right']);
				expect(second.result.calls[first.mark.call]!.finished).toBe('pending');
				const third = await updateLocal(page, 'right', 'right-second', [], true);
				expect(third.result.active).toEqual(['left']);
				expect(third.result.calls[first.mark.call]!.finished).toBe('pending');
				expect(third.result.cleanups.filter((id) => id === 'left')).toEqual([]);
				expect(await page.locator('[data-content="right"]').textContent()).toBe('right-second');
				const finished = await page.evaluate(() => window.__viewTransitionScopes.finish());
				expect(finished.cleanups.filter((id) => id === 'left')).toEqual(['left']);
				expect(finished.cleanups.filter((id) => id === 'right')).toEqual(['right']);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('starts an isolated nested scope after its ancestor is already animating', async () => {
			const fixture = await openPage(mode, 'nested');
			try {
				const { page, errors } = fixture;
				const first = await updateLocal(page, 'left', 'left-first', ['first']);
				expect(first.result.active, JSON.stringify(first.result)).toEqual(['left']);
				const next = await updateLocal(page, 'inner', 'inner-after', ['second']);
				expect(next.result.active.sort()).toEqual(['inner', 'left']);
				expect(next.result.calls[first.mark.call]!.finished).toBe('pending');
				expect(next.result.calls[next.mark.call]!.ready).toBe('fulfilled');
				expect(next.result.events.find((event) => event.id === 'inner')).toMatchObject({
					name: 'shared',
					styleOwner: 'inner',
					animatedTarget: 'inner',
				});
				expect(next.result.roots.find((root) => root.id === 'left')!.types).toEqual(['first']);
				expect(next.result.roots.find((root) => root.id === 'inner')!.types).toEqual(['second']);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('preserves an authored name on the self-participating scope root', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				await update(page, { rootName: 'authored-panel' }, [], true);
				const { result } = await update(page, { left: 'left-after' });
				expect(result.calls.map((call) => call.owner)).toEqual(['left']);
				expect(result.roots[0]).toMatchObject({
					name: 'authored-panel',
					inlineName: 'authored-panel',
				});
				expect(result.events.find((event) => event.id === 'left-root')).toMatchObject({
					name: 'authored-panel',
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				const finished = await page.evaluate(() => window.__viewTransitionScopes.finish());
				expect(finished.roots[0]).toMatchObject({
					name: 'authored-panel',
					inlineName: 'authored-panel',
					scope: 'all',
				});
				await update(page, { boundaryName: 'explicit-panel' }, [], true);
				const explicit = await update(page, { left: 'left-explicit' });
				expect(
					explicit.result.events
						.slice(explicit.mark.event)
						.find((event) => event.id === 'left-root'),
				).toMatchObject({
					name: 'explicit-panel',
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				const restored = await page.evaluate(() => window.__viewTransitionScopes.finish());
				expect(restored.roots[0]!.inlineName).toBe('authored-panel');
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('keeps a stable boundary ref aligned with a stylesheet name changed by its child and clears it on unmount', async () => {
			const fixture = await openPage(mode, 'single', false, 'hero');
			try {
				const { page, errors } = fixture;
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).refs.left,
				).toBe('hero');
				const { result } = await updateLocal(page, 'left', 'card');
				expect(result.events.find((event) => event.id === 'left-root')).toMatchObject({
					name: 'card',
					refName: 'card',
					refGroup: '::view-transition-group(card)',
					matchesRef: true,
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				expect(result.refs.left).toBe('card');
				await page.evaluate(() => window.__viewTransitionScopes.unmount());
				const unmounted = await page.evaluate(() => window.__viewTransitionScopes.snapshot());
				expect(unmounted.refs.left).toBeNull();
				expect(unmounted.cleanups.filter((id) => id === 'left-root')).toEqual(['left-root']);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it.each(['sheet-panel', 'none'])(
			'honors stylesheet root name %s without an inline override',
			async (name) => {
				const fixture = await openPage(mode);
				try {
					const { page, errors } = fixture;
					await page.addStyleTag({ content: `#left { view-transition-name: ${name}; }` });
					const { result } = await update(page, { left: 'left-after' });
					expect(result.calls.map((call) => call.owner)).toEqual(['left']);
					expect(result.calls[0]!.ready).toBe('fulfilled');
					expect(result.roots[0]).toMatchObject({ name, inlineName: '' });
					const rootEvent = result.events.find((event) => event.id === 'left-root');
					if (name === 'none') expect(rootEvent).toBeUndefined();
					else
						expect(rootEvent).toMatchObject({ name, animatedTarget: 'left', styleOwner: 'left' });
					expect(result.events.find((event) => event.id === 'left')).toMatchObject({
						name: 'shared',
						animatedTarget: 'left',
						styleOwner: 'left',
					});
					const finished = await page.evaluate(() => window.__viewTransitionScopes.finish());
					expect(finished.roots[0]).toMatchObject({ name, inlineName: '', scope: 'all' });
					expect(errors).toEqual([]);
				} finally {
					await fixture.close();
				}
			},
		);

		it('respects an authored none name on the root while its named child still animates', async () => {
			const fixture = await openPage(mode);
			try {
				const { page, errors } = fixture;
				await update(page, { rootName: 'none' }, [], true);
				const { result } = await update(page, { left: 'left-after' });
				expect(result.calls.map((call) => call.owner)).toEqual(['left']);
				expect(result.calls[0]!.ready).toBe('fulfilled');
				expect(result.roots[0]).toMatchObject({ name: 'none', inlineName: 'none' });
				expect(result.events.find((event) => event.id === 'left')).toMatchObject({
					name: 'shared',
					animatedTarget: 'left',
					styleOwner: 'left',
				});
				expect(result.events.filter((event) => event.id === 'left-root')).toEqual([]);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});

		it('commits without a document animation when element transitions are unsupported', async () => {
			const fixture = await openPage(mode, 'single', true);
			try {
				const { page, errors } = fixture;
				const { result } = await update(page, { left: 'fallback' });
				expect(await page.locator('[data-content="left"]').textContent()).toBe('fallback');
				expect(result.calls).toEqual([]);
				expect(result.events).toEqual([]);
				expect(result.layouts).toEqual([0, 1]);
				await page.locator('#outside').click();
				expect(
					(await page.evaluate(() => window.__viewTransitionScopes.snapshot())).outsideClicks,
				).toBe(1);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
		it('keeps document participants working while unsupported element scopes commit normally', async () => {
			const fixture = await openPage(mode, 'mixed', true);
			try {
				const { page, errors } = fixture;
				const { result } = await update(page, {
					left: 'left-after',
					right: 'right-after',
					inner: 'inner-after',
					page: 'page-after',
				});
				expect(result.calls.map((call) => call.owner)).toEqual(['document']);
				expect(result.calls[0]!.ready).toBe('fulfilled');
				expect(result.events.map((event) => event.id)).toEqual(['page']);
				expect(result.events[0]).toMatchObject({
					name: 'shared',
					animatedTarget: 'document',
					styleOwner: 'document',
				});
				expect(await page.locator('[data-content]').allTextContents()).toEqual([
					'page-after',
					'left-after',
					'inner-after',
					'right-after',
				]);
				expect(result.layouts).toEqual([0, 1]);
				expect(errors).toEqual([]);
			} finally {
				await fixture.close();
			}
		});
	},
);
