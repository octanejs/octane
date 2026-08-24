import { drainPassiveEffects, flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { flushEffects } from '../../../octane/tests/_helpers.js';
import { renderHydrationFixture } from '../../../octane/tests/_hydration-ssr.js';
import { HydrationForm } from './fixture.js';

function settle(): void {
	flushSync(() => {});
	drainPassiveEffects();
	flushEffects();
	flushSync(() => {});
}

let serverHtml = '';

beforeAll(async () => {
	serverHtml = (
		await renderHydrationFixture(
			'formisch',
			'packages/formisch/tests/hydration/fixture.tsx',
			'HydrationForm',
		)
	).html;
});

describe('@octanejs/formisch hydration', () => {
	// @parity-case differential:formisch-hydration
	it('adopts form controls and continues responding to native input', () => {
		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverInput = container.querySelector('input')!;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, HydrationForm);
		settle();
		expect(container.querySelector('input')).toBe(serverInput);

		serverInput.value = 'Ada';
		serverInput.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Ada' }));
		settle();

		expect(container.querySelector('[data-dirty]')?.textContent).toBe('dirty');
		expect(error).not.toHaveBeenCalled();

		root.unmount();
		error.mockRestore();
		container.remove();
	});
});
