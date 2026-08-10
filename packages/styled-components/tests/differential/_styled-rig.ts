/**
 * Differential mount for styled-components that isolates each engine's
 * stylesheet. The shared octane/react HTML rig only compares root containers;
 * both engines otherwise inject into the same document.head under the same
 * `data-styled` / componentId namespace, so createGlobalStyle updates can be
 * stolen or skipped across the dual mount. Each side gets its own insertion
 * target + StyleSheet via StyleSheetManager.
 */
import { expect } from 'vitest';
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import * as React from 'react';
import { act as reactAct } from 'react';
import { createRoot as reactCreateRoot, type Root as ReactRoot } from 'react-dom/client';
import {
	createElement as octaneCreateElement,
	createRoot as octaneCreateRoot,
	drainPassiveEffects as octaneDrainEffects,
	flushSync as octaneFlushSync,
} from 'octane';
import {
	StyleSheetManager as OctaneStyleSheetManager,
	__PRIVATE__ as octanePrivate,
} from '@octanejs/styled-components';
import {
	StyleSheetManager as ReactStyleSheetManager,
	__PRIVATE__ as reactPrivate,
} from 'styled-components';
import {
	normaliseHtml,
	type DiffMount,
	type DiffPair,
} from '../../../octane/tests/differential/_rig.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const reactImportCache = new Map<string, Promise<any>>();

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function loadReactFixture(srcPath: string, cacheDir: string): Promise<any> {
	const cacheKey = `${cacheDir}\0${srcPath}`;
	const cached = reactImportCache.get(cacheKey);
	if (cached) return cached;
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(cacheDir, `${slug}-${hashString(srcPath)}.js`);
	if (!existsSync(outFile)) {
		return Promise.reject(
			new Error(
				`Precompiled React fixture not found for ${srcPath}.\n` +
					`Expected at ${outFile}. Either globalSetup didn't run, or the fixture ` +
					`couldn't be compiled via @tsrx/react — check setup logs.`,
			),
		);
	}
	const promise = import(/* @vite-ignore */ outFile);
	reactImportCache.set(cacheKey, promise);
	return promise;
}

function readSheetCSS(sheet: { toString(): string }): string {
	return String(sheet);
}

function assertSheetParity(name: string, octaneCss: string, reactCss: string): void {
	// Empty sheets compare equal; require the React oracle to have inserted
	// consumer-visible rules for this scenario before treating parity as evidence.
	if (!reactCss.includes('{')) {
		throw new Error(
			`Differential stylesheet empty on React at step "${name}" ` +
				`(stylesheet oracle captured no rules)`,
		);
	}
	if (octaneCss !== reactCss) {
		throw new Error(
			`Differential stylesheet divergence at step "${name}":\n` +
				`  octane: ${octaneCss}\n` +
				`  styled-components: ${reactCss}`,
		);
	}
	expect(octaneCss).toBe(reactCss);
}

function assertSheetParityRejects(
	name: string,
	octaneCss: string,
	reactCss: string,
	reason: string,
): void {
	let rejected = false;
	try {
		assertSheetParity(name, octaneCss, reactCss);
	} catch {
		rejected = true;
	}
	if (!rejected) {
		throw new Error(
			`Differential stylesheet negative control did not reject ${reason} at step "${name}"`,
		);
	}
}

function mkMount(container: HTMLElement, isReact: boolean): DiffMount {
	return {
		container,
		async click(selector) {
			let el: Element | null = container.querySelector(selector);
			if (!el && selector.startsWith('#')) {
				const id = selector.slice(1);
				const all = container.getElementsByTagName('*');
				for (let i = 0; i < all.length; i++) {
					if (all[i].id === id) {
						el = all[i];
						break;
					}
				}
			}
			if (!el) {
				throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
			}
			if (isReact) {
				await reactAct(async function () {
					if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
					else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
				});
			} else {
				octaneFlushSync(function () {
					if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
					else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
				});
			}
		},
		async input(selector, value) {
			let el: Element | null = container.querySelector(selector);
			if (!el && selector.startsWith('#')) {
				const id = selector.slice(1);
				const all = container.getElementsByTagName('*');
				for (let i = 0; i < all.length; i++) {
					if (all[i].id === id) {
						el = all[i];
						break;
					}
				}
			}
			if (!el) {
				throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
			}
			const target = el as HTMLInputElement;
			const proto =
				target instanceof HTMLTextAreaElement
					? HTMLTextAreaElement.prototype
					: target instanceof HTMLSelectElement
						? HTMLSelectElement.prototype
						: HTMLInputElement.prototype;
			function dispatch(): void {
				const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
				if (setter) setter.call(target, value);
				else target.value = value;
				target.dispatchEvent(new Event('input', { bubbles: true }));
			}
			if (isReact) {
				await reactAct(async function () {
					dispatch();
				});
			} else {
				octaneFlushSync(function () {
					dispatch();
				});
			}
		},
		async keydown(selector, key, init) {
			let el: Element | null = container.querySelector(selector);
			if (!el && selector.startsWith('#')) {
				const id = selector.slice(1);
				const all = container.getElementsByTagName('*');
				for (let i = 0; i < all.length; i++) {
					if (all[i].id === id) {
						el = all[i];
						break;
					}
				}
			}
			if (!el) {
				throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
			}
			const target = el;
			function dispatch(): void {
				target.dispatchEvent(
					new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
				);
			}
			if (isReact) {
				await reactAct(async function () {
					dispatch();
				});
			} else {
				octaneFlushSync(function () {
					dispatch();
				});
			}
		},
		find(selector) {
			let el: Element | null = container.querySelector(selector);
			if (!el && selector.startsWith('#')) {
				const id = selector.slice(1);
				const all = container.getElementsByTagName('*');
				for (let i = 0; i < all.length; i++) {
					if (all[i].id === id) {
						el = all[i];
						break;
					}
				}
			}
			if (!el) {
				throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
			}
			return el;
		},
		findAll(selector) {
			return Array.from(container.querySelectorAll(selector));
		},
	};
}

