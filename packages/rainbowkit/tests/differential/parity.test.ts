import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const fixture = resolve(__dirname, '../_fixtures/parity.tsrx');
const cache = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/rainbowkit vs real RainbowKit', () => {
	// @parity-case differential:outside-provider-hooks
	it('modal hooks stay inert outside a provider', async () => {
		const mounted = await mountDifferential(fixture, 'OutsideProviderHooks', undefined, cache);
		await mounted.step('mount', () => {});
		mounted.unmount();
	});
});
