import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { inVisualOrder, settle, typeInput } from './_command-helpers';
import { RemovableSortedGroupsMenu, ScoredGroupsMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — group-ordering divergence', () => {
	it('reorders groups by their best item score', async () => {
		// OCTANE DIVERGENCE: upstream resolves the group element by
		// `[data-value="<groupId>"]`, but data-value holds the heading text, so its
		// group reorder never fires. The port matches on the registered value.
		const app = mount(ScoredGroupsMenu);
		await settle();
		const headings = () =>
			inVisualOrder(app.findAll('[cmdk-group]')).map(
				(g) => g.querySelector('[cmdk-group-heading]')?.textContent,
			);

		expect(headings()).toEqual(['Beta', 'Alpha']);

		// "a": Apple is a word-start match (high), Zebra matches late (low), so the
		// Alpha group outranks Beta and moves above it.
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(headings()).toEqual(['Alpha', 'Beta']);

		app.unmount();
	});

	it('leaves no empty group behind when a reordered group is removed', async () => {
		// Ranking a group and then removing it must not leave a shell behind. This
		// used to be a live hazard: `sort()` relocated group hosts, which strands a
		// component's node outside the comment markers that fence it, so the later
		// unmount removed the heading and items the runtime still tracked and left
		// an empty `<div cmdk-group>` in the list. Ordering is declarative now, so
		// nothing moves — the test stays as the guard against regressing to it.
		const app = mount(RemovableSortedGroupsMenu, { showBeta: true });
		await settle();
		const headings = () =>
			inVisualOrder(app.findAll('[cmdk-group]')).map(
				(g) => g.querySelector('[cmdk-group-heading]')?.textContent,
			);
		expect(headings()).toEqual(['Beta', 'Alpha', 'Gamma']);

		// "a": Apple and Avocado are word-start matches, Zebra matches late, so
		// Alpha and Gamma rank above Beta — every group host gets re-ranked.
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'a');
		await settle();
		expect(headings()).toEqual(['Alpha', 'Gamma', 'Beta']);

		// Remove a group that sort() moved.
		app.update(RemovableSortedGroupsMenu, { showBeta: false });
		await settle();

		// Its host must be gone, not left as an empty shell.
		expect(headings()).toEqual(['Alpha', 'Gamma']);
		expect(app.findAll('[cmdk-group]')).toHaveLength(2);
		expect(app.find('[cmdk-list]').textContent).toBe('AlphaAppleGammaAvocado');

		app.unmount();
	});
});