export type StyledDiffPair = DiffPair & {
	octaneSheet: { toString(): string };
	reactSheet: { toString(): string };
};

/**
 * Mount a fixture under both engines with per-engine StyleSheet isolation.
 * `step` asserts normalized container HTML and each engine's sheet output.
 */
export async function mountStyledDifferential(
	srcPath: string,
	entry: string,
	initialProps: any,
	cacheDir: string,
): Promise<StyledDiffPair> {
	const octaneMod = await import(/* @vite-ignore */ srcPath);
	const OctaneComp = octaneMod[entry];
	if (!OctaneComp) throw new Error(`octane export "${entry}" not found in ${srcPath}`);

	const reactMod = await loadReactFixture(srcPath, cacheDir);
	const ReactComp = reactMod[entry];
	if (!ReactComp) throw new Error(`@tsrx/react export "${entry}" not found in ${srcPath}`);

	const octaneStyleTarget = document.createElement('div');
	octaneStyleTarget.setAttribute('data-sc-target', 'octane');
	const reactStyleTarget = document.createElement('div');
	reactStyleTarget.setAttribute('data-sc-target', 'react');
	document.body.appendChild(octaneStyleTarget);
	document.body.appendChild(reactStyleTarget);

	const octaneSheet = new octanePrivate.StyleSheet({
		target: octaneStyleTarget,
		useCSSOMInjection: false,
	});
	const reactSheet = new reactPrivate.StyleSheet({
		target: reactStyleTarget,
		useCSSOMInjection: false,
	});

	const octaneContainer = document.createElement('div');
	octaneContainer.setAttribute('data-rt', 'octane');
	const reactContainer = document.createElement('div');
	reactContainer.setAttribute('data-rt', 'react');
	document.body.appendChild(octaneContainer);
	document.body.appendChild(reactContainer);

	function OctaneRoot(props: any): unknown {
		return octaneCreateElement(OctaneStyleSheetManager as any, {
			sheet: octaneSheet,
			children: octaneCreateElement(OctaneComp, props),
		});
	}

	function ReactRoot(props: any): React.ReactElement {
		return React.createElement(
			ReactStyleSheetManager as any,
			{ sheet: reactSheet },
			React.createElement(ReactComp, props),
		);
	}

	const octaneRoot = octaneCreateRoot(octaneContainer);
	octaneRoot.render(OctaneRoot, initialProps);
	octaneFlushSync(function () {});

	const rRoot: ReactRoot = reactCreateRoot(reactContainer);
	await reactAct(async function () {
		rRoot.render(React.createElement(ReactRoot, initialProps));
	});

	const octane = mkMount(octaneContainer, false);
	const react = mkMount(reactContainer, true);

	async function settle(): Promise<void> {
		octaneDrainEffects();
		await reactAct(async function () {
			await new Promise<void>(function (resolve) {
				setTimeout(resolve, 0);
			});
		});
	}

	let previousReactCss: string | null = null;

	async function step(
		name: string,
		fn: (i: DiffMount, r: DiffMount) => void | Promise<void>,
		options?: { expectSheetChange?: boolean },
	): Promise<void> {
		await fn(octane, react);
		await settle();
		const i = normaliseHtml(octaneContainer.innerHTML);
		const r = normaliseHtml(reactContainer.innerHTML);
		if (i !== r) {
			throw new Error(
				`Differential DOM divergence at step "${name}":\n` +
					`  octane: ${i}\n` +
					`  styled-components: ${r}`,
			);
		}
		expect(i).toBe(r);

		const octaneCss = readSheetCSS(octaneSheet);
		const reactCss = readSheetCSS(reactSheet);
		assertSheetParity(name, octaneCss, reactCss);
		// Negative controls: the same oracle path must reject empty/altered sheets.
		assertSheetParityRejects(`${name} (empty react sheet)`, octaneCss, '', 'an empty React sheet');
		assertSheetParityRejects(
			`${name} (altered react sheet)`,
			octaneCss,
			`${reactCss}/*parity-probe*/`,
			'an altered React sheet',
		);
		if (options?.expectSheetChange) {
			if (previousReactCss === null) {
				throw new Error(
					`Differential step "${name}" requested expectSheetChange without a prior sheet capture`,
				);
			}
			if (reactCss === previousReactCss) {
				throw new Error(
					`Differential stylesheet did not change at update step "${name}" ` +
						`(React sheet still ${JSON.stringify(reactCss)})`,
				);
			}
		}
		previousReactCss = reactCss;
	}

	async function observe(
		_name: string,
		fn: (i: DiffMount, r: DiffMount) => void | Promise<void>,
	): Promise<void> {
		await fn(octane, react);
		await settle();
	}

	function unmount(): void {
		octaneRoot.unmount();
		reactAct(function () {
			rRoot.unmount();
		});
		octaneContainer.remove();
		reactContainer.remove();
		octaneStyleTarget.remove();
		reactStyleTarget.remove();
	}

	return {
		octane,
		react,
		step,
		observe,
		unmount,
		octaneSheet,
		reactSheet,
	};
}
