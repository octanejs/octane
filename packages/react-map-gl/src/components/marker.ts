/* global document */
import {
	createPortal,
	memo,
	useContext,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from 'octane';
import { applyReactStyle } from '../utils/apply-react-style';
import { hasRenderableChildren } from '../utils/children';

import type { PopupInstance, MarkerInstance, MarkerOptions } from '../types/lib';
import type { MarkerEvent, MarkerDragEvent } from '../types/events';
import type { CSSProperties, MapChildren, Ref } from '../types/octane';

import { MapContext } from './map.tsrx';
import { arePointsEqual } from '../utils/deep-equal';
import { compareClassNames } from '../utils/compare-class-names';

export type MarkerProps = MarkerOptions & {
	/** Longitude of the anchor location */
	longitude: number;
	/** Latitude of the anchor location */
	latitude: number;

	popup?: PopupInstance;

	/** CSS style override, applied to the control's container */
	style?: CSSProperties;
	onClick?: (e: MarkerEvent<MouseEvent>) => void;
	onDragStart?: (e: MarkerDragEvent) => void;
	onDrag?: (e: MarkerDragEvent) => void;
	onDragEnd?: (e: MarkerDragEvent) => void;
	children?: MapChildren;
	/** Octane passes refs as ordinary props; there is no forwardRef. */
	ref?: Ref<MarkerInstance>;
};

/* eslint-disable complexity,max-statements */
export const Marker = memo(function Marker(props: MarkerProps) {
	const { map, mapLib } = useContext(MapContext);
	const thisRef = useRef({ props });

	/** Mount-time props, matching upstream's `useMemo(..., [])` construction. */
	const initialProps = useRef(props).current;

	const createMarker = (ownElement: boolean): MarkerInstance => {
		const options = {
			...initialProps,
			element: ownElement ? document.createElement('div') : null,
		};

		const mk = new mapLib.Marker(options as unknown as MarkerOptions);
		mk.setLngLat([initialProps.longitude, initialProps.latitude]);

		mk.getElement().addEventListener('click', (e: MouseEvent) => {
			thisRef.current.props.onClick?.({
				type: 'click',
				target: mk,
				originalEvent: e,
			});
		});

		mk.on('dragstart', (e) => {
			const evt = e as MarkerDragEvent;
			evt.lngLat = mk.getLngLat();
			thisRef.current.props.onDragStart?.(evt);
		});
		mk.on('drag', (e) => {
			const evt = e as MarkerDragEvent;
			evt.lngLat = mk.getLngLat();
			thisRef.current.props.onDrag?.(evt);
		});
		mk.on('dragend', (e) => {
			const evt = e as MarkerDragEvent;
			evt.lngLat = mk.getLngLat();
			thisRef.current.props.onDragEnd?.(evt);
		});

		return mk;
	};

	// A `.tsrx` children block cannot be inspected without evaluating it, and
	// evaluating it here would run any hooks inside it a second time and collide
	// on their call-site slots. So the marker starts with a binding-owned
	// element, and if the block turns out to render nothing — an `@if` that is
	// false at mount — it is rebuilt with Mapbox's default pin, which is what
	// upstream produces for a falsy child. Without this a conditional pin that
	// starts hidden leaves an empty element and the marker is invisible.
	const ownsElement = useRef(false);
	const [marker, setMarker] = useState<MarkerInstance>(() => {
		const hasChildren = hasRenderableChildren(initialProps.children);
		ownsElement.current = hasChildren;
		return createMarker(hasChildren);
	});

	useEffect(() => {
		marker.addTo(map.getMap());

		return () => {
			marker.remove();
		};
	}, [marker]);

	useEffect(() => {
		if (!ownsElement.current) return;
		const element = marker.getElement();
		// Portal anchors are comments, so `children`/`textContent` are what say
		// whether the block actually rendered anything.
		if (element.children.length > 0 || (element.textContent ?? '').trim() !== '') return;

		ownsElement.current = false;
		setMarker(createMarker(false));
	}, []);

	const {
		longitude,
		latitude,
		offset,
		style,
		draggable = false,
		popup = null,
		rotation = 0,
		rotationAlignment = 'auto',
		pitchAlignment = 'auto',
	} = props;

	useEffect(() => {
		applyReactStyle(marker.getElement(), style);
	}, [style, marker]);

	useImperativeHandle(props.ref, () => marker, [marker]);

	const oldProps = thisRef.current.props;
	if (marker.getLngLat().lng !== longitude || marker.getLngLat().lat !== latitude) {
		marker.setLngLat([longitude, latitude]);
	}
	if (offset && !arePointsEqual(marker.getOffset(), offset)) {
		marker.setOffset(offset);
	}
	if (marker.isDraggable() !== draggable) {
		marker.setDraggable(draggable);
	}
	if (marker.getRotation() !== rotation) {
		marker.setRotation(rotation);
	}
	if (marker.getRotationAlignment() !== rotationAlignment) {
		marker.setRotationAlignment(rotationAlignment);
	}
	if (marker.getPitchAlignment() !== pitchAlignment) {
		marker.setPitchAlignment(pitchAlignment);
	}
	if (marker.getPopup() !== popup) {
		marker.setPopup(popup);
	}
	const classNameDiff = compareClassNames(oldProps.className, props.className);
	if (classNameDiff) {
		for (const c of classNameDiff) {
			marker.toggleClassName(c);
		}
	}

	thisRef.current.props = props;
	return createPortal(props.children, marker.getElement());
});
