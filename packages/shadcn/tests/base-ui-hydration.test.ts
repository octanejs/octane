import { act, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { SelectExample } from './_fixtures/shadcn-diff/base-ui-latest.tsrx';

let server: Awaited<ReturnType<typeof renderHydrationFixture>>;
beforeAll(async () => {
	server = await renderHydrationFixture(
		'base-ui',
		'packages/shadcn/tests/_fixtures/shadcn-diff/base-ui-latest.tsrx',
		'SelectExample',
	);
}, 60_000);

describe('shadcn Base UI hydration', () => {
	it('adopts server-rendered Select markup and handles controlled updates', async () => {
		const container = document.createElement('div');
		container.innerHTML = server.html;
		document.body.appendChild(container);
		const trigger = container.querySelector('#fruit-trigger');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			expect(trigger?.textContent).toContain('Apple');
			await act(async () => {
				root = hydrateRoot(container, SelectExample);
			});
			expect(container.querySelector('#fruit-trigger')).toBe(trigger);
			await act(async () => {
				container.querySelector<HTMLButtonElement>('#choose-pear')!.click();
			});
			expect(trigger?.textContent).toContain('Pear');
			expect(new FormData(container.querySelector('form')!).get('fruit')).toBe('pear');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
