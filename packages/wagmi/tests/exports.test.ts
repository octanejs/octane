import { describe, expect, it } from 'vitest';
import * as wagmi from '@octanejs/wagmi';

describe('@octanejs/wagmi exports', () => {
	it('exposes the selected Wagmi v3 inventory', () => {
		for (const name of [
			'createConfig',
			'WagmiProvider',
			'useConfig',
			'useConnection',
			'useConnect',
			'useDisconnect',
			'useSwitchConnection',
			'useSwitchChain',
			'useConnectors',
			'useConnections',
			'useChains',
			'useBalance',
			'useReadContract',
			'useSimulateContract',
			'useWriteContract',
			'useSendTransaction',
			'useWaitForTransactionReceipt',
			'useSignMessage',
		]) {
			expect(wagmi).toHaveProperty(name);
		}
	});

	it('does not silently restore deprecated v2 account aliases', () => {
		expect(wagmi).not.toHaveProperty('useAccount');
		expect(wagmi).not.toHaveProperty('useSwitchAccount');
	});
});
