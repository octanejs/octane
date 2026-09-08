/// <reference types="react-dom" />

import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/tooltip.tsx');
const CACHE = resolve(__dirname, '.react-cache');

await preloadDifferentialFixture(FIXTURE, CACHE);

describe('differential: @octanejs/floating-ui vs @floating-ui/react', () => {
	// OCTANE DIVERGENCE[floating-ui-ref-as-prop][differential:floating-ui-hook-isolation]
	// @parity-case differential:floating-ui-hook-isolation
	it('keeps independent useFloating placements byte-identical', async () => {
		const differential = await mountDifferential(FIXTURE, 'TwoTooltips', undefined, CACHE);
		await differential.step('initial render', () => {});
		differential.unmount();
	});
});
