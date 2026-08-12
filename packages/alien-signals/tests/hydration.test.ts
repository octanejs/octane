import { flushSync, hydrateRoot } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createSignal } from '@octanejs/alien-signals';
import { flushEffects } from './_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { ServerSignalView } from './_fixtures/hooks.tsrx';

const source = createSignal(7);
const entries: string[] = [];
const props = {
	source,
	log: (entry: string) => {
		entries.push(entry);
	},
};
let serverHtml: string;

beforeAll(async () => {
	serverHtml = (
		await renderHydrationFixture(
			'alien-signals',
			'packages/alien-signals/tests/_fixtures/hooks.tsrx',
			'ServerSignalView',
			props,
		)
	).html;
});

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/alien-signals hydration', () => {
	it('adopts server markup, starts client lifecycle work, and remains reactive', async () => {
		expect(entries).toEqual([]);

		const container = document.createElement('div');
		container.innerHTML = serverHtml;
		document.body.appendChild(container);
		const serverParagraph = container.querySelector('#server-signal');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, ServerSignalView, props);
			await settle();

			expect(container.querySelector('#server-signal')).toBe(serverParagraph);
			expect(entries).toEqual(['effect', 'scope']);
			expect(errors).not.toHaveBeenCalled();

			source(8);
			await settle();
			expect(serverParagraph?.textContent).toBe('8');
			expect(errors).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
