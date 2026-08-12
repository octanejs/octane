import { describe, expect, it } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { inVisualOrder, settle, typeInput } from './_command-helpers';
import { ForceMountAfterMatchMenu } from './_fixtures/basic.tsrx';

describe('@octanejs/cmdk — force-mount rank divergence', () => {
	// @parity-case octane:force-mount-rank
	it('keeps a force-mounted non-match below the ranked matches', async () => {
		// A force-mounted item never scores and never unmounts, so it is the only
		// item that stays rendered without a rank. Upstream sorts every valid item by
		// score and appends them, which pushes a zero-scoring item to the BOTTOM.
		// Leaving it unranked instead puts it at the top of a flex column, because
		// the initial `order` of 0 sorts ahead of every ranked match.
		const app = mount(ForceMountAfterMatchMenu);
		await settle();
		typeInput(app.find('[cmdk-input]') as HTMLInputElement, 'ap');
		await settle();

		expect(inVisualOrder(app.findAll('[cmdk-item]')).map((el) => el.textContent)).toEqual([
			'Apple',
			'Apricot',
			'Always Here',
		]);

		app.unmount();
	});
});
