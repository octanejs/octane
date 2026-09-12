import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import type * as Runtime from '../../../src/index.js';

declare global {
	interface Window {
		OctaneEventRuntime: typeof Runtime;
	}
}

let browser: Browser;
let page: Page | undefined;
let source: string;
let failures: string[];

beforeAll(async () => {
	const result = await build({
		entryPoints: [fileURLToPath(new URL('../../../src/index.ts', import.meta.url))],
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneEventRuntime',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	source = result.outputFiles[0].text;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	await page?.close();
	page = undefined;
	expect(failures).toEqual([]);
});
afterAll(async () => {
	await browser?.close();
});

async function openRuntime(): Promise<Page> {
	failures = [];
	page = await browser.newPage();
	page.on('pageerror', (error) => failures.push(error.message));
	await page.addScriptTag({ content: source });
	return page;
}

describe('production native event metadata', () => {
	it('restores native descriptors across nested cancellation, redispatch, and later bubble registration', async () => {
		const page = await openRuntime();
		const result = await page.evaluate(() => {
			const { createRoot, createElement, flushSync } = window.OctaneEventRuntime;

			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = createRoot(container);
			const log: string[] = [];
			const checks: boolean[] = [];
			const outer = new MouseEvent('click', { bubbles: true, detail: 1 });
			const ownStop = function (this: Event) {
				log.push('own-stop');
				Event.prototype.stopPropagation.call(this);
			};
			Object.defineProperty(outer, 'stopPropagation', {
				value: ownStop,
				configurable: true,
				enumerable: true,
				writable: false,
			});
			let retained!: () => void;
			let target!: Element;
			let includeBubble = false;
			const render = () =>
				createElement(
					'section',
					{
						id: 'metadata-parent',
						onClick: (event: MouseEvent) => log.push(`parent:${event.detail}`),
					},
					createElement(
						'button',
						{
							id: 'metadata-target',
							onClick: (event: MouseEvent) => {
								checks.push(event.currentTarget === target);
								log.push(`target:${event.detail}`);
								if (event === outer) {
									retained = event.stopPropagation;
									target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
									checks.push(outer.currentTarget === target);
								} else retained.call(outer);
							},
							onTransitionCancelCapture: (event: Event) => {
								checks.push(event.currentTarget === target);
								log.push('late:capture');
							},
							...(includeBubble
								? {
										onTransitionCancel: (event: Event) => {
											checks.push(event.currentTarget === target);
											log.push('late:bubble');
										},
									}
								: null),
						},
						'target',
					),
				);
			try {
				flushSync(() => root.render(render()));
				target = container.querySelector('button')!;
				container.addEventListener('click', (event) => {
					const descriptor = Object.getOwnPropertyDescriptor(event, 'stopPropagation');
					checks.push(event.currentTarget === container && !Object.hasOwn(event, 'currentTarget'));
					if (event === outer)
						checks.push(
							descriptor?.value === ownStop &&
								descriptor.configurable === true &&
								descriptor.enumerable === true &&
								descriptor.writable === false,
						);
					else checks.push(descriptor === undefined);
					log.push(`native:${(event as MouseEvent).detail}`);
				});
				target.dispatchEvent(outer);
				target.dispatchEvent(outer);
				checks.push(outer.currentTarget === null && outer.stopPropagation === ownStop);
				target.dispatchEvent(new Event('transitioncancel', { bubbles: true }));
				includeBubble = true;
				flushSync(() => root.render(render()));
				target.dispatchEvent(new Event('transitioncancel', { bubbles: true }));
				retained.call(outer);
				checks.push(outer.cancelBubble);
				return { log, checks };
			} finally {
				root.unmount();
				container.remove();
			}
		});
		expect(result.checks.every(Boolean)).toBe(true);
		expect(result.log).toEqual([
			'target:1',
			'target:2',
			'own-stop',
			'parent:2',
			'native:2',
			'native:1',
			'target:1',
			'target:2',
			'own-stop',
			'parent:2',
			'native:2',
			'native:1',
			'late:capture',
			'late:capture',
			'late:bubble',
			'own-stop',
		]);
	});

	it('keeps a removed portal route through the end of its native dispatch', async () => {
		const page = await openRuntime();
		const result = await page.evaluate(() => {
			const { createRoot, createElement, createPortal, flushSync } = window.OctaneEventRuntime;
			const container = document.createElement('div');
			const target = document.createElement('div');
			document.body.append(container, target);
			const root = createRoot(container);
			const targetRoot = createRoot(target);
			const log: string[] = [];
			const render = (show: boolean) =>
				createElement(
					'section',
					{
						onClickCapture: () => log.push('capture'),
						onClick: () => log.push('parent'),
					},
					show
						? createPortal(
								createElement(
									'button',
									{
										onClick: () => log.push('target'),
									},
									'portal',
								),
								target,
							)
						: null,
				);
			try {
				flushSync(() => root.render(render(true)));
				const button = target.querySelector('button')!;
				button.addEventListener(
					'click',
					() => {
						log.push('native target');
						flushSync(() => root.render(render(false)));
					},
					{ once: true },
				);
				button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				return {
					log,
					detached: button.parentNode === null,
					empty: target.querySelector('button') === null,
				};
			} finally {
				root.unmount();
				targetRoot.unmount();
				container.remove();
				target.remove();
			}
		});
		expect(result).toEqual({
			log: ['capture', 'native target', 'target', 'parent'],
			detached: true,
			empty: true,
		});
	});

	it.each(['open', 'closed'] as const)(
		'preserves %s shadow retargeting across public roots',
		async (mode) => {
			const page = await openRuntime();
			const result = await page.evaluate((mode) => {
				const { createRoot, createElement, flushSync } = window.OctaneEventRuntime;
				const container = document.createElement('div');
				container.id = 'native-root';
				document.body.append(container);
				const root = createRoot(container);
				const log: string[] = [];
				const record = (label: string) => (event: Event) => {
					log.push(
						`${label}:${(event.target as Element).id}:${(event.currentTarget as Element).id}`,
					);
				};
				flushSync(() =>
					root.render(
						createElement(
							'section',
							{
								id: 'outer',
								onClickCapture: record('outer capture'),
								onClick: record('outer bubble'),
							},
							createElement('div', { id: 'shadow-host' }),
						),
					),
				);
				const shadow = container.querySelector('#shadow-host')!.attachShadow({ mode });
				const inner = createRoot(shadow);
				try {
					flushSync(() =>
						inner.render(
							createElement(
								'button',
								{
									id: 'inner',
									onClickCapture: record('inner capture'),
									onClick: record('inner bubble'),
								},
								'inside',
							),
						),
					);
					container.addEventListener('click', record('native after'));
					shadow
						.querySelector('button')!
						.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
					return log;
				} finally {
					inner.unmount();
					root.unmount();
					container.remove();
				}
			}, mode);
			expect(result).toEqual([
				'outer capture:shadow-host:outer',
				'inner capture:inner:inner',
				'inner bubble:inner:inner',
				'outer bubble:shadow-host:outer',
				'native after:shadow-host:native-root',
			]);
		},
	);
});
