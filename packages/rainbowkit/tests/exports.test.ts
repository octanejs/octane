import { describe, expect, it } from 'vitest';
import * as rainbowkit from '@octanejs/rainbowkit';

describe('@octanejs/rainbowkit exports', () => {
	it('publishes the supported provider, controls, modal hooks, and themes', () => {
		expect(Object.keys(rainbowkit).sort()).toEqual([
			'ConnectButton',
			'RainbowKitProvider',
			'WalletButton',
			'darkTheme',
			'lightTheme',
			'midnightTheme',
			'rainbowTheme',
			'useAccountModal',
			'useChainModal',
			'useConnectModal',
		]);
	});
});
