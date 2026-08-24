import type { MutableRefObject, OctaneNode } from '../util/OctaneTypes.ts';
import type { Action, Store } from '@reduxjs/toolkit';
import type { RechartsRootState } from './store';

type RechartsStoreProviderProps = {
	children: OctaneNode;
	preloadedState?: Partial<RechartsRootState>;
	reduxStoreName?: string;
};
// Port of state/RechartsStoreProvider.tsx — one isolated RTK store per chart,
// provided through the custom RechartsReduxContext (via @octanejs/redux's
// Provider). A PANORAMA chart (the Brush preview) renders NO provider and
// inherits the parent chart's store.
import { useRef } from 'octane';
import { Provider } from '@octanejs/redux';
import { createRechartsStore } from './store';
import { useIsPanorama } from '../context/PanoramaContext';
import { RechartsReduxContext } from './RechartsReduxContext';

export function RechartsStoreProvider(props: RechartsStoreProviderProps) {
	const { preloadedState, children, reduxStoreName } = props;
	const isPanorama = useIsPanorama();
	// One store per CHART (not per page): recharts supports multiple independent
	// charts, so the store rides a ref, created on first render.
	const storeRef: MutableRefObject<Store<RechartsRootState, Action> | null> = useRef(null);
	if (isPanorama) {
		return children;
	}
	if (storeRef.current == null) {
		storeRef.current = createRechartsStore(preloadedState, reduxStoreName);
	}
	return <Provider context={RechartsReduxContext} store={storeRef.current}>{children}</Provider>;
}
