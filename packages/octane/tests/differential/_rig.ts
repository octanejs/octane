/**
 * Differential testing rig — runs the SAME `.tsrx` fixture through BOTH
 * octane AND @tsrx/react, mounts each into a hidden container, drives
 * an identical event sequence on both, and asserts the resulting DOM is
 * byte-equivalent after each step. This is the gold-standard parity proof
 * for the "you can swap them around" claim: any divergence surfaces here
 * automatically rather than depending on me having written the right
 * conformance test.
 *
 * Mechanics:
 *   - The octane side just imports the .tsrx file directly — the
 *     existing Vitest plugin compiles it via packages/octane/compiler.
 *   - The React side reads the same .tsrx source, runs it through
 *     @tsrx/react's `compile()` to get React-shaped TSX, writes that TSX to
 *     a temp .tsx file, and dynamic-imports it so Vitest's built-in JSX
 *     transform applies. React + ReactDOM are pulled in via the standard
 *     bare imports the compiled TSX emits.
 *   - Both are mounted into separate <div> containers under document.body.
 *   - A scenario is a list of `step(name, async (i, r) => { … })` callbacks
 *     that run on BOTH containers (interleaved), and after each step the
 *     rig diff-asserts `i.container.innerHTML === r.container.innerHTML`
 *     after a brief normalisation pass.
 */
import { expect } from 'vitest';
import {
	createRoot as octaneCreateRoot,
	flushSync as octaneFlushSync,
	drainPassiveEffects as octaneDrainEffects,
} from '../../src/index.js';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { createRoot as reactCreateRoot, type Root as ReactRoot } from 'react-dom/client';
import { act as reactAct } from 'react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// React 18+ requires this global to enable `act()`. Without it, every
// `act(...)` call logs a warning AND silently no-ops the scheduler drain,
// which means our React-side mount can finish in an undefined state where
// effects haven't fired yet. Set it once at module load.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Vitest's globalSetup hook (_setup.ts) precompiles every fixture into this
// directory before any test runs. We just dynamic-import from here.
const REACT_FIXTURE_CACHE_DIR = join(__dirname, '.react-cache');

/** Cache compiled React fixtures so re-running tests doesn't re-compile each time. */
const reactImportCache = new Map<string, Promise<any>>();

/**
 * Read a `.tsrx` fixture source, compile to React TSX via `@tsrx/react`,
 * write the result to a temp `.tsx` file under the OS temp dir, and return
 * the result of dynamic-importing it. Vitest's transformer JSX-transforms
 * the .tsx on import, so the returned module is ready-to-use with the React
 * runtime.
 *
 * Why a temp file instead of evaluating inline: Vitest's import pipeline
 * gives us free JSX → JS lowering + module resolution + ESM semantics for
 * imported react/react-dom. Doing it inline (Function constructor + esbuild)
 * would require us to set up jsx-runtime + bare-specifier resolution by
 * hand. Tradeoff: one disk write per fixture.
 */
