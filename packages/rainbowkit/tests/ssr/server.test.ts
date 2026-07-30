import { describe, expect, it } from 'vitest';
import { createConfig, http } from '@wagmi/core';
import { mock } from '@wagmi/connectors/mock';
import { mainnet } from 'viem/chains';
import { QueryClient } from '@octanejs/tanstack-query';
import { renderToString } from 'octane/server';
import { App } from '../_fixtures/app.tsrx';

describe('@octanejs/rainbowkit SSR', () => {
	it('emits deterministic disconnected controls without opening a wallet surface', () => {
		const config = createConfig({
			chains: [mainnet],
			connectors: [mock({ accounts: ['0x0000000000000000000000000000000000000001'] })],
			ssr: true,
			transports: { [mainnet.id]: http() },
		});
		const { html } = renderToString(App, {
			config,
			queryClient: new QueryClient(),
		});

		expect(html).toContain('Connect Wallet');
		expect(html).toContain('disconnected');
		expect(html).toContain('<span id="mounted">false</span>');
		expect(html).not.toContain('role="dialog"');
		expect(html).not.toContain('Waiting for wallet approval');
	});
});
