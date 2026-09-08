import { resolve } from 'node:path';
import { describe, it } from 'vitest';
import {
	mountDifferential,
	preloadDifferentialFixture,
} from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/aria-120.tsrx');
const CACHE = resolve(__dirname, '.react-cache');
await preloadDifferentialFixture(FIXTURE, CACHE);

describe('React Aria 1.20 differential behavior', () => {
	// @parity-case differential:aria-120-shortcut-propagation
	it('matches exact shortcut handling, repeat/composition filtering, and propagation', async () => {
		const view = await mountDifferential(FIXTURE, 'Shortcuts', undefined, CACHE);
		try {
			for (const init of [
				{ key: 'x' },
				{ key: 'k', ctrlKey: true },
				{ key: 'k', ctrlKey: true, repeat: true },
				{ key: 'k', ctrlKey: true, isComposing: true },
			]) {
				await view.step(JSON.stringify(init), (octane, react) => {
					for (const side of [octane, react])
						side
							.find('input')
							.dispatchEvent(
								new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
							);
				});
			}
		} finally {
			view.unmount();
		}
	});

	// @parity-case differential:aria-120-token-field-markup
	it('matches token, label, and description markup', async () => {
		const view = await mountDifferential(FIXTURE, 'Tokens', {}, CACHE);
		try {
			await view.step('mount', () => {});
		} finally {
			view.unmount();
		}
	});
});
