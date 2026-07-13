/**
 * The same authored fixture runs through this adapter and the official
 * @dnd-kit/react@0.5.0 adapter. Each keyboard lifecycle step must leave the
 * rendered DOM byte-equivalent after the shared rig's normalization.
 */
import { describe, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig';
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
	const element = mount.findAll('*').find((candidate) => candidate.id === id);
	if (!element) throw new Error(`Missing #${id}`);
	return element;
}

describe('differential: @octanejs/dnd-kit vs @dnd-kit/react', () => {
	it('matches mount, pickup, movement, overlay, and drop output', async () => {
		const comparison = await mountDifferential(fixture, 'KeyboardDragFixture', undefined, cache);
		await comparison.step('mount and measure', (octane, react) => {
			for (const target of [
				byId(octane, 'drag'),
				byId(octane, 'drop'),
				byId(react, 'drag'),
				byId(react, 'drop'),
			]) {
				vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rectangle);
			}
		});
		await comparison.step('pickup', async (octane, react) => {
			await octane.click('#pickup');
			await react.click('#pickup');
		});
		await comparison.step('move', async (octane, react) => {
			await octane.click('#move');
			await react.click('#move');
		});
		await comparison.step('drop', async (octane, react) => {
			await octane.click('#drop-control');
			await react.click('#drop-control');
		});
		comparison.unmount();
	});
});
