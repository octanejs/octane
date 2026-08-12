/**
 * The same authored fixture runs through this adapter and the official
 * @dnd-kit/react@0.5.0 adapter. Each programmatic manager-action lifecycle
 * step must leave the rendered DOM byte-equivalent after the shared rig's
 * normalization. Sensors are empty; transitions come from manager.actions.
 */
import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig';
import type { DiffMount } from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/differential.tsrx');
const cache = resolve(__dirname, '.react-cache');

const rectangle = {
	x: 0,
	y: 0,
	left: 0,
	top: 0,
	right: 80,
	bottom: 80,
	width: 80,
	height: 80,
	toJSON() {
		return this;
	},
} as DOMRect;

function byId(mount: DiffMount, id: string): Element {
	const element = mount.findAll('*').find(function (candidate) {
		return candidate.id === id;
	});
	if (!element) throw new Error(`Missing #${id}`);
	return element;
}

function stubRects(mount: DiffMount, ids: string[]): void {
	for (const id of ids) {
		vi.spyOn(byId(mount, id), 'getBoundingClientRect').mockReturnValue(rectangle);
	}
}

await Promise.all([preloadDifferentialFixture(fixture, cache)]);

describe('differential: @octanejs/dnd-kit vs @dnd-kit/react', () => {
	// @parity-case differential:dnd-kit-programmatic-manager-lifecycle
	it('matches mount, pickup, movement, overlay, and drop output', async () => {
		const comparison = await mountDifferential(
			fixture,
			'ProgrammaticManagerDragFixture',
			undefined,
			cache,
		);
		await comparison.step('mount and measure', function (octane, react) {
			stubRects(octane, ['drag', 'drop']);
			stubRects(react, ['drag', 'drop']);
		});
		await comparison.step('pickup', async function (octane, react) {
			await octane.click('#pickup');
			await react.click('#pickup');
		});
		await comparison.step('move', async function (octane, react) {
			await octane.click('#move');
			await react.click('#move');
		});
		await comparison.step('drop', async function (octane, react) {
			await octane.click('#drop-control');
			await react.click('#drop-control');
		});
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-drag-overlay-compiled-children
	it('keeps static DragOverlay children equivalent across adapters', async () => {
		const comparison = await mountDifferential(
			fixture,
			'StaticOverlayDragFixture',
			undefined,
			cache,
		);
		await comparison.step('mount and measure', function (octane, react) {
			stubRects(octane, ['drag', 'drop']);
			stubRects(react, ['drag', 'drop']);
		});
		await comparison.step('pickup shows static overlay content', async function (octane, react) {
			await octane.click('#pickup');
			await react.click('#pickup');
		});
		await comparison.observe(
			'static overlay is content, not a render prop',
			function (octane, react) {
				expect(byId(octane, 'static-overlay').textContent).toBe('static overlay');
				expect(byId(react, 'static-overlay').textContent).toBe('static overlay');
			},
		);
		comparison.unmount();
	});

	// @parity-case differential:dnd-kit-sortable-omit-optimistic-sorting
	it('omits OptimisticSortingPlugin from Octane sortable defaults', async () => {
		const comparison = await mountDifferential(
			fixture,
			'DefaultSortablePluginsFixture',
			undefined,
			cache,
		);
		await comparison.observe(
			'default plugin sets differ by OptimisticSortingPlugin',
			function (octane, react) {
				const octanePlugins = byId(octane, 'sort-a').getAttribute('data-plugins') ?? '';
				const reactPlugins = byId(react, 'sort-a').getAttribute('data-plugins') ?? '';
				expect(octanePlugins).toContain('SortableKeyboardPlugin');
				expect(octanePlugins).not.toContain('OptimisticSortingPlugin');
				expect(reactPlugins).toContain('SortableKeyboardPlugin');
				expect(reactPlugins).toContain('OptimisticSortingPlugin');
			},
		);
		comparison.unmount();
	});
});
