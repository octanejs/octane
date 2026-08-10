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

	// The portal target, owned by the binding and stable for the component's
	// whole life. It is deliberately never `marker.getElement()`: aimed there,
	// content that arrives after mount lands inside Mapbox's own pin and both
	// are drawn at once. Here, late content lands somewhere harmless and the
	// marker can be rebuilt around it.
	const contentRef = useRef<HTMLDivElement | null>(null);
	if (contentRef.current === null) {
		contentRef.current = document.createElement('div');
	}
	const contentEl = contentRef.current;

	// Built from the latest committed props, not the mount-time ones. Upstream
	// constructs once and can safely read mount props; a rebuild here happens
	// after arbitrary updates, and the render body below only heals options it
	// compares against the live instance. `className` is diffed against the
	// previous props instead, and those do not change on the rebuild render, so a
	// marker rebuilt from mount props would silently drop every class toggled
	// since — and then diff further toggles against the wrong baseline.
	const createMarker = (ownElement: boolean): MarkerInstance => {
		const current = thisRef.current.props;
		const options = {
			...current,
			element: ownElement ? contentEl : null,
		};

		const mk = new mapLib.Marker(options as unknown as MarkerOptions);
		mk.setLngLat([current.longitude, current.latitude]);

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
	// on their call-site slots. Upstream asks `React.Children.forEach` whether it
	// was handed anything truthy; the binding has to infer the same answer from
	// what the block actually rendered into `contentEl`, which it can only see
	// once a commit has happened.
	const [marker, setMarker] = useState<MarkerInstance>(() =>
		createMarker(hasRenderableChildren(props.children)),
	);

	useEffect(() => {
		marker.addTo(map.getMap());

		return () => {
			marker.remove();
		};
	}, [marker]);

	// Upstream binds this once and lets the listener die with the element. The
	// port can swap the marker underneath, and `contentEl` outlives that swap, so
	// binding per marker instance would stack a second listener on the same node
	// and fire `onClick` twice.
	useEffect(() => {
		const element = marker.getElement();
		const handleClick = (e: MouseEvent) => {
			thisRef.current.props.onClick?.({
				type: 'click',
				target: marker,
				originalEvent: e,
			});
		};

		element.addEventListener('click', handleClick);
		return () => element.removeEventListener('click', handleClick);
	}, [marker]);

	// Reconcile the guess above with what the block really rendered. A block that
	// produced nothing hands the pin back to Mapbox, which is what upstream draws
	// for a falsy child — otherwise a conditional pin that starts hidden leaves an
	// empty element and the marker is invisible. Content that shows up later
	// takes the element back, because upstream would have given a marker with
	// truthy children its own element from the start.
	useEffect(() => {
		if (marker.getElement() === contentEl) {
			if (!hasRenderedContent(contentEl)) {
				setMarker(createMarker(false));
			}
			return undefined;
		}

		if (hasRenderedContent(contentEl)) {
			setMarker(createMarker(true));
			return undefined;
		}

		// Children can render on their own schedule — a component whose first
		// paint waits on an effect, a fetch, or a transition — and that never
		// re-renders `Marker`, so there is no render to observe it from.
		const observer = new MutationObserver(() => {
			if (hasRenderedContent(contentEl)) {
				setMarker(createMarker(true));
			}
		});
		observer.observe(contentEl, { childList: true, subtree: true, characterData: true });
		return () => observer.disconnect();
	}, [marker]);

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
	return createPortal(props.children, contentEl);
});

/**
 * Portal anchors are comments, so elements and text are what say whether a
 * children block rendered anything at all.
 */
function hasRenderedContent(element: HTMLElement): boolean {
	return element.children.length > 0 || (element.textContent ?? '').trim() !== '';
}
