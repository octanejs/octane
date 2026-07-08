// Port of state/RechartsStoreProvider.tsx — one isolated RTK store per chart,
// provided through the custom RechartsReduxContext (via @octanejs/redux's
// Provider). A PANORAMA chart (the Brush preview) renders NO provider and
// inherits the parent chart's store.
import { useRef } from 'octane';
import { Provider } from '@octanejs/redux';
import { createRechartsStore } from './store';
import { useIsPanorama } from '../context/PanoramaContext';
import { RechartsReduxContext } from './RechartsReduxContext';

export function RechartsStoreProvider(props) {
	const { preloadedState, children, reduxStoreName } = props;
	const isPanorama = useIsPanorama();
	// One store per CHART (not per page): recharts supports multiple independent
	// charts, so the store rides a ref, created on first render.
	const storeRef = useRef(null);
	if (isPanorama) {
		return children;
	}
	if (storeRef.current == null) {
		storeRef.current = createRechartsStore(preloadedState, reduxStoreName);
	}
	return <Provider context={RechartsReduxContext} store={storeRef.current}>{children}</Provider>;
}
