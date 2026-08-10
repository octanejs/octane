import { createContext, useContext } from 'octane';
import type { ComponentBody, OctaneNode } from 'octane';
import type { StoreRegistry } from '@livestore/livestore';

export const StoreRegistryContext = createContext<StoreRegistry | undefined>(undefined);

export type StoreRegistryProviderProps = {
	storeRegistry: StoreRegistry;
	children?: OctaneNode;
};

export const StoreRegistryProvider: ComponentBody<StoreRegistryProviderProps> = ({
	storeRegistry,
	children,
}) =>
	<StoreRegistryContext.Provider value={storeRegistry}>{children}</StoreRegistryContext.Provider>;

export const useStoreRegistry = (override?: StoreRegistry): StoreRegistry => {
	if (override !== undefined && typeof override !== 'symbol') return override;

	const storeRegistry = useContext(StoreRegistryContext);
	if (storeRegistry == null) {
		throw new Error('useStoreRegistry() must be used within <StoreRegistryProvider>');
	}
	return storeRegistry;
};
