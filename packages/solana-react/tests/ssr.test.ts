import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHydrationFixture } from '../../octane/tests/_hydration-ssr';
import type { FixtureClient } from './_fixtures/client-provider.tsrx';

const subscribe = vi.fn(() => vi.fn());
let html = '';

beforeAll(async () => {
	const client = { label: 'stable-client', subscribe } as unknown as FixtureClient;
	({ html } = await renderHydrationFixture(
		'solana-react',
		'packages/solana-react/tests/_fixtures/client-provider.tsrx',
		'ClientProviderFixture',
		{ client },
	));
});

describe('@octanejs/solana-react server rendering', () => {
	it('renders the public client provider and hook without touching browser APIs', () => {
		expect(html).toContain('<main id="solana-client-provider">');
		expect(html).toContain('<output id="solana-client-label">stable-client</output>');
		expect(subscribe).not.toHaveBeenCalled();
	});
});
