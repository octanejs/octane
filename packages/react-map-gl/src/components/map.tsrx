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

	const CHILD_CONTAINER_STYLE = {
		height: '100%',
	};

	// OCTANE DIVERGENCE[react-map-gl-children-container-order][differential:1]: this
	// container is rendered only once an instance exists, by which point mapbox-gl
	// has appended its own DOM. React appends its child after those foreign nodes;
	// Octane's conditional block keeps comment anchors, so the container returns to
	// its authored position ahead of them. Same elements, different sibling order.
	<div id={props.id} ref={containerRef} style={style}>
		@if (mapInstance) {
			<MapContext.Provider value={contextValue}>
				<div mapboxgl-children="" style={CHILD_CONTAINER_STYLE}>{props.children}</div>
			</MapContext.Provider>
		}
	</div>
}
