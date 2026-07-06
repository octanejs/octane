// Ported from .base-ui/packages/react/src/floating-ui-react/utils/event.ts (v1.6.0) — the subset
// used so far. octane events are native, so these operate on native events directly.
import { platform } from '../platform';

export function isClickLikeEvent(event: Event): boolean {
	const type = event.type;
	return type === 'click' || type === 'mousedown' || type === 'keydown' || type === 'keyup';
}

export function isMouseLikePointerType(pointerType: string | undefined, strict?: boolean): boolean {
	const values: Array<string | undefined> = ['mouse', 'pen'];
	if (!strict) {
		values.push('', undefined);
	}
	return values.includes(pointerType);
}

// octane events are native, so this is effectively always false for handler `event`s (a native
// event has no `.nativeEvent`) — ported for faithfulness so `isReactEvent(e) ? e.nativeEvent : e`
// resolves to the native event.
export function isReactEvent(event: any): boolean {
	return event != null && 'nativeEvent' in event;
}

export function isVirtualClick(event: MouseEvent | PointerEvent): boolean {
	if ((event as PointerEvent).pointerType === '' && event.isTrusted) {
		return true;
	}
	if (platform.os.android && (event as PointerEvent).pointerType) {
		return event.type === 'click' && event.buttons === 1;
	}
	return event.detail === 0 && !(event as PointerEvent).pointerType;
}

export function isVirtualPointerEvent(event: PointerEvent): boolean {
	if (platform.env.jsdom) {
		return false;
	}
	return (
		(!platform.os.android && event.width === 0 && event.height === 0) ||
		(platform.os.android &&
			event.width === 1 &&
			event.height === 1 &&
			event.pressure === 0 &&
			event.detail === 0 &&
			event.pointerType === 'mouse') ||
		(event.width < 1 &&
			event.height < 1 &&
			event.pressure === 0 &&
			event.detail === 0 &&
			event.pointerType === 'touch')
	);
}
