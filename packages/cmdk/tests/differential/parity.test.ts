/**
 * The same fixture runs through @octanejs/cmdk and published cmdk@1.1.1.
 * Every `step` compares normalized innerHTML after driving identical events;
 * `observe` is used only where the port documents an intentional divergence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act } from 'react';
import { mountDifferential, normaliseHtml } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/cmdk-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

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

beforeAll(() => {
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

afterAll(() => {
	globals.ResizeObserver = realResizeObserver;
	if (addedScrollIntoView) {
		delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
	}
});

async function settle(): Promise<void> {
	await act(async () => {
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
	});
}

const selectedText = (mount: { find(selector: string): Element }): string | null =>
	mount.find('[cmdk-item][aria-selected="true"]').textContent;

const activeDescendant = (mount: { find(selector: string): Element }): string | null =>
	mount.find('[cmdk-input]').getAttribute('aria-activedescendant');

/**
 * Byte-compare both trees ignoring `aria-activedescendant` only. cmdk re-selects
 * the first match from inside its own layout-effect flush; upstream's batcher
 * drops that nested work so the attribute never lands, while the port's keeps it
 * (see the documented divergence below). Everything else must still match
 * exactly — this is the full rig normalisation, minus that one attribute.
 */
function expectEqualIgnoringActiveDescendant(
	octane: { container: HTMLElement },
	react: { container: HTMLElement },
): void {
	const strip = (html: string) => html.replace(/ aria-activedescendant="[^"]*"/g, '');
	expect(normaliseHtml(strip(octane.container.innerHTML))).toBe(
		normaliseHtml(strip(react.container.innerHTML)),
	);
}

describe('differential: @octanejs/cmdk vs cmdk@1.1.1', () => {
	it('matches filtering, keyboard selection and the empty state', async () => {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiff', undefined, CACHE);

		// OCTANE DIVERGENCE (initial auto-select only): cmdk computes
		// `selectedItemId` from a callback queued INSIDE its own layout-effect
		// flush. Upstream's batcher clears the queue *after* running it, so that
		// nested entry is dropped and `aria-activedescendant` never lands on the
		// first selection. The port's batcher snapshots-and-clears first (required
		// for correctness on octane), so the combobox is wired from the start.
		// Both agree on WHICH item is selected; only the aria wiring differs, and
		// the runtimes converge as soon as a selection is user-driven.
		await differential.observe('initial render (auto-select)', async (octane, react) => {
			await settle();
			expect(selectedText(octane)).toBe('Apple');
			expect(selectedText(react)).toBe('Apple');
			expect(activeDescendant(octane)).toBe(octane.find('[cmdk-item][aria-selected="true"]').id);
			expect(activeDescendant(react)).toBeNull();
		});

		// From here every selection is user-driven, so the runtimes agree byte-for-byte.
		await differential.step('arrow down moves the selection', async (octane, react) => {
			await octane.keydown('[cmdk-root]', 'ArrowDown');
			await react.keydown('[cmdk-root]', 'ArrowDown');
			await settle();
		});

		await differential.step('arrow up moves it back', async (octane, react) => {
			await octane.keydown('[cmdk-root]', 'ArrowUp');
			await react.keydown('[cmdk-root]', 'ArrowUp');
			await settle();
		});

		// Filtering re-selects the first match from inside the flush, so upstream
		// drops `aria-activedescendant` again — these compare the whole tree with
		// only that attribute ignored.
		await differential.observe('type to filter', async (octane, react) => {
			await octane.input('[cmdk-input]', 'ban');
			await react.input('[cmdk-input]', 'ban');
			await settle();
			expect(selectedText(octane)).toBe('Banana');
			expectEqualIgnoringActiveDescendant(octane, react);
		});

		await differential.observe('no matches renders Empty', async (octane, react) => {
			await octane.input('[cmdk-input]', 'zzzz');
			await react.input('[cmdk-input]', 'zzzz');
			await settle();
			expect(octane.findAll('[cmdk-item]')).toHaveLength(0);
			expect(octane.find('[cmdk-empty]').textContent).toBe('No results found.');
			expectEqualIgnoringActiveDescendant(octane, react);
		});

		await differential.observe('clearing restores every item', async (octane, react) => {
			await octane.input('[cmdk-input]', '');
			await react.input('[cmdk-input]', '');
			await settle();
			// Both restore every item...
			const values = (mount: typeof octane) =>
				mount.findAll('[cmdk-item]').map((el) => el.textContent);
			expect([...values(octane)].sort()).toEqual(['Apple', 'Banana', 'Cherry']);
			expect([...values(react)].sort()).toEqual(['Apple', 'Banana', 'Cherry']);

			// OCTANE DIVERGENCE (found by this suite): cmdk's sort() imperatively
			// appendChild's matching items while filtering. When the search clears,
			// React's reconciler repositions the nodes it owns and the source order
			// comes back; octane's reconciler leaves externally-moved nodes where
			// they are, so the item sort() relocated stays at the end. Same items,
			// same selection — only the residual order differs.
			expect(values(react)).toEqual(['Apple', 'Banana', 'Cherry']);
			expect(values(octane)).toEqual(['Apple', 'Cherry', 'Banana']);
		});

		differential.unmount();
	});

	it('matches grouped rendering, and documents the group-ordering divergence', async () => {
		const differential = await mountDifferential(FIXTURE, 'CmdkDiffGroups', undefined, CACHE);

		await differential.observe('initial grouped render', async (octane, react) => {
			await settle();
			const headings = (mount: typeof octane) =>
				mount.findAll('[cmdk-group-heading]').map((el) => el.textContent);
			const groupValues = (mount: typeof octane) =>
				mount.findAll('[cmdk-group]').map((el) => el.getAttribute('data-value'));

			// Both register a value for every group, from the heading text.
			expect(headings(octane)).toEqual(['Fruits', 'Vegetables']);
			expect(headings(react)).toEqual(['Fruits', 'Vegetables']);
			expect(groupValues(octane)).toEqual(['Fruits', 'Vegetables']);
			expect(groupValues(react)).toEqual(['Fruits', 'Vegetables']);
		});

		// OCTANE DIVERGENCE: upstream resolves the group element by
		// `[data-value="<groupId>"]`, but `data-value` holds the heading text — so
		// its group reorder can never match and is dead code. The port matches on
		// the registered value, so groups reorder by best item score. Both must
		// still agree on which items survive the filter.
		await differential.observe('filter to one group', async (octane, react) => {
			await octane.input('[cmdk-input]', 'car');
			await react.input('[cmdk-input]', 'car');
			await settle();

			const items = (mount: typeof octane) =>
				mount.findAll('[cmdk-item]').map((el) => el.textContent);
			expect(items(octane)).toEqual(['Carrot']);
			expect(items(react)).toEqual(['Carrot']);

			// The empty group is hidden in both.
			const hidden = (mount: typeof octane) =>
				mount
					.findAll('[cmdk-group]')
					.filter((el) => el.hasAttribute('hidden'))
					.map((el) => el.getAttribute('data-value'));
			expect(hidden(octane)).toEqual(['Fruits']);
			expect(hidden(react)).toEqual(['Fruits']);
		});

		differential.unmount();
	});
});
