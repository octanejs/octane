import type { ComponentBody } from 'octane';

export function createStoreContext<TValue extends object>(): {
	StoreProvider: ComponentBody<{
		value: TValue;
		children?: any;
	}>;
	useStoreContext: () => TValue;
};
