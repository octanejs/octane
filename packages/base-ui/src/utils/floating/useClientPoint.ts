// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useClientPoint.ts (v1.6.0).
// Positions the popup relative to a client point (the cursor) instead of the trigger's box, by
// installing a virtual reference element whose rect follows the pointer on the chosen axis.
//
// octane adaptations: handlers receive the NATIVE event; every composed hook threads an explicit
// slot.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect, useMemo, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { addEventListener } from '../addEventListener';
import { ownerWindow } from '../owner';
import { useStableCallback } from '../useStableCallback';
import { contains, getTarget } from './element';
import { isMouseLikePointerType } from './event';

function createVirtualElement(
	domElement: Element | null | undefined,
	data: {
		axis: 'x' | 'y' | 'both';
		dataRef: { current: any };
		pointerType: string | undefined;
		x: number | null;
		y: number | null;
	},
): any {
	let offsetX: number | null = null;
	let offsetY: number | null = null;
	let isAutoUpdateEvent = false;

	return {
		contextElement: domElement || undefined,
		getBoundingClientRect() {
			const domRect = domElement?.getBoundingClientRect() || { width: 0, height: 0, x: 0, y: 0 };

			const isXAxis = data.axis === 'x' || data.axis === 'both';
			const isYAxis = data.axis === 'y' || data.axis === 'both';
			const canTrackCursorOnAutoUpdate =
				['mouseenter', 'mousemove'].includes(data.dataRef.current.openEvent?.type || '') &&
				data.pointerType !== 'touch';

			let width = domRect.width;
			let height = domRect.height;
			let x = domRect.x;
			let y = domRect.y;

			if (offsetX == null && data.x && isXAxis) {
				offsetX = domRect.x - data.x;
			}

			if (offsetY == null && data.y && isYAxis) {
				offsetY = domRect.y - data.y;
			}

			x -= offsetX || 0;
			y -= offsetY || 0;
			width = 0;
			height = 0;

			if (!isAutoUpdateEvent || canTrackCursorOnAutoUpdate) {
				width = data.axis === 'y' ? domRect.width : 0;
				height = data.axis === 'x' ? domRect.height : 0;
				x = isXAxis && data.x != null ? data.x : x;
				y = isYAxis && data.y != null ? data.y : y;
			} else if (isAutoUpdateEvent && !canTrackCursorOnAutoUpdate) {
				height = data.axis === 'x' ? domRect.height : height;
				width = data.axis === 'y' ? domRect.width : width;
			}

			isAutoUpdateEvent = true;

			return { width, height, x, y, top: y, right: x + width, bottom: y + height, left: x };
		},
	};
}

function isMouseBasedEvent(event: Event | undefined): event is MouseEvent {
	return event != null && (event as MouseEvent).clientX != null;
}

export interface UseClientPointProps {
	/**
	 * Whether the hook is enabled, including all internal effects and event handlers.
	 * @default true
	 */
	enabled?: boolean | undefined;
	/**
	 * Whether to restrict the client point to an axis and use the reference element (if it exists)
	 * as the other axis. Useful when the floating element is also interactive.
	 * @default 'both'
	 */
	axis?: 'x' | 'y' | 'both' | undefined;
}

