export interface IslandProps {
	resource: Promise<string>;
	target: Element;
	ref: (button: HTMLButtonElement | null) => void;
	onSubscription: (connected: boolean) => void;
	onSignal: () => void;
}

export interface AppProps extends Omit<IslandProps, 'resource'> {
	initial: Promise<string>;
	next: Promise<string>;
	resolve: () => void;
	nativeNext: Promise<string>;
	resolveNative: () => void;
}
