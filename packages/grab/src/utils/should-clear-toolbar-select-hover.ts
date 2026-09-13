/**
 * Selection chrome is suppressed while the toolbar select control is hovered.
 * Under `html { pointer-events: none }` freeze, mouseleave can fail to fire when
 * the pointer leaves a `pointer-events: auto` toolbar island — leaving the
 * suppress flag stuck. Pointermove + bounds is the reliable reset.
 */
export function shouldClearToolbarSelectHover(
	isHovered: boolean,
	clientX: number,
	clientY: number,
	rect: Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'> | null,
): boolean {
	if (!isHovered) return false;
	if (!rect) return true;
	return clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom;
}
