import { flushSync, hydrateRoot } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import { flushEffects } from '../../octane/tests/_helpers';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import { ClientProviderFixture, type FixtureClient } from './_fixtures/client-provider.tsrx';

type ReactiveFixtureClient = FixtureClient & {
	activeSubscriptions(): number;
	subscribe: ReturnType<typeof vi.fn<(listener: () => void) => () => void>>;
	cleanup: ReturnType<typeof vi.fn>;
};

function createClient(label: string): ReactiveFixtureClient {
	const listeners = new Set<() => void>();
	const cleanup = vi.fn();
	const client = {
		label,
		cleanup,
		activeSubscriptions: () => listeners.size,
		subscribe: vi.fn((listener: () => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
				cleanup();
			};
		}),
	};
	return client as unknown as ReactiveFixtureClient;
}

async function settle(): Promise<void> {
	for (let index = 0; index < 3; index += 1) {
		flushEffects();
		flushSync(() => {});
		await Promise.resolve();
	}
}

describe('@octanejs/solana-react hydration', () => {
	it('adopts stable provider output, then observes one client replacement', async () => {
		const serverClient = createClient('stable-client');
		const serverResult = await renderHydrationFixture(
			'solana-react',
			'packages/solana-react/tests/_fixtures/client-provider.tsrx',
			'ClientProviderFixture',
			{ client: serverClient },
		);
		const client = createClient('stable-client');
		const replacement = createClient('replacement-client');
		const container = document.createElement('div');
		container.innerHTML = serverResult.html;
		document.body.appendChild(container);
		const serverMain = container.querySelector('#solana-client-provider');
		const serverLabel = container.querySelector('#solana-client-label');
		const serverMarkup = container.innerHTML;
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, ClientProviderFixture, { client });
			await settle();

			expect(container.innerHTML).toBe(serverMarkup);
			expect(container.querySelector('#solana-client-provider')).toBe(serverMain);
			expect(container.querySelector('#solana-client-label')).toBe(serverLabel);
			expect(errors).not.toHaveBeenCalled();
			expect(client.activeSubscriptions()).toBe(1);

			flushSync(() => {
				root?.render(ClientProviderFixture, { client: replacement });
			});
			expect(serverLabel?.textContent).toBe('replacement-client');
			await settle();
			expect(serverLabel?.textContent).toBe('replacement-client');
			expect(container.querySelectorAll('#solana-client-label')).toHaveLength(1);
			expect(client.cleanup).toHaveBeenCalledOnce();
			expect(client.activeSubscriptions()).toBe(0);
			expect(replacement.activeSubscriptions()).toBe(1);
			expect(errors).not.toHaveBeenCalled();

			root.unmount();
			root = undefined;
			await settle();
			expect(replacement.cleanup).toHaveBeenCalledOnce();
			expect(replacement.activeSubscriptions()).toBe(0);
		} finally {
			root?.unmount();
			errors.mockRestore();
			container.remove();
		}
	});
});
