import { describe, it } from 'vitest';
import { mountDifferential } from './_rig.js';
import { resolve } from 'node:path';

// Byte-parity proof for octane's cloneElement / Children / isValidElement: the SAME
// .tsrx fixture runs through octane AND @tsrx/react (where the `octane` imports resolve
// to React's own cloneElement/Children), asserting identical innerHTML. This pins the
// primitives to React's actual semantics.

const FIXTURE = resolve(__dirname, '../_fixtures/clone-children.tsrx');

describe('differential: clone-children.tsrx — cloneElement / Children vs React', () => {
	it('cloneElement merges props onto a prop element identically', async () => {
		const d = await mountDifferential(FIXTURE, 'CloneDemo');
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Children.only + isValidElement + clone match React', async () => {
		const d = await mountDifferential(FIXTURE, 'OnlyDemo');
		await d.step('mount', () => {});
		d.unmount();
	});

	it('Children.map + count over a descriptor array match React', async () => {
		const d = await mountDifferential(FIXTURE, 'MapDemo');
		await d.step('mount', () => {});
		d.unmount();
	});
});