export function useClientPoint(...args: any[]): Record<string, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useClientPoint');
	const context = user[0] as any;
	const props = (user[1] as UseClientPointProps) ?? {};

	const { enabled = true, axis = 'both' } = props;

	const store = context != null && 'rootStore' in context ? context.rootStore : context;

	const open = store.useState('open', subSlot(slot, 's:open'));
	const floating = store.useState('floatingElement', subSlot(slot, 's:floating'));
	const domReference = store.useState('domReferenceElement', subSlot(slot, 's:ref'));

	const dataRef = store.context.dataRef;

	const initialRef = useRef(false, subSlot(slot, 'initial'));
	const cleanupListenerRef = useRef<null | (() => void)>(null, subSlot(slot, 'cleanup'));

	const [pointerType, setPointerType] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'ptype'),
	);
	const [reactive, setReactive] = useState<never[]>([], subSlot(slot, 'reactive'));

	const resetReference = useStableCallback(
		(reference: Element | null) => {
			store.set('positionReference', reference);
		},
		subSlot(slot, 'reset'),
	);

	const setReference = useStableCallback(
		(newX: number | null, newY: number | null, referenceElement?: Element | null) => {
			if (initialRef.current) {
				return;
			}

			// Don't set if the open event wasn't mouse-like (e.g. focus to open, then hover the
			// reference). Only applies when the event exists.
			if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) {
				return;
			}

			store.set(
				'positionReference',
				createVirtualElement(referenceElement ?? domReference, {
					x: newX,
					y: newY,
					axis,
					dataRef,
					pointerType,
				}),
			);
		},
		subSlot(slot, 'setRef'),
	);

	const handleReferenceEnterOrMove = useStableCallback(
		(event: MouseEvent) => {
			if (!open) {
				setReference(event.clientX, event.clientY, event.currentTarget as Element);
			} else if (!cleanupListenerRef.current) {
				// With no cleanup there's no listener; re-add it for the case where the cursor landed on
				// the floating element and then came back to the reference (an interactive popup).
				setReference(event.clientX, event.clientY, event.currentTarget as Element);
				setReactive([]);
			}
		},
		subSlot(slot, 'enterMove'),
	);

	// For a mouse-like pointer keep following the cursor even while the popup transitions out. On
	// touch that's undesirable — the popup would jump to the dismissal touch point.
	const openCheck = isMouseLikePointerType(pointerType) ? floating : open;

	useEffect(
		() => {
			if (!enabled) {
				resetReference(domReference);
				return undefined;
			}

			if (!openCheck) {
				return undefined;
			}

			function cleanupListener() {
				cleanupListenerRef.current?.();
				cleanupListenerRef.current = null;
			}

			const win = ownerWindow(floating);

			function handleMouseMove(event: MouseEvent) {
				const target = getTarget(event) as Element | null;
				if (!contains(floating, target)) {
					setReference(event.clientX, event.clientY);
				} else {
					cleanupListener();
				}
			}

			if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) {
				cleanupListenerRef.current = addEventListener(
					win,
					'mousemove',
					handleMouseMove as EventListener,
				);
			} else {
				resetReference(domReference);
			}

			return cleanupListener;
		},
		[
			openCheck,
			enabled,
			floating,
			dataRef,
			domReference,
			store,
			setReference,
			resetReference,
			reactive,
		],
		subSlot(slot, 'e:track'),
	);

	// Clear virtual cursor references when the hook unmounts. Enabled flips are handled above.
	useEffect(
		() => () => {
			store.set('positionReference', null);
		},
		[store],
		subSlot(slot, 'e:unmount'),
	);

	useEffect(
		() => {
			if (enabled && !floating) {
				initialRef.current = false;
			}
		},
		[enabled, floating],
		subSlot(slot, 'e:reset'),
	);

	useEffect(
		() => {
			if (!enabled && open) {
				initialRef.current = true;
			}
		},
		[enabled, open],
		subSlot(slot, 'e:freeze'),
	);

	const reference = useMemo(
		() => {
			function setPointerTypeRef(event: PointerEvent) {
				setPointerType(event.pointerType);
			}

			return {
				onPointerDown: setPointerTypeRef,
				onPointerEnter: setPointerTypeRef,
				onMouseMove: handleReferenceEnterOrMove,
				onMouseEnter: handleReferenceEnterOrMove,
			};
		},
		[handleReferenceEnterOrMove],
		subSlot(slot, 'ref'),
	);

	return useMemo(
		() => (enabled ? { reference, trigger: reference } : {}),
		[enabled, reference],
		subSlot(slot, 'out'),
	);
}
