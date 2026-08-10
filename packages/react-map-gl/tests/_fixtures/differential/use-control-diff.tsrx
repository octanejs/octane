/**
 * `useControl` called directly by a consumer — the public hook, not one of the
 * five control components this package ships.
 *
 * This is the shape that exposes Octane's custom-hook calling convention: the
 * compiler rewrites a `.tsrx` call site to `withSlot(sym, useControl, ...args,
 * sym)` and *retains* the trailing symbol, so a hook with optional trailing
 * parameters sees one extra argument that React never passes. The five bundled
 * controls are plain `.ts` modules and get no injected slot, so they cannot
 * catch this.
 */
import { Map, useControl } from '@octanejs/react-map-gl';

/** The two-argument form: `useControl(onCreate, opts)`. */
function CornerControl(props: { position: any }) {
	useControl(({ mapLib }: any) => new mapLib.ScaleControl({}), { position: props.position });
	return null;
}

/** The three-argument form: `useControl(onCreate, onRemove, opts)` — a different
 *  positional path through the same resolution, so it is worth its own control. */
function CornerControlWithTeardown(props: { position: any; onRemoved: () => void }) {
	useControl(({ mapLib }: any) => new mapLib.NavigationControl({}), () => props.onRemoved(), {
		position: props.position,
	});
	return null;
}

export function UseControlDiff(props: any) @{
	<Map
		mapLib={props.mapLib}
		mapboxAccessToken="test-token"
		initialViewState={{ longitude: -100, latitude: 40, zoom: 4 }}
	>
		<CornerControl position="bottom-left" />
		<CornerControlWithTeardown position="top-left" onRemoved={props.onRemoved} />
	</Map>
}
