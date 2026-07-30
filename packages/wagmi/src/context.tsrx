import { useEffect, useRef } from 'octane';
import { hydrate, type ResolvedRegister, type State } from '@wagmi/core';
import type { OctaneNode } from 'octane';
import { WagmiContext } from './internal';

export type WagmiProviderProps = {
	config: ResolvedRegister['config'];
	initialState?: State;
	reconnectOnMount?: boolean;
	children?: OctaneNode;
};

type HydrationLifecycle = {
	config: ResolvedRegister['config'];
	onMount: () => Promise<void>;
};

export function WagmiProvider(props: WagmiProviderProps) @{
	const reconnectOnMount = props.reconnectOnMount ?? true;
	const lifecycleRef = useRef<HydrationLifecycle | null>(null);
	let lifecycle = lifecycleRef.current;

	if (!lifecycle || lifecycle.config !== props.config) {
		const { onMount } = hydrate(props.config, {
			initialState: props.initialState,
			reconnectOnMount,
		});
		lifecycle = {
			config: props.config,
			onMount,
		};
		lifecycleRef.current = lifecycle;
		if (!props.config._internal.ssr) onMount();
	}

	useEffect(() => {
		if (!lifecycle.config._internal.ssr) return;
		lifecycle.onMount();
	}, [lifecycle]);

	<WagmiContext.Provider value={props.config}>{props.children}</WagmiContext.Provider>
}
