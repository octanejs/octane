import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { resolve } from 'node:path';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import { interaction } from 'octane/hydration';
import * as ServerRuntime from 'octane/server';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { loadServerFixture } from '../../_server-fixture.js';
import { createPipeableCollector, deferred } from '../../_server-stream.js';

const fixture = loadServerFixture(
	resolve('packages/octane/tests/_fixtures/view-transition-ssr.tsrx'),
);
let browser: Browser;
let hydrationBundle: string;
beforeAll(async () => {
	const result = await build({
		configFile: false,
		logLevel: 'error',
		define: { 'process.env.NODE_ENV': '"production"' },
		plugins: [octane({ hmr: false })],
		build: {
			write: false,
			minify: false,
			lib: {
				entry: resolve('packages/octane/tests/browser/view-transition-streaming/hydration.ts'),
				formats: ['iife'],
				name: 'OctaneStreamHydration',
			},
		},
	});
	const output = Array.isArray(result) ? result[0].output : 'output' in result ? result.output : [];
	const chunk = output.find((item) => item.type === 'chunk');
	if (!chunk || chunk.type !== 'chunk') throw new Error('Missing hydration client bundle');
	hydrationBundle = chunk.code;
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

async function streamed(name: string, props: Record<string, unknown> = {}) {
	const value = deferred<string>();
	const collector = createPipeableCollector();
	ServerRuntime.renderToPipeableStream(fixture[name], { ...props, promise: value.promise }).pipe(
		collector.destination,
	);
	const shell = collector.chunks.join('');
	value.resolve('Content');
	const complete = await collector.ended;
	return { shell, reveal: complete.slice(shell.length) };
}

async function open(shell: string) {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.setContent(`<style>
body { margin: 16px; }
section, #fallback, #content { min-height: 80px; width: 240px; }
:root { view-transition-name: none; }
::view-transition-group(*) { animation-duration: 100ms; }
::view-transition-group(*.resize) { --stream-capture-class: resize; }
</style><main>${shell}</main>`);
	await page.evaluate(() => {
		const records: any[] = [];
		const snapshot = (owner: Document | Element) =>
			Object.fromEntries(
				Array.from(owner.querySelectorAll<HTMLElement>('[id]'))
					.filter((el) => !el.closest('[hidden]'))
					.map((el) => [
						el.id,
						{ name: el.style.viewTransitionName, className: el.style.viewTransitionClass },
					]),
			);
		function capture(owner: Document | Element, native: (options: any) => any, options: any) {
			const record: any = {
				owner: owner === document ? 'document' : (owner as Element).id,
				old: snapshot(owner),
			};
			record.handle = native({
				...options,
				update() {
					record.entered = true;
					return options.update();
				},
			});
			record.handle.finished.then(() => {
				record.finished = true;
			});
			record.handle.ready.then(
				() => {
					const target = owner === document ? document.documentElement : (owner as Element);
					record.new = snapshot(owner);
					record.animations = target
						.getAnimations({ subtree: true })
						.filter((animation) => (animation.effect as KeyframeEffect | null)?.target === target)
						.map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement)
						.filter(Boolean);
					record.sharedClass = getComputedStyle(
						document.documentElement,
						'::view-transition-group(outer-classes)',
					).getPropertyValue('--stream-capture-class');
				},
				(error: Error) => {
					record.error = error.message;
				},
			);
			records.push(record);
			return record.handle;
		}
		const documentNative = document.startViewTransition.bind(document);
		(document as any).startViewTransition = (options: any) =>
			capture(document, documentNative, options);
		const elementNative = (Element.prototype as any).startViewTransition;
		if (elementNative)
			(Element.prototype as any).startViewTransition = function (options: any) {
				return capture(this, elementNative.bind(this), options);
			};
		(window as any).__streamCaptures = records;
	});
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	return { page, errors };
}

async function reveal(page: Page, html: string) {
	await page.evaluate((html) => {
		const carrier = document.createElement('div');
		carrier.innerHTML = html;
		document.body.appendChild(carrier);
		for (const script of Array.from(carrier.querySelectorAll('script'))) {
			if (script.type === 'application/json') continue;
			const executable = document.createElement('script');
			executable.textContent = script.textContent;
			script.replaceWith(executable);
		}
	}, html);
}

async function settle(page: Page, count = 1) {
	await page.waitForFunction((count) => (window as any).__streamCaptures.length === count, count);
	return page.evaluate(async () => {
		const records = (window as any).__streamCaptures;
		await Promise.all(records.map((record: any) => record.handle.finished));
		return records.map(({ owner, old, new: next, animations, sharedClass, error }: any) => ({
			owner,
			old,
			next,
			animations,
			sharedClass,
			error,
		}));
	});
}

describe.sequential('native streaming ViewTransition capture', () => {
	it.each(['reject', 'abort'] as const)(
		'activates dormant hydration after a queued parent exposes its child %s',
		async (failure) => {
			const parent = deferred<string>();
			const child = deferred<string>();
			const collector = createPipeableCollector();
			const serverErrors: unknown[] = [];
			const controller = ServerRuntime.renderToPipeableStream(
				fixture.QueuedHydrationApp,
				{
					parent: parent.promise,
					child: child.promise,
					when: interaction(),
				},
				{
					onError(error) {
						serverErrors.push(error);
					},
				},
			);
			controller.pipe(collector.destination);
			const blocker = await streamed('StreamTextApp', { id: 'blocker' });
			const { page, errors } = await open(
				blocker.shell + '<div id="hydration-target">' + collector.chunks.join('') + '</div>',
			);
			let consumed = collector.chunks.length;
			try {
				await page.addScriptTag({ content: hydrationBundle });
				expect(errors).toEqual([]);
				await page.evaluate(() => {
					(window as any).__hydration = (window as any).OctaneStreamHydration.hydrate(
						document.querySelector('#hydration-target'),
					);
				});
				await page.locator('#activate-hydration').click();
				expect(await page.evaluate(() => (window as any).__hydration.state.hydrated)).toBe(0);
				await page.addStyleTag({
					content: '::view-transition-group(*) { animation-duration: 60s; }',
				});
				await reveal(page, blocker.reveal);
				await page.waitForFunction(() => (window as any).__streamCaptures[0]?.new);
				parent.resolve('Live button');
				await expect.poll(() => collector.chunks.length).toBeGreaterThan(consumed);
				await reveal(page, collector.chunks.slice(consumed).join(''));
				consumed = collector.chunks.length;
				await page.waitForFunction(() => document.querySelector('#pending-parent'));
				expect(await page.locator('#queued-parent').count()).toBe(0);
				const reason = new Error('Child unavailable');
				if (failure === 'reject') child.reject(reason);
				else controller.abort(reason);
				await collector.ended;
				await reveal(page, collector.chunks.slice(consumed).join(''));
				await page.evaluate(() => (window as any).__streamCaptures[0].handle.skipTransition());
				await page.waitForFunction(() => (window as any).__streamCaptures.length === 2);
				await page.evaluate(() => (window as any).__streamCaptures[1].handle.skipTransition());
				await page.waitForFunction(() => (window as any).__hydration.state.hydrated === 1);
				expect(await page.locator('#recovered-child').textContent()).toBe('Recovered child');
				await page.locator('#recovered-button').click();
				expect(await page.evaluate(() => (window as any).__hydration.state.clicks)).toBe(1);
				expect(serverErrors).toEqual([reason]);
				expect(errors).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => (window as any).__hydration?.unmount());
				} finally {
					controller.abort();
					await page.close();
				}
			}
		},
	);

	it.each([
		{ css: '', expected: 'root', name: undefined },
		{ css: 'view-transition-name:scope-css;', expected: 'scope-css', name: undefined },
		{ css: 'view-transition-name:none;', expected: null, name: undefined },
		{ css: 'view-transition-name:none;', expected: 'scope-explicit', name: 'scope-explicit' },
	])('honors the native scope root name ($expected)', async ({ css, expected, name }) => {
		const html = await streamed('ScopedStreamApp', { id: 'named-scope', name });
		const { page, errors } = await open(html.shell);
		try {
			if (css) await page.addStyleTag({ content: '#named-scope {' + css + '}' });
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.owner).toBe('named-scope');
			expect(capture.error).toBeUndefined();
			const groups = capture.animations.filter((name: string) =>
				name.startsWith('::view-transition-group('),
			);
			expect(groups).toContain('::view-transition-group(wave-hero)');
			if (expected === null) expect(groups).toEqual(['::view-transition-group(wave-hero)']);
			else expect(groups).toContain('::view-transition-group(' + expected + ')');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it.each(['none', 'none!important'])(
		'respects authored inline scope precedence before and after streamed reveal (%s)',
		async (authored) => {
			const html = await streamed('ScopedStreamApp', {
				id: 'authored-scope',
				style: 'view-transition-scope:' + authored,
			});
			const { page, errors } = await open(html.shell);
			try {
				const host = page.locator('#authored-scope');
				const expected = authored.endsWith('!important') ? 'none' : 'all';
				expect(
					await host.evaluate((el) =>
						getComputedStyle(el).getPropertyValue('view-transition-scope'),
					),
				).toBe(expected);
				const style = await host.evaluate((el) => (el as HTMLElement).style.cssText);
				await reveal(page, html.reveal);
				const [capture] = await settle(page);
				expect(capture.owner).toBe('authored-scope');
				expect(capture.error).toBeUndefined();
				expect(capture.animations).toContain('::view-transition-group(wave-hero)');
				expect(await host.evaluate((el) => (el as HTMLElement).style.cssText)).toBe(style);
				expect(
					await host.evaluate((el) =>
						getComputedStyle(el).getPropertyValue('view-transition-scope'),
					),
				).toBe(expected);
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		},
	);

	it('runs sibling stream scopes with identical shared names and keeps an outside control interactive', async () => {
		const left = await streamed('ScopedStreamApp', {
			id: 'left-scope',
			style: 'color:blue',
		});
		const right = await streamed('ScopedStreamApp', {
			id: 'right-scope',
			style: 'color:red',
		});
		const { page, errors } = await open(
			left.shell + right.shell + '<button id="outside-control">Outside</button>',
		);
		try {
			expect(
				await page.locator('#left-scope, #right-scope').evaluateAll((elements) =>
					elements.map((el) => ({
						value: getComputedStyle(el).getPropertyValue('view-transition-scope'),
						priority: (el as HTMLElement).style.getPropertyPriority('view-transition-scope'),
					})),
				),
			).toEqual([
				{ value: 'all', priority: '' },
				{ value: 'all', priority: '' },
			]);
			await page.addStyleTag({
				content: '::view-transition-group(*) { animation-duration: 600ms; }',
			});
			await page.evaluate(() => {
				document.querySelector('#outside-control')!.addEventListener('click', () => {
					(window as any).__clickedDuringScopes = (window as any).__streamCaptures.filter(
						(record: any) => !record.finished,
					).length;
				});
			});
			await reveal(page, left.reveal + right.reveal);
			await page.waitForFunction(() => (window as any).__streamCaptures.length > 0);
			expect(
				await page.evaluate(() =>
					(window as any).__streamCaptures.map((record: any) => record.owner),
				),
			).toEqual(['left-scope', 'right-scope']);
			await page.waitForFunction(
				() =>
					(window as any).__streamCaptures.length === 2 &&
					(window as any).__streamCaptures.every((record: any) => record.new),
			);
			await page.locator('#outside-control').click();
			expect(await page.evaluate(() => (window as any).__clickedDuringScopes)).toBe(2);
			const captures = await settle(page, 2);
			expect(captures.map((capture: any) => capture.owner)).toEqual(['left-scope', 'right-scope']);
			for (const capture of captures) {
				expect(capture.error).toBeUndefined();
				expect(capture.animations).toContain('::view-transition-group(wave-hero)');
			}
			expect(await page.locator('#left-scope #wave-new').textContent()).toBe('Content');
			expect(await page.locator('#right-scope #wave-new').textContent()).toBe('Content');
			expect(
				await page
					.locator('#left-scope, #right-scope')
					.evaluateAll((elements) =>
						elements.map((el) => getComputedStyle(el).getPropertyValue('view-transition-scope')),
					),
			).toEqual(['all', 'all']);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('keeps a nested stream scope out of its outer native pseudo tree', async () => {
		const html = await streamed('NestedScopedStreamApp');
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			await page.waitForFunction(() => (window as any).__streamCaptures.length > 0);
			expect(
				await page.evaluate(() =>
					(window as any).__streamCaptures.map((record: any) => record.owner),
				),
			).toEqual(['outer-scope', 'inner-scope']);
			const captures = await settle(page, 2);
			const outer = captures.find((capture: any) => capture.owner === 'outer-scope');
			const inner = captures.find((capture: any) => capture.owner === 'inner-scope');
			expect(outer?.error).toBeUndefined();
			expect(inner?.error).toBeUndefined();
			expect(outer?.animations).not.toContain('::view-transition-group(wave-hero)');
			expect(inner?.animations).toContain('::view-transition-group(wave-hero)');
			expect(await page.locator('#outer-content').textContent()).toBe('Content');
			expect(await page.locator('#wave-new').textContent()).toBe('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('captures mixed document and element streams before publishing their shared reveal', async () => {
		const scoped = await streamed('ScopedStreamApp', { id: 'mixed-scope' });
		const ordinary = await streamed('StreamTextApp', { id: 'document-content' });
		const { page, errors } = await open(scoped.shell + ordinary.shell);
		try {
			await reveal(page, scoped.reveal + ordinary.reveal);
			await page.waitForFunction(() => (window as any).__streamCaptures.length > 0);
			expect(await page.evaluate(() => (window as any).__streamCaptures[0].owner)).toBe(
				'mixed-scope',
			);
			const captures = await settle(page, 2);
			expect(captures.map((capture: any) => capture.owner)).toEqual(['mixed-scope', 'document']);
			for (const capture of captures) expect(capture.error).toBeUndefined();
			expect(captures[1].old['document-content']).toBeUndefined();
			expect(await page.locator('#document-content').textContent()).toBe('Content');
			expect(await page.locator('#wave-new').textContent()).toBe('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('captures nested exit and parent-enter relays and restores styles after a real reveal', async () => {
		const html = await streamed('RelayApp', { relay: 'relay' });
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.old).toMatchObject({
				fallback: { className: 'page-exit' },
				'fallback-relay': { className: 'relay' },
				'fallback-deep': { className: 'deep-exit' },
			});
			expect(capture.next).toMatchObject({
				content: { className: 'page-enter' },
				relay: { className: 'relay' },
				deep: { className: 'deep-enter' },
			});
			for (const { name } of Object.values(capture.next) as { name: string }[]) {
				expect(capture.animations).toContain(`::view-transition-new(${name})`);
			}
			expect(await page.locator('#content').textContent()).toContain('Content');
			expect(await page.locator('#fallback').count()).toBe(0);
			expect(
				await page.evaluate(() =>
					Array.from(document.querySelectorAll<HTMLElement>('[id]')).every(
						(el) => !el.style.viewTransitionName && !el.style.viewTransitionClass,
					),
				),
			).toBe(true);
			expect(await page.evaluate(() => (document as any).__octaneViewTransition)).toBeNull();
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('uses the wrapping update class on the actual shared capture pseudo-element', async () => {
		const html = await streamed('OutsideClassesApp');
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.animations).toContain('::view-transition-group(outer-classes)');
			expect(capture.sharedClass).toBe('resize');
			expect(await page.locator('main').textContent()).toContain('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('pairs an explicit name between sibling streaming boundaries in one native capture', async () => {
		const html = await streamed('SharedWaveApp');
		const { page, errors } = await open(html.shell);
		try {
			await reveal(page, html.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			expect(capture.old['wave-old']).toEqual({ name: 'wave-hero', className: 'old-share' });
			expect(capture.next['wave-new']).toEqual({ name: 'wave-hero', className: 'new-share' });
			expect(capture.animations).toContain('::view-transition-group(wave-hero)');
			expect(await page.locator('#wave-first').textContent()).toBe('Content');
			expect(await page.locator('#wave-new').textContent()).toBe('Content');
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});

	it('gives independently composed streams distinct automatic capture names', async () => {
		const first = await streamed('OutsideApp');
		const second = await streamed('OutsideApp');
		const { page, errors } = await open(first.shell + second.shell);
		try {
			const names = await page
				.locator('main [vt-name]')
				.evaluateAll((elements) => elements.map((el) => el.getAttribute('vt-name')!));
			expect(names).toHaveLength(2);
			expect(new Set(names).size).toBe(2);
			await reveal(page, first.reveal + second.reveal);
			const [capture] = await settle(page);
			expect(capture.error).toBeUndefined();
			for (const name of names)
				expect(capture.animations).toContain(`::view-transition-group(${name})`);
			expect(
				await page
					.locator('main [vt-name]')
					.evaluateAll((elements) => elements.map((el) => el.getAttribute('vt-name')!)),
			).toEqual(names);
			expect(await page.locator('main [vt-name]').allTextContents()).toEqual([
				'Content',
				'Content',
			]);
			expect(errors).toEqual([]);
		} finally {
			await page.close();
		}
	});
});
