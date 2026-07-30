import { afterEach, describe, expect, it } from 'vitest';
import { drainPassiveEffects, hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { SsrProbe } from './_fixtures/hooks.tsrx';

afterEach(() => document.body.replaceChildren());

describe('hydration', () => {
	it('adopts stable SSR markup before activating lifecycle effects', async () => {
		const serverResult = await renderHydrationFixture(
			'usehooks-ts',
			'packages/usehooks-ts/tests/_fixtures/hooks.tsrx',
			'SsrProbe',
		);
		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const paragraph = container.querySelector('p');
		const root = hydrateRoot(container, SsrProbe);
		drainPassiveEffects();
		expect(container.querySelector('p')).toBe(paragraph);
		expect(paragraph?.textContent).toBe('server');
		root.unmount();
	});
});
