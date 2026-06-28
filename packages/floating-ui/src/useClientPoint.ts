// Ported from @floating-ui/react useClientPoint — positions the floating element
// relative to a client point (e.g. the mouse). octane events are native.
import { getWindow } from '@floating-ui/utils/dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';

import { splitSlot, subSlot } from './internal';
import {
	contains,
	getTarget,
	isMouseLikePointerType,
	useEffectEvent,
	useModernLayoutEffect,
} from './utils';

function createVirtualElement(domElement: any, data: any): any {
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
function isMouseBasedEvent(event: any): boolean {
	return event != null && event.clientX != null;
}

export function useClientPoint(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const context = user[0];
	const props = (user[1] as any) ?? {};

	const open = context.open;
	const dataRef = context.dataRef;
	const floating = context.elements.floating;
	const domReference = context.elements.domReference;
	const refs = context.refs;

	const enabled = props.enabled ?? true;
	const axis = props.axis ?? 'both';
	const x = props.x ?? null;
	const y = props.y ?? null;

	const initialRef = useRef(false, subSlot(slot, 'init'));
	const cleanupListenerRef = useRef<any>(null, subSlot(slot, 'cleanup'));
	const [pointerType, setPointerType] = useState<any>(undefined, subSlot(slot, 'ptype'));
	const [reactive, setReactive] = useState<any[]>([], subSlot(slot, 'reactive'));

	const setReference = useEffectEvent(
		(px: number, py: number) => {
			if (initialRef.current) return;
			if (dataRef.current.openEvent && !isMouseBasedEvent(dataRef.current.openEvent)) {
				return;
			}
			refs.setPositionReference(
				createVirtualElement(domReference, { x: px, y: py, axis, dataRef, pointerType }),
			);
		},
		subSlot(slot, 'setref'),
	);

	const handleReferenceEnterOrMove = useEffectEvent(
		(event: any) => {
			if (x != null || y != null) return;
			if (!open) {
				setReference(event.clientX, event.clientY);
			} else if (!cleanupListenerRef.current) {
				setReactive([]);
			}
		},
		subSlot(slot, 'enter'),
	);

	const openCheck = isMouseLikePointerType(pointerType) ? floating : open;
	const addListener = useCallback(
		() => {
			if (!openCheck || !enabled || x != null || y != null) return;
			const win = getWindow(floating);
			function handleMouseMove(event: any) {
				const target = getTarget(event);
				if (!contains(floating, target as any)) {
					setReference(event.clientX, event.clientY);
				} else {
					win.removeEventListener('mousemove', handleMouseMove);
					cleanupListenerRef.current = null;
				}
			}
			if (!dataRef.current.openEvent || isMouseBasedEvent(dataRef.current.openEvent)) {
				win.addEventListener('mousemove', handleMouseMove);
				const cleanup = () => {
					win.removeEventListener('mousemove', handleMouseMove);
					cleanupListenerRef.current = null;
				};
				cleanupListenerRef.current = cleanup;
				return cleanup;
			}
			refs.setPositionReference(domReference);
		},
		[openCheck, enabled, x, y, floating, dataRef, refs, domReference, setReference],
		subSlot(slot, 'add'),
	);

	useEffect(
		() => {
			return addListener();
		},
		[addListener, reactive],
		subSlot(slot, 'e:add'),
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
		subSlot(slot, 'e:block'),
	);
	useModernLayoutEffect(
		() => {
			if (enabled && (x != null || y != null)) {
				initialRef.current = false;
				setReference(x, y);
			}
		},
		[enabled, x, y, setReference],
		subSlot(slot, 'e:explicit'),
	);

	const reference = useMemo(
		() => {
			function setPointerTypeRef(_ref: any) {
				const { pointerType: pt } = _ref;
				setPointerType(pt);
			}
			return {
				onPointerDown: setPointerTypeRef,
				onPointerEnter: setPointerTypeRef,
				onMouseMove: handleReferenceEnterOrMove,
				onMouseEnter: handleReferenceEnterOrMove,
			};
		},
		[handleReferenceEnterOrMove],
		subSlot(slot, 'm:ref'),
	);

	return useMemo(
		() => (enabled ? { reference } : {}),
		[enabled, reference],
		subSlot(slot, 'm:ret'),
	);
}
