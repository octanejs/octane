// Ported from .base-ui/packages/react/src/floating-ui-react/utils/event.ts (v1.6.0) — the subset
// used so far. octane events are native, so these operate on native events directly.
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
