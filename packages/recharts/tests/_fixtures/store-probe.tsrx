import { Provider } from '@octanejs/redux';
import { RechartsReduxContext } from '@octanejs/recharts/state/RechartsReduxContext';
import { useAppDispatch } from '@octanejs/recharts/state/hooks';
import { useChartLayout } from '@octanejs/recharts/context/chartLayoutContext';
import { PanoramaContext, useIsPanorama } from '@octanejs/recharts/context/PanoramaContext';

// Conformance fixture for the recharts redux plumbing: a chart-shaped store
// provided through RechartsReduxContext (the isolated per-chart store pattern),
// read back via the binding's useAppSelector-based hooks.

export function LayoutView() @{
	const layout = useChartLayout();
	const dispatch = useAppDispatch();
	<button
		class="layout"
		onClick={() => dispatch({ type: 'layout/setLayoutType', payload: 'vertical' })}
	>{String(layout)}</button>
}

export function LayoutApp(props) @{
	<Provider store={props.store} context={RechartsReduxContext}>
		<LayoutView />
	</Provider>
}

export function PanoramaProbe() @{
	<span class="pano">{String(useIsPanorama())}</span>
}

export function PanoramaApp() @{
	<PanoramaContext.Provider value={true}>
		<PanoramaProbe />
	</PanoramaContext.Provider>
}
