import { afterEach, expect, it } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr.js';
import { Database } from './_fixtures/database.tsrx';
afterEach(() => document.body.replaceChildren());
// @parity-case conformance:db-hydration
it('adopts database markup and follows hydrated data and provider replacement', async () => {
	const { html } = await renderHydrationFixture(
		'tanstack-db',
		'packages/tanstack-db/tests/_fixtures/database.tsrx',
		'Database',
		{},
	);
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.append(container);
	const output = container.querySelector('#people')!;
	const rename = container.querySelector<HTMLButtonElement>('#rename')!;
	const replace = container.querySelector<HTMLButtonElement>('#replace')!;
	const root = hydrateRoot(container, Database, {});
	try {
		await act(async () => {});
		expect(container.querySelector('#people')).toBe(output);
		expect(output.textContent).toBe('Ada');
		await act(async () => rename.click());
		expect(output.textContent).toBe('Grace');
		await act(async () => replace.click());
		expect(output.textContent).toBe('Grace');
		expect(container.querySelector('#people')).toBe(output);
		expect(container.querySelector('#rename')).toBe(rename);
	} finally {
		root.unmount();
	}
	expect(output.isConnected).toBe(false);
});
