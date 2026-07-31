import type { ResolvedRegister, State } from '@wagmi/core';
import type { OctaneNode } from 'octane';

export type WagmiProviderProps = {
	config: ResolvedRegister['config'];
	initialState?: State;
	reconnectOnMount?: boolean;
	children?: OctaneNode;
};

export declare function WagmiProvider(props: WagmiProviderProps): OctaneNode;
