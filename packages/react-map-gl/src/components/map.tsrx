/* global document */
import {
	createContext,
	createPortal,
	useContext,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { MountedMapsContext } from './use-map.tsrx';
import Mapbox, { type MapboxProps } from '../mapbox/mapbox';
import createRef, { type MapRef } from '../mapbox/create-ref';

import useIsomorphicLayoutEffect from '../utils/use-isomorphic-layout-effect';
import setGlobals, { type GlobalSettings } from '../utils/set-globals';
import type { MapLib, MapOptions } from '../types/lib';
import type { CSSProperties, MapChildren, Ref } from '../types/octane';

export type MapContextValue = {
	mapLib: MapLib;
	map: MapRef;
};

export const MapContext = createContext<MapContextValue>(null as unknown as MapContextValue);

type MapInitOptions =
	Omit<MapOptions, 'style' | 'container' | 'bounds' | 'fitBoundsOptions' | 'center'>;

export type MapProps =
	MapInitOptions & MapboxProps & GlobalSettings & {
		mapLib?: MapLib | Promise<MapLib>;
		reuseMaps?: boolean;
		/** Map container id */
		id?: string;
		/** Map container CSS style */
		style?: CSSProperties;
		children?: MapChildren;
		/** Octane passes refs as ordinary props; there is no forwardRef. */
		ref?: Ref<MapRef>;
	};

export function Map(props: MapProps) @{
	const mountedMapsContext = useContext(MountedMapsContext);
	const [mapInstance, setMapInstance] = useState<Mapbox | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const childContainerRef = useRef<HTMLDivElement | null>(null);

	const { current: contextValue } = useRef<MapContextValue>({
		mapLib: null as unknown as MapLib,
		map: null as unknown as MapRef,
	});

	useEffect(() => {
		const mapLib = props.mapLib;
		let isMounted = true;
		let mapbox: Mapbox;

		Promise.resolve(mapLib || import('mapbox-gl')).then((module: MapLib | { default: MapLib }) => {
			if (!isMounted) {
				return;
			}
			if (!module) {
				throw new Error('Invalid mapLib');
			}
			const mapboxgl =
				'Map' in module ? module : module.default;
			if (!mapboxgl.Map) {
				throw new Error('Invalid mapLib');
			}

			setGlobals(mapboxgl, props);
			if (props.reuseMaps) {
				mapbox = Mapbox.reuse(props, containerRef.current!)!;
			}
			if (!mapbox) {
				mapbox = new Mapbox(mapboxgl.Map, props, containerRef.current!);
			}
			contextValue.map = createRef(mapbox)!;
			contextValue.mapLib = mapboxgl;

			// The children container is created and APPENDED here rather than
			// rendered into the template, so it lands after the DOM mapbox-gl has
			// just built — which is where React puts it, and the only arrangement
			// that reproduces upstream's behavior.
			//
			// Rendered in the template, Octane's conditional block anchors it at its
			// authored position, ahead of the library's nodes. In flow it then
			// displaces `.mapboxgl-canvas-container`, the element mapbox-gl measures
			// pointer coordinates against; taken out of flow it instead paints
			// before the canvas, so a consumer's positioned overlay ends up hidden
			// and unclickable beneath an opaque map. Appending sidesteps both: same
			// `height: 100%` container as upstream, in the same place.
			const childContainer = document.createElement('div');
			childContainer.setAttribute('mapboxgl-children', '');
			childContainer.style.height = '100%';
			containerRef.current!.appendChild(childContainer);
			childContainerRef.current = childContainer;

			setMapInstance(mapbox);
		}).catch((error) => {
			const { onError } = props;
			if (onError) {
				onError({
					type: 'error',
					target: null,
					error,
				});
			} else {
				console.error(error); // eslint-disable-line
			}
		});

		return () => {
			isMounted = false;
			childContainerRef.current?.remove();
			childContainerRef.current = null;
			if (mapbox) {
				if (props.reuseMaps) {
					mapbox.recycle();
				} else {
					mapbox.destroy();
				}
			}
		};
	}, []);

	// Registration lives in its own effect rather than inside the promise above.
	// `MapProvider` reports a duplicate or reserved map id by throwing from its
	// state updater, and Octane runs updaters synchronously inside the setter, so
	// called from that promise the throw landed in its `.catch` and surfaced as a
	// map `onError` — the channel for style and network failures — instead of as
	// a real error. Here it propagates like any other effect error.
	useEffect(() => {
		if (!mapInstance) {
			return undefined;
		}
		mountedMapsContext?.onMapMount(contextValue.map, props.id);
		return () => mountedMapsContext?.onMapUnmount(props.id);
	}, [mapInstance]);

	useIsomorphicLayoutEffect(() => {
		if (mapInstance) {
			mapInstance.setProps(props);
		}
	});

	useImperativeHandle(props.ref, () => contextValue.map, [mapInstance]);

	const style: CSSProperties = useMemo(
		() => ({
			position: 'relative',
			width: '100%',
			height: '100%',
			...props.style,
		}),
		[props.style],
	);

	// The children container itself is appended by the effect above, next to the
	// DOM mapbox-gl builds; only its contents are rendered here, through a portal.
	// `Marker` and `Popup` already reach their library-owned elements this way.
	<div id={props.id} ref={containerRef} style={style}>
		@if (mapInstance) {
			<MapContext.Provider value={contextValue}>{createPortal(
				props.children,
				childContainerRef.current!,
			)}</MapContext.Provider>
		}
	</div>
}