function loadReactFixture(
	srcPath: string,
	cacheDir: string = REACT_FIXTURE_CACHE_DIR,
): Promise<any> {
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

function hashString(s: string): string {
	// Cheap deterministic id — collisions across the test suite are
	// astronomically unlikely; we're cache-keying by the fixture's source
	// path, which is itself unique.
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

/**
 * Normalise an `innerHTML` snapshot for comparison. We strip:
 *   - octane's `<!--…-->` slot markers (start/end Comment nodes used as
 *     range boundaries; React doesn't emit equivalents).
 *   - React's data-reactroot attribute residue (legacy, defensive).
 *   - Leading/trailing whitespace at the container boundary.
 *   - Whitespace-only text nodes between elements (octane preserves
 *     authored whitespace from templates; React's JSX strips it). This is a
 *     compile-emission divergence, NOT a renderer-behaviour divergence, so
 *     we collapse to put both runtimes on equal footing.
 */
export function normaliseHtml(html: string): string {
	return canonicaliseGeneratedIds(
		sortAttributes(
			collapseInterTagWhitespace(stripComments(html))
				.replace(' data-reactroot="', ' ')
				.replace(' data-reactroot=""', '')
				// An EMPTY inline style attribute is residue from imperatively setting
				// then clearing `el.style` properties (e.g. Radix's measure-then-restore
				// dance). React leaves `style=""` behind while octane's style writer ends
				// with the attribute absent — semantically identical DOM, so strip it.
				.replaceAll(' style=""', '')
				.trim(),
		),
	);
}

/**
 * Canonicalise `useId`-generated tokens so id VALUES don't fail the byte-compare while id
 * REFERENCES still must line up. React's useId emits `:r0:` / `«r0»`-style tokens and
 * octane's client roots emit `:r0-in-0:` (and hydration emits `:in-0:`) — both are
 * documented-opaque, so comparing them literally would fail every fixture that renders an
 * id (e.g. Radix's `aria-controls`/`aria-labelledby` wiring). Each distinct token maps to a
 * sequential placeholder in order of first appearance; a mismatch in WHERE ids appear, how
 * many there are, or which attribute references which id still diverges the normalised
 * strings.
 */
function canonicaliseGeneratedIds(html: string): string {
	const map = new Map<string, string>();
	return html.replace(
		// `recharts\\d+` covers recharts' module-counter uniqueId() (clipPath ids) —
		// counter VALUES depend on render-pass counts, which legitimately differ.
		/«[^»]{1,24}»|:r[0-9a-z]*:|:R[0-9a-zA-Z]*:|:[^\s"'<>:]*r[0-9a-z]+-in-[0-9a-z]+:|:in-[0-9a-z]+:|_r_[0-9a-z]+_|\brecharts\d+\b/g,
		(token) => {
			let placeholder = map.get(token);
			if (placeholder === undefined) {
				placeholder = `⟦id${map.size}⟧`;
				map.set(token, placeholder);
			}
			return placeholder;
		},
	);
}

/**
 * Strip HTML comment markers `<!-- … -->` via linear string scan — same
 * effect as the previous `/<!--[\s\S]*?-->/g` regex but with no backtracking
 * risk (CodeQL flags the unbounded lazy-match as a polynomial-regex
 * vulnerability even though `[\s\S]*?` is non-greedy and not actually
 * susceptible to catastrophic backtracking).
 */
function stripComments(s: string): string {
	let out = '';
	let i = 0;
	const n = s.length;
	while (i < n) {
		const open = s.indexOf('<!--', i);
		if (open === -1) {
			out += s.slice(i);
			break;
		}
		out += s.slice(i, open);
		const close = s.indexOf('-->', open + 4);
		if (close === -1) break; // unterminated comment — drop the rest
		i = close + 3;
	}
	return out;
}

/**
 * Collapse whitespace that sits BETWEEN tags (`>…<` runs) — again a linear
 * scan to dodge CodeQL's polynomial-regex caution. We don't touch text-node
 * content; only inter-tag whitespace gets compacted away.
 */
function collapseInterTagWhitespace(s: string): string {
	let out = '';
	let i = 0;
	const n = s.length;
	while (i < n) {
		const c = s.charCodeAt(i);
		if (c === 62 /* > */) {
			out += '>';
			i++;
			while (i < n) {
				const cc = s.charCodeAt(i);
				if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 12 || cc === 11) {
					i++;
					continue;
				}
				break;
			}
			continue;
		}
		if (c === 60 /* < */) {
			// Strip whitespace immediately preceding a tag too.
			// The previous slice already wrote up to this point — trim trailing
			// whitespace off `out`.
			let end = out.length;
			while (end > 0) {
				const cc = out.charCodeAt(end - 1);
				if (cc === 32 || cc === 9 || cc === 10 || cc === 13 || cc === 12 || cc === 11) end--;
				else break;
			}
			if (end < out.length) out = out.slice(0, end);
		}
		out += s[i];
		i++;
	}
	return out;
}

/**
 * Sort attribute names within each opening tag alphabetically. octane
 * emits attributes in template-clone order (basically authoring order, with
 * dynamic attribute updates appended at the end), while React's JSX runtime
 * preserves source order strictly. Both are equally valid per the HTML spec
 * (attribute order on an element has no semantic meaning), but the literal
 * string compare in the rig would flag the difference. Canonicalise to put
 * both runtimes on equal footing.
 */
function sortAttributes(html: string): string {
	// `[^>]*` is bounded by the negated character class — greedy match has
	// identical semantics to the lazy `[^>]*?` for our input but doesn't get
	// flagged by CodeQL's polynomial-regex check (lazy unbounded reps trip
	// its ReDoS heuristic).
	return html.replace(/<([a-zA-Z][\w-]*)\s+([^>]*)(\/?)>/g, (_, tag, attrs, selfClose) => {
		// Split the attribute string on whitespace BETWEEN attributes — but not
		// inside quoted values. Naive parse: match name="value" | name='value'
		// | name=unquoted | name (boolean).
		const matches =
			attrs.match(/(?:[a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*))?/g) || [];
		if (matches.length === 0) return `<${tag}${selfClose ? '/' : ''}>`;
		matches.sort();
		return `<${tag} ${matches.join(' ')}${selfClose ? '/' : ''}>`;
	});
}

export interface DiffMount {
	container: HTMLElement;
	/** Drive a synthetic click on the FIRST element matching the selector. */
	click(selector: string): Promise<void>;
	/** Dispatch a bubbling keydown on the FIRST element matching the selector. */
	keydown(selector: string, key: string, init?: KeyboardEventInit): Promise<void>;
	/**
	 * Set a form control's value and dispatch a native bubbling `input` event
	 * on the FIRST element matching the selector. The value is written through
	 * the NATIVE prototype setter so React's input value tracker sees a change
	 * and delivers its synthetic onChange (octane's delegated native onInput
	 * needs no such trick; the platform event is the handler).
	 */
	input(selector: string, value: string): Promise<void>;
	/** Find one element (throws if missing). */
	find(selector: string): Element;
	/** Find all matching elements. */
	findAll(selector: string): Element[];
}

export interface DiffPair {
	octane: DiffMount;
	react: DiffMount;
	/**
	 * Drive a step on BOTH runtimes (interleaved — octane first, then
	 * React). After both complete, normalises and asserts equal innerHTML.
	 * If the snapshots diverge, the assertion message includes both for
	 * easy diffing.
	 */
	step(name: string, fn: (i: DiffMount, r: DiffMount) => void | Promise<void>): Promise<void>;
	/**
	 * Drive and settle a step whose documented public result intentionally
	 * differs between runtimes. The callback must make explicit per-runtime
	 * assertions; unlike `step`, this does not require equal HTML.
	 */
	observe(name: string, fn: (i: DiffMount, r: DiffMount) => void | Promise<void>): Promise<void>;
	/** Tear down both. */
	unmount(): void;
}

/**
 * Mount `srcPath`'s components under both runtimes. `octaneEntry` is the
 * export name to mount on the octane side (and the same name will be
 * used for React, since @tsrx/react produces identically-named exports).
 *
 * `initialProps` is passed to both renderers as the props of the mounted
 * root component.
 */
export async function mountDifferential(
	srcPath: string,
	octaneEntry: string,
	initialProps?: any,
	// Binding packages (e.g. @octanejs/zustand) reuse this rig but keep their
	// React-fixture cache inside their OWN package, so the compiled React side
	// resolves that package's deps (zustand, react, …). Defaults to octane's.
	cacheDir?: string,
): Promise<DiffPair> {
	// octane side — import via Vitest's normal pipeline (the
	// octane() plugin handles compilation).
	const octaneMod = await import(/* @vite-ignore */ srcPath);
	const OctaneComp = octaneMod[octaneEntry];
	if (!OctaneComp) throw new Error(`octane export "${octaneEntry}" not found in ${srcPath}`);

	// React side — compile, write, dynamic-import.
	const reactMod = await loadReactFixture(srcPath, cacheDir);
	const ReactComp = reactMod[octaneEntry];
	if (!ReactComp) throw new Error(`@tsrx/react export "${octaneEntry}" not found in ${srcPath}`);

	// Two hidden containers, side-by-side under body.
	const octaneContainer = document.createElement('div');
	octaneContainer.setAttribute('data-rt', 'octane');
	const reactContainer = document.createElement('div');
	reactContainer.setAttribute('data-rt', 'react');
	document.body.appendChild(octaneContainer);
	document.body.appendChild(reactContainer);

	// Octane mount.
	const octaneRoot = octaneCreateRoot(octaneContainer);
	octaneRoot.render(OctaneComp, initialProps);
	octaneFlushSync(() => {});

	// React mount.
	const rRoot: ReactRoot = reactCreateRoot(reactContainer);
	await reactAct(async () => {
		rRoot.render(React.createElement(ReactComp, initialProps));
	});

	function mkMount(container: HTMLElement, isReact: boolean): DiffMount {
		return {
			container,
			async click(selector) {
				// jsdom's container.querySelector('#x') sometimes fails to resolve
				// single-char IDs on freshly-React-rendered subtrees (the scope at
				// which selectors are resolved doesn't include just-mounted nodes
				// in some envs). Fall back to a tree walk via getElementsByTagName
				// when the direct querySelector returns null. This is jsdom-quirk
				// workaround code, not a renderer concern.
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
					await reactAct(async () => {
						if (typeof (el as HTMLElement).click === 'function') (el as HTMLElement).click();
						else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
					});
				} else {
					octaneFlushSync(() => {
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
				if (!el)
					throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
				const target = el as HTMLInputElement;
				const proto =
					target instanceof HTMLTextAreaElement
						? HTMLTextAreaElement.prototype
						: target instanceof HTMLSelectElement
							? HTMLSelectElement.prototype
							: HTMLInputElement.prototype;
				const dispatch = () => {
					const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
					if (setter) setter.call(target, value);
					else target.value = value;
					target.dispatchEvent(new Event('input', { bubbles: true }));
				};
				if (isReact) {
					await reactAct(async () => {
						dispatch();
					});
				} else {
					octaneFlushSync(() => {
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
				if (!el)
					throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
				const target = el;
				const dispatch = () =>
					target.dispatchEvent(
						new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
					);
				if (isReact) {
					await reactAct(async () => {
						dispatch();
					});
				} else {
					octaneFlushSync(() => {
						dispatch();
					});
				}
			},
			find(selector) {
				// Same jsdom quirk as `click` above: querySelector('#x') can miss
				// freshly-React-rendered subtrees — fall back to a tree walk for id
				// selectors.
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
				if (!el)
					throw new Error(`no element matching ${selector} (${isReact ? 'react' : 'octane'})`);
				return el;
			},
			findAll(selector) {
				return Array.from(container.querySelectorAll(selector));
			},
		};
	}

	const octane = mkMount(octaneContainer, false);
	const react = mkMount(reactContainer, true);

	async function settle(): Promise<void> {
		// Settle octane's async work too: a store notify (useSyncExternalStore),
		// transition, or deferred value schedules its re-render as a passive effect
		// that flushSync (used inside `click`) doesn't drain. Without this the rig
		// only sees synchronous (useState) updates. Strictly more draining — inert
		// for fixtures that were already settled.
		octaneDrainEffects();
		// Drain React commits + effects, including external stores that chain work
		// from a renderer-completion promise. Keeping one macrotask inside act()
		// gives those promise continuations a chance to enqueue their final commit
		// without escaping React's test boundary.
		await reactAct(async () => {
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
		});
	}

	async function step(
		name: string,
		fn: (i: DiffMount, r: DiffMount) => void | Promise<void>,
	): Promise<void> {
		await fn(octane, react);
		await settle();
		const i = normaliseHtml(octaneContainer.innerHTML);
		const r = normaliseHtml(reactContainer.innerHTML);
		if (i !== r) {
			throw new Error(
				`Differential DOM divergence at step "${name}":\n` +
					`  octane: ${i}\n` +
					`  @tsrx/react:  ${r}`,
			);
		}
		// Verbose-pass on equality — using expect so the runner counts an
		// assertion (helps with vitest's "asserted nothing" warnings).
		expect(i).toBe(r);
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
		// Wrap React's teardown in act() — like mount and every click. With
		// IS_REACT_ACT_ENVIRONMENT set, `root.unmount()` schedules an update on the
		// HostRoot fiber (React calls it "Root"), and any React update outside act()
		// logs "An update to Root inside a test was not wrapped in act(...)". The
		// synchronous act() form fully flushes the unmount before returning, so the
		// many sync `d.unmount()` call sites need no await.
		reactAct(() => {
			rRoot.unmount();
		});
		octaneContainer.remove();
		reactContainer.remove();
	}

	return { octane, react, step, observe, unmount };
}
