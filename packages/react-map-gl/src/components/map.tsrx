import {
	createContext,
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

			setMapInstance(mapbox);
			mountedMapsContext?.onMapMount(contextValue.map, props.id);
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
			if (mapbox) {
				mountedMapsContext?.onMapUnmount(props.id);
				if (props.reuseMaps) {
					mapbox.recycle();
				} else {
					mapbox.destroy();
				}
			}
		};
	}, []);

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

	// OCTANE DIVERGENCE[react-map-gl-children-container-order][differential:1]: upstream's
	// container is `{height: '100%'}` in normal flow, which is safe there only
	// because React appends it AFTER mapbox-gl's own DOM. Octane anchors it at its
	// authored position, ahead of that DOM, where a full-height block in flow
	// pushes `.mapboxgl-canvas-container` down by the entire height of the map.
	//
	// That element is what mapbox-gl measures pointer coordinates against, so the
	// displacement silently breaks every point-anchored interaction — wheel zoom,
	// double-click zoom, feature queries — by exactly the map's height, which
	// reads as "zoom always anchors near the top edge".
	//
	// Taking the container out of flow reproduces upstream's geometry exactly:
	// the same full-container box, still painted beneath the canvas because it
	// stays first in tree order among positioned siblings, and no dependency on
	// where the library's nodes happen to sit.
	const CHILD_CONTAINER_STYLE = {
		position: 'absolute' as const,
		top: 0,
		left: 0,
		width: '100%',
		height: '100%',
	};

	<div id={props.id} ref={containerRef} style={style}>
		@if (mapInstance) {
			<MapContext.Provider value={contextValue}>
				<div mapboxgl-children="" style={CHILD_CONTAINER_STYLE}>{props.children}</div>
			</MapContext.Provider>
		}
	</div>
}
