/**
 * The same fixture runs through @octanejs/cmdk and published cmdk@1.1.1.
 * Every `step` compares normalized innerHTML after driving identical events;
 * `observe` is used only where the port documents an intentional divergence.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'node:path';
import * as React from 'react';
import { act } from 'react';
import { createRoot as reactCreateRoot } from 'react-dom/client';
import { createRoot as octaneCreateRoot, flushSync as octaneFlushSync } from 'octane';
import {
	mountDifferential,
	preloadDifferentialFixture,
	normaliseHtml,
} from '../../../octane/tests/differential/_rig.js';
import { clearConsoleErrors, consoleErrorCalls } from '../_setup.js';

const FIXTURE = resolve(__dirname, '../_fixtures/cmdk-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

// Match the differential rig: React 18+ requires this for act() to flush.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Must match packages/cmdk/tests/differential/_setup.ts and the differential rig. */
function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function duplicateValueWarns(calls: unknown[][]): string[] {
	return calls
		.map(function toMessage(call) {
			return String(call[0]);
		})
		.filter(function isDuplicate(message) {
			return message.includes('share the value') && message.includes('Apple');
		});
}

// Upstream cmdk's List constructs a ResizeObserver unguarded, which throws in
// jsdom. Install an inert one for BOTH runtimes so neither side writes
// `--cmdk-list-height` and the comparison stays about cmdk's own behaviour.
class InertResizeObserver {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

const globals = globalThis as unknown as Record<string, unknown>;
let realResizeObserver: unknown;
let addedScrollIntoView = false;

beforeAll(function () {
	realResizeObserver = globals.ResizeObserver;
	globals.ResizeObserver = InertResizeObserver;

	// jsdom implements no scrollIntoView. Upstream cmdk calls it unguarded (the
	// port guards it), so shim it for BOTH runtimes to keep the comparison about
	// cmdk's behaviour rather than the environment.
	if (typeof Element.prototype.scrollIntoView !== 'function') {
		Element.prototype.scrollIntoView = function scrollIntoView(): void {};
		addedScrollIntoView = true;
	}
});

afterAll(function () {
	globals.ResizeObserver = realResizeObserver;
	if (addedScrollIntoView) {
		delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
	}
});

async function settle(): Promise<void> {
	await act(async function () {
		await new Promise(function resolvePromise(resolveTimeout) {
			setTimeout(resolveTimeout, 20);
		});
	});
}

function selectedText(mount: { find(selector: string): Element }): string | null {
	return mount.find('[cmdk-item][aria-selected="true"]').textContent;
}

function activeDescendant(mount: { find(selector: string): Element }): string | null {
	return mount.find('[cmdk-input]').getAttribute('aria-activedescendant');
}

function itemTexts(mount: { findAll(selector: string): Element[] }): Array<string | null> {
	return mount.findAll('[cmdk-item]').map(function textOf(el) {
		return el.textContent;
	});
}

/**
 * Ranked order as the user sees it. Octane assigns CSS `order` inside a flex
 * container, so DOM order stays source order; upstream relocates nodes, so DOM
 * order is the ranked order. Sorting by `order` (defaulting missing to 0) then
 * source index recovers the visible sequence for both.
 */
function inVisualOrder<T extends Element>(elements: T[]): T[] {
	return elements
		.map(function withOrder(el, index) {
			return {
				el,
				index,
				order: Number((el as unknown as HTMLElement).style.order) || 0,
			};
		})
		.sort(function byOrderThenIndex(a, b) {
			return a.order - b.order || a.index - b.index;
		})
		.map(function onlyElement(entry) {
			return entry.el;
		});
}

function visibleItemTexts(mount: { findAll(selector: string): Element[] }): Array<string | null> {
	return inVisualOrder(mount.findAll('[cmdk-item]')).map(function textOf(el) {
		return el.textContent;
	});
}

function visibleGroupHeadings(mount: {
	findAll(selector: string): Element[];
}): Array<string | null | undefined> {
	return inVisualOrder(mount.findAll('[cmdk-group]')).map(function headingOf(group) {
		return group.querySelector('[cmdk-group-heading]')?.textContent;
	});
}

/**
 * Byte-compare both trees ignoring `aria-activedescendant` only. cmdk re-selects
 * the first match from inside its own layout-effect flush; upstream's batcher
 * drops that nested work so the attribute never lands, while the port's keeps it
 * (see the documented divergence below). Everything else must still match
 * exactly — this is the full rig normalisation, minus that one attribute.
 */
/**
 * OCTANE DIVERGENCE[runtime-adaptation-divergences][differential:cmdk-filter-selection-empty]
 * This case authenticates CSS-vs-DOM ranking and aria-activedescendant wiring
 * only. Upstream ranks by relocating nodes; the port assigns CSS `order`.
 * Upstream also drops nested aria wiring from inside its layout-effect flush.
 *
 * Only ranking declarations are stripped for byte-compare — any other inline
 * style, and every other attribute and node, still has to match byte-for-byte.
 */
function stripRankingStyles(html: string): string {
	return html
		.replace(/(?:order:\s*\d+|display:\s*flex|flex-direction:\s*column);?\s*/g, '')
		.replace(/ style="\s*"/g, '');
}

function expectEqualIgnoringActiveDescendant(
	octane: { container: HTMLElement },
	react: { container: HTMLElement },
): void {
	function strip(html: string): string {
		return stripRankingStyles(html.replace(/ aria-activedescendant="[^"]*"/g, ''));
	}
	expect(normaliseHtml(strip(octane.container.innerHTML))).toBe(
		normaliseHtml(strip(react.container.innerHTML)),
	);
}

await Promise.all([preloadDifferentialFixture(FIXTURE, CACHE)]);

describe('differential: @octanejs/cmdk vs cmdk@1.1.1', function () {
	// @parity-case differential:cmdk-filter-selection-empty
	it('matches filtering, keyboard selection and the empty state', async function () {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiff', undefined, CACHE);

		// OCTANE DIVERGENCE[runtime-adaptation-divergences][differential:cmdk-filter-selection-empty]
		// Initial auto-select only: cmdk computes
		// `selectedItemId` from a callback queued INSIDE its own layout-effect
		// flush. Upstream's batcher clears the queue *after* running it, so that
		// nested entry is dropped and `aria-activedescendant` never lands on the
		// first selection. The port's batcher snapshots-and-clears first (required
		// for correctness on octane), so the combobox is wired from the start.
		// Both agree on WHICH item is selected; only the aria wiring differs, and
		// the runtimes converge as soon as a selection is user-driven.
		await differential.observe('initial render (auto-select)', async function (octane, react) {
			await settle();
			expect(selectedText(octane)).toBe('Salad');
			expect(selectedText(react)).toBe('Salad');
			expect(activeDescendant(octane)).toBe(octane.find('[cmdk-item][aria-selected="true"]').id);
			expect(activeDescendant(react)).toBeNull();
		});

		// From here every selection is user-driven, so the runtimes agree byte-for-byte.
		await differential.step('arrow down moves the selection', async function (octane, react) {
			await octane.keydown('[cmdk-root]', 'ArrowDown');
			await react.keydown('[cmdk-root]', 'ArrowDown');
			await settle();
		});

		await differential.step('arrow up moves it back', async function (octane, react) {
			await octane.keydown('[cmdk-root]', 'ArrowUp');
			await react.keydown('[cmdk-root]', 'ArrowUp');
			await settle();
		});

		// Ranking: "a" leaves Salad/Apple/Banana with different scores
		// (Apple≈0.9899, Banana=0.17, Salad=0.1683). Score order is
		// Apple > Banana > Salad, which disagrees with source order — so removing
		// Octane's CSS ranking (or upstream's DOM relocate) would fail these asserts.
		// DOM order itself is the recorded divergence, so this checkpoint does not
		// byte-compare markup.
		await differential.observe('type to rank multiple matches', async function (octane, react) {
			await octane.input('[cmdk-input]', 'a');
			await react.input('[cmdk-input]', 'a');
			await settle();

			expect(selectedText(octane)).toBe('Apple');
			expect(selectedText(react)).toBe('Apple');
			// Filter re-selects from inside the flush: Octane wires the new item;
			// upstream leaves the attribute unset or pointing at a stale id.
			expect(activeDescendant(octane)).toBe(octane.find('[cmdk-item][aria-selected="true"]').id);
			expect(activeDescendant(react)).not.toBe(react.find('[cmdk-item][aria-selected="true"]').id);

			// Upstream relocates nodes, so DOM order is ranked order.
			expect(itemTexts(react)).toEqual(['Apple', 'Banana', 'Salad']);
			// Octane keeps source DOM order and expresses rank as CSS `order`.
			expect(itemTexts(octane)).toEqual(['Salad', 'Apple', 'Banana']);
			expect(visibleItemTexts(octane)).toEqual(['Apple', 'Banana', 'Salad']);
			expect(visibleItemTexts(react)).toEqual(['Apple', 'Banana', 'Salad']);
		});

		// Single-match filter: same aria contract, then byte-compare with the
		// attribute stripped (DOM order agrees when only one item survives).
		await differential.observe('type to filter', async function (octane, react) {
			await octane.input('[cmdk-input]', 'ban');
			await react.input('[cmdk-input]', 'ban');
			await settle();
			expect(selectedText(octane)).toBe('Banana');
			expect(selectedText(react)).toBe('Banana');
			expect(activeDescendant(octane)).toBe(octane.find('[cmdk-item][aria-selected="true"]').id);
			expect(activeDescendant(react)).not.toBe(react.find('[cmdk-item][aria-selected="true"]').id);
			expectEqualIgnoringActiveDescendant(octane, react);
		});

		await differential.observe('no matches renders Empty', async function (octane, react) {
			await octane.input('[cmdk-input]', 'zzzz');
			await react.input('[cmdk-input]', 'zzzz');
			await settle();
			expect(octane.findAll('[cmdk-item]')).toHaveLength(0);
			expect(octane.find('[cmdk-empty]').textContent).toBe('No results found.');
			expect(activeDescendant(octane)).toBeNull();
			expect(activeDescendant(react)).toBeNull();
			expectEqualIgnoringActiveDescendant(octane, react);
		});

		await differential.observe('clearing restores every item', async function (octane, react) {
			await octane.input('[cmdk-input]', '');
			await react.input('[cmdk-input]', '');
			await settle();
			// Both restore every item, in SOURCE order. This checkpoint used to pin a
			// divergence: upstream's sort() relocates matching nodes, React's
			// reconciler puts them back when the search clears, and octane's leaves
			// externally-moved nodes where they are — so the port's list stayed
			// scrambled. The port no longer moves nodes at all (it ranks with CSS
			// `order` and drops that on clear), so the residue cannot form and the
			// two runtimes agree exactly.
			expect(itemTexts(react)).toEqual(['Salad', 'Apple', 'Banana', 'Cherry']);
			expect(itemTexts(octane)).toEqual(['Salad', 'Apple', 'Banana', 'Cherry']);
			expect(selectedText(octane)).toBe('Salad');
			expect(selectedText(react)).toBe('Salad');
			// Clear re-selects from inside the flush again: only Octane wires aria.
			expect(activeDescendant(octane)).toBe(octane.find('[cmdk-item][aria-selected="true"]').id);
			expect(activeDescendant(react)).not.toBe(react.find('[cmdk-item][aria-selected="true"]').id);
			expectEqualIgnoringActiveDescendant(octane, react);
		});

		differential.unmount();
	});

	// @parity-case differential:cmdk-groups
	it('matches grouped rendering, and documents the group-ordering divergence', async function () {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiffGroups', undefined, CACHE);

		await differential.observe('initial grouped render', async function (octane, react) {
			await settle();
			const headings = function headingsOf(mount: typeof octane) {
				return mount.findAll('[cmdk-group-heading]').map(function textOf(el) {
					return el.textContent;
				});
			};
			const groupValues = function groupValuesOf(mount: typeof octane) {
				return mount.findAll('[cmdk-group]').map(function valueOf(el) {
					return el.getAttribute('data-value');
				});
			};

			// Both register a value for every group, from the heading text.
			expect(headings(octane)).toEqual(['Fruits', 'Vegetables']);
			expect(headings(react)).toEqual(['Fruits', 'Vegetables']);
			expect(groupValues(octane)).toEqual(['Fruits', 'Vegetables']);
			expect(groupValues(react)).toEqual(['Fruits', 'Vegetables']);
		});

		// Empty-group hide is shared behaviour; keep it before the ordering pin.
		await differential.observe('filter to one group', async function (octane, react) {
			await octane.input('[cmdk-input]', 'car');
			await react.input('[cmdk-input]', 'car');
			await settle();

			expect(itemTexts(octane)).toEqual(['Carrot']);
			expect(itemTexts(react)).toEqual(['Carrot']);

			const hidden = function hiddenGroups(mount: typeof octane) {
				return mount
					.findAll('[cmdk-group]')
					.filter(function isHidden(el) {
						return el.hasAttribute('hidden');
					})
					.map(function valueOf(el) {
						return el.getAttribute('data-value');
					});
			};
			expect(hidden(octane)).toEqual(['Fruits']);
			expect(hidden(react)).toEqual(['Fruits']);
		});

		// OCTANE DIVERGENCE[corrected-group-ordering][differential:cmdk-groups]
		// Upstream resolves the group element by
		// `[data-value="<groupId>"]`, but `data-value` holds the heading text — so
		// its group reorder can never match and is dead code. The port matches on
		// the registered value, so groups reorder by best item score. "p" leaves
		// both groups visible (Apple + Potato) while Potato outranks Apple, so the
		// later source group must paint first on Octane and stay second on React.
		await differential.observe(
			'filter ranks groups by best item score',
			async function (octane, react) {
				await octane.input('[cmdk-input]', 'p');
				await react.input('[cmdk-input]', 'p');
				await settle();

				expect([...itemTexts(octane)].sort()).toEqual(['Apple', 'Potato']);
				expect([...itemTexts(react)].sort()).toEqual(['Apple', 'Potato']);

				// React: source order — Fruits before Vegetables (dead reorder).
				expect(visibleGroupHeadings(react)).toEqual(['Fruits', 'Vegetables']);
				// Octane: Vegetables (Potato) outranks Fruits (Apple).
				expect(visibleGroupHeadings(octane)).toEqual(['Vegetables', 'Fruits']);
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-force-mount-empty
	it('documents Empty suppression and release around force-mounted items', async function () {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiffForceMount', undefined, CACHE);

		// OCTANE DIVERGENCE[force-mount-empty-count][differential:cmdk-force-mount-empty]
		await differential.observe(
			'forceMount keeps Empty suppressed on a non-matching search',
			async function (octane, react) {
				await octane.input('[cmdk-input]', 'zzzzzz');
				await react.input('[cmdk-input]', 'zzzzzz');
				await settle();

				expect(itemTexts(octane)).toEqual(['Always Here']);
				expect(itemTexts(react)).toEqual(['Always Here']);
				expect(octane.container.querySelector('[cmdk-empty]')).toBeNull();
				// Upstream skips forceMount registration, so Empty can render over it.
				expect(react.container.querySelector('[cmdk-empty]')).not.toBeNull();
			},
		);

		await differential.observe(
			'Empty returns on Octane after the forceMount item unmounts',
			async function (octane, react) {
				await octane.click('#remove-forced');
				await react.click('#remove-forced');
				await settle();

				expect(itemTexts(octane)).toEqual([]);
				expect(itemTexts(react)).toEqual([]);
				// Octane released forceMountedCount, so Empty can return.
				expect(octane.container.querySelector('[cmdk-empty]')).not.toBeNull();
				// Upstream Empty was already present while forceMount stayed mounted.
				expect(react.container.querySelector('[cmdk-empty]')).not.toBeNull();
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-force-mount-rank
	it('documents force-mounted non-match ranking below scored matches', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffForceMountRank',
			undefined,
			CACHE,
		);

		// OCTANE DIVERGENCE[force-mount-rank-order][differential:cmdk-force-mount-rank]
		await differential.observe(
			'forceMount non-match stays below ranked matches',
			async function (octane, react) {
				await octane.input('[cmdk-input]', 'ap');
				await react.input('[cmdk-input]', 'ap');
				await settle();

				// Octane assigns CSS order to every valid item so a zero-scoring
				// forceMount stays below matches. Upstream's published sort leaves
				// the forceMount first in DOM order for this fixture.
				expect(visibleItemTexts(octane)).toEqual(['Apple', 'Apricot', 'Always Here']);
				expect(itemTexts(react)).toEqual(['Always Here', 'Apple', 'Apricot']);
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-registration-teardown
	it('keeps a single Apple across live forceMount/plain swaps', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffForceMountSwap',
			undefined,
			CACHE,
		);

		// Ordinary parity: both runtimes keep one Apple across the swap. Symmetric
		// registration release is covered by the Octane-only suite; this case is
		// not paired divergence evidence. Uses observe because aria-activedescendant
		// wiring already diverges on the initial auto-select.
		await differential.observe(
			'live forceMount/plain swap keeps a single Apple',
			async function (octane, react) {
				expect(itemTexts(octane)).toEqual(['Apple']);
				expect(itemTexts(react)).toEqual(['Apple']);

				await octane.click('#swap');
				await react.click('#swap');
				await settle();
				expect(itemTexts(octane)).toEqual(['Apple']);
				expect(itemTexts(react)).toEqual(['Apple']);

				await octane.click('#swap');
				await react.click('#swap');
				await settle();
				expect(itemTexts(octane)).toEqual(['Apple']);
				expect(itemTexts(react)).toEqual(['Apple']);
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-batcher-isolation
	it('documents batcher isolation when onValueChange throws', async function () {
		// Arm the throw only after mount: React rethrows from the initial
		// selectFirstItem layout effect and would otherwise fail the harness.
		let armThrow = false;
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffBatcherIsolation',
			{
				value: '',
				onValueChange: function throwOnChange() {
					if (armThrow) throw new Error('boom from onValueChange');
				},
			},
			CACHE,
		);
		armThrow = true;

		try {
			// OCTANE DIVERGENCE[batcher-isolation][differential:cmdk-batcher-isolation]
			// Filtering for this search is synchronous before the layout-effect
			// batcher runs; the authenticated divergence is throw surface:
			// upstream rethrows from the flush, Octane reports console.error and
			// the consumer-visible filter result remains.
			await differential.observe(
				'throwing onValueChange is reported on Octane while React rethrows',
				async function (octane, react) {
					await octane.input('[cmdk-input]', 'app');
					let reactThrew = false;
					try {
						await react.input('[cmdk-input]', 'app');
					} catch (error) {
						reactThrew = true;
						expect(String(error)).toContain('boom from onValueChange');
					}
					await settle();

					expect(itemTexts(octane)).toEqual(['Apple']);
					expect(
						consoleErrorCalls().some(function hasBoom(message) {
							return message.includes('boom from onValueChange');
						}),
					).toBe(true);
					expect(reactThrew).toBe(true);
				},
			);
		} finally {
			clearConsoleErrors();
			differential.unmount();
		}
	});

	// @parity-case differential:cmdk-duplicate-value
	it('documents development duplicate-value warnings', async function () {
		const warn = vi.spyOn(console, 'warn').mockImplementation(function noop() {});

		// OCTANE DIVERGENCE[duplicate-value-warning][differential:cmdk-duplicate-value]
		// Isolate each runtime's call window so Octane's warning and upstream
		// silence are asserted separately rather than pooled across both mounts.

		const octaneMod = await import(/* @vite-ignore */ FIXTURE);
		const octaneHost = document.createElement('div');
		document.body.appendChild(octaneHost);
		const octaneRoot = octaneCreateRoot(octaneHost);
		octaneRoot.render(octaneMod.CmdkDiffDuplicateValue);
		octaneFlushSync(function flushMount() {});
		await settle();
		expect(
			Array.from(octaneHost.querySelectorAll('[cmdk-item]')).map(function textOf(el) {
				return el.textContent;
			}),
		).toEqual(['Apple', 'Apple']);
		const octaneWarns = duplicateValueWarns(warn.mock.calls);
		expect(octaneWarns.length).toBeGreaterThan(0);
		expect(
			octaneWarns.every(function isOctaneTagged(message) {
				return message.includes('[@octanejs/cmdk]');
			}),
		).toBe(true);
		octaneRoot.unmount();
		octaneHost.remove();
		warn.mockClear();

		const reactMod = await import(
			/* @vite-ignore */ join(CACHE, `cmdk-diff-${hashString(FIXTURE)}.js`)
		);
		const reactHost = document.createElement('div');
		document.body.appendChild(reactHost);
		const reactRoot = reactCreateRoot(reactHost);
		await act(async function renderReact() {
			reactRoot.render(React.createElement(reactMod.CmdkDiffDuplicateValue));
		});
		await settle();
		expect(
			Array.from(reactHost.querySelectorAll('[cmdk-item]')).map(function textOf(el) {
				return el.textContent;
			}),
		).toEqual(['Apple', 'Apple']);
		expect(duplicateValueWarns(warn.mock.calls)).toEqual([]);
		await act(async function unmountReact() {
			reactRoot.unmount();
		});
		reactHost.remove();
		warn.mockRestore();
	});

	// @parity-case differential:cmdk-selected-force-mount
	it('documents selection move when the selected forceMount item is removed', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffSelectedForceMount',
			undefined,
			CACHE,
		);

		// OCTANE DIVERGENCE[selected-force-mount-teardown][differential:cmdk-selected-force-mount]
		await differential.observe(
			'removing the selected forceMount item reselects on Octane only',
			async function (octane, react) {
				await settle();
				expect(selectedText(octane)).toBe('Apple');
				expect(selectedText(react)).toBe('Apple');

				await octane.click('#remove-forced');
				await react.click('#remove-forced');
				await settle();

				expect(itemTexts(octane)).toEqual(['Banana']);
				expect(itemTexts(react)).toEqual(['Banana']);
				expect(selectedText(octane)).toBe('Banana');
				expect(octane.container.querySelector('[cmdk-item][aria-selected="true"]')).not.toBeNull();
				// Upstream never registered the forceMount item, so teardown leaves
				// the selected value pointing at a removed node.
				expect(react.container.querySelector('[cmdk-item][aria-selected="true"]')).toBeNull();
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-unscored-arrival
	it('keeps mid-search arrivals visible without an explicit value', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffUnscoredArrival',
			undefined,
			CACHE,
		);

		// Ordinary parity: both runtimes keep the arrival visible and ranked.
		// Inference route differences are not a consumer-observable incompatibility.
		await differential.observe(
			'items arriving mid-search stay visible on both runtimes',
			async function (octane, react) {
				await settle();
				await octane.input('[cmdk-input]', 'ap');
				await react.input('[cmdk-input]', 'ap');
				await settle();
				expect(visibleItemTexts(octane)).toEqual(['Apple']);
				expect(visibleItemTexts(react)).toEqual(['Apple']);

				await octane.click('#add-apricot');
				await react.click('#add-apricot');
				await settle();

				expect(visibleItemTexts(octane)).toEqual(['Apple', 'Apricot']);
				expect(visibleItemTexts(react)).toEqual(['Apple', 'Apricot']);
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-value-change-filter
	it('documents filter-aggregate refresh when an item value changes', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffValueChangeFilter',
			undefined,
			CACHE,
		);

		// OCTANE DIVERGENCE[value-change-filter-refresh][differential:cmdk-value-change-filter]
		await differential.observe(
			'value change during search refreshes Empty/group visibility on Octane',
			async function (octane, react) {
				await settle();
				await octane.input('[cmdk-input]', 'zzz');
				await react.input('[cmdk-input]', 'zzz');
				await settle();
				expect(octane.findAll('[cmdk-item]')).toHaveLength(0);
				expect(react.findAll('[cmdk-item]')).toHaveLength(0);
				expect(octane.find('[cmdk-empty]')).toBeTruthy();
				expect(react.find('[cmdk-empty]')).toBeTruthy();

				await octane.click('#match-search');
				await react.click('#match-search');
				await settle();

				expect(itemTexts(octane)).toEqual(['Fruit']);
				expect(octane.container.querySelector('[cmdk-empty]')).toBeNull();
				expect(octane.find('[cmdk-group]').hasAttribute('hidden')).toBe(false);
				// Upstream re-scores the item but leaves filtered.count/groups stale.
				expect(react.container.querySelector('[cmdk-empty]')).not.toBeNull();
				expect(itemTexts(react)).toEqual(['Fruit']);
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-as-child
	it('documents asChild host-element divergence', async function () {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiffAsChild', undefined, CACHE);

		// OCTANE DIVERGENCE[as-child-unsupported][differential:cmdk-as-child]
		await differential.observe(
			'asChild merges into the child only on React',
			async function (octane, react) {
				await settle();
				expect(octane.find('[cmdk-item]').tagName).toBe('DIV');
				expect(octane.find('[cmdk-item] a').getAttribute('href')).toBe('#apple');
				expect(react.find('[cmdk-item]').tagName).toBe('A');
				expect(react.find('[cmdk-item]').getAttribute('href')).toBe('#apple');
				// Octane has no Slot/asChild sink, so the boolean lands on the host and
				// the attribute writer reports it; acknowledge that expected signal.
				clearConsoleErrors();
			},
		);

		differential.unmount();
	});

	// @parity-case differential:cmdk-dialog-default-open
	it('documents Dialog defaultOpen forwarding', async function () {
		const differential = await mountDifferential(
			FIXTURE,
			'CmdkDiffDialogDefaultOpen',
			undefined,
			CACHE,
		);

		// OCTANE DIVERGENCE[dialog-default-open][differential:cmdk-dialog-default-open]
		await differential.observe(
			'defaultOpen opens the dialog on Octane only',
			async function (octane, react) {
				await settle();
				// Each side portals into its own host under data-rt, so presence is
				// attributed per runtime rather than pooled on document.body.
				expect(octane.container.querySelector('[cmdk-dialog]')).not.toBeNull();
				expect(octane.container.querySelector('[cmdk-item]')?.textContent).toBe('Apple');
				expect(react.container.querySelector('[cmdk-dialog]')).toBeNull();
				expect(document.querySelectorAll('[cmdk-dialog]')).toHaveLength(1);
			},
		);

		differential.unmount();
	});
});
