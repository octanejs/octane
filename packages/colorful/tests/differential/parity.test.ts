import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/colorful-diff.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/colorful vs react-colorful@5.8.0', () => {
	// @parity-case differential:react-colorful-controlled
	it('matches controlled picker markup, input edits, and keyboard color updates', async () => {
		const differential = await mountDifferential(
			FIXTURE,
			'ColorfulDiff',
			{ initial: '#ff0000' },
			CACHE,
		);
		await differential.step('initial picker', () => {});
		await differential.step('valid input', async (octane, react) => {
			await octane.input('[data-testid="input"]', '#00ff00');
			await react.input('[data-testid="input"]', '#00ff00');
		});
		expect(differential.octane.find('#color').textContent).toBe('#00ff00');
		await differential.step('remove independently controlled input', async (octane, react) => {
			await octane.click('#hide-input');
			await react.click('#hide-input');
		});
		await differential.step('hue arrow', async (octane, react) => {
			await octane.keydown('[aria-label="Hue"]', 'ArrowRight', { keyCode: 39 });
			await react.keydown('[aria-label="Hue"]', 'ArrowRight', { keyCode: 39 });
		});
		expect(differential.octane.find('#color').textContent).toBe('#00ff4d');
		differential.unmount();
	});
});
