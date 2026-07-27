// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useHoverShared.ts (v1.6.0).
// Pure helpers shared by the reference-side and floating-side hover interactions: delay
// resolution (a hover delay may be a number, a {open, close} pair, or a getter), and the
// open-event classification that decides whether a hover close is allowed to run.
import { isMouseLikePointerType } from './event';
import type { PopupTriggerMap } from '../popups/popupTriggerMap';

export { isTargetInsideEnabledTrigger as isInsideEnabledTrigger } from './element';
export type { PopupTriggerMap };

export interface HandleCloseOptions {
	blockPointerEvents?: boolean | undefined;
	getScope?: (() => HTMLElement | SVGSVGElement | null) | undefined;
}

export interface HandleCloseContext {
	x: number | null;
	y: number | null;
	placement: string | null;
	elements: { domReference: Element | null; floating: HTMLElement | null };
	onClose: () => void;
	nodeId?: string | undefined;
	tree?: any;
	leave?: boolean | undefined;
}

export type HandleCloseContextBase = Omit<HandleCloseContext, 'onClose' | 'tree' | 'x' | 'y'>;

export interface HandleClose {
	(context: HandleCloseContext): (event: MouseEvent) => void;
	__options?: HandleCloseOptions | undefined;
}

export type HoverDelay = number | Partial<{ open: number; close: number }>;

function resolveValue<T>(
	value: T | (() => T) | undefined,
	pointerType?: string | undefined,
): T | 0 | undefined {
	// Touch and pen never wait: a hover delay only makes sense for a cursor.
	if (pointerType != null && !isMouseLikePointerType(pointerType)) {
		return 0;
	}
	if (typeof value === 'function') {
		return (value as () => T)();
	}
	return value;
}

export function getDelay(
	value: HoverDelay | (() => HoverDelay) | undefined,
	prop: 'open' | 'close',
	pointerType?: string | undefined,
): number | undefined {
	const result = resolveValue(value, pointerType);
	if (typeof result === 'number') {
		return result;
	}
	return (result as Partial<{ open: number; close: number }> | undefined)?.[prop];
}

export function getRestMs(value: number | (() => number)): number {
	if (typeof value === 'function') {
		return value();
	}
	return value;
}

export function isClickLikeOpenEvent(
	openEventType: string | undefined,
	interactedInside: boolean,
): boolean {
	return interactedInside || openEventType === 'click' || openEventType === 'mousedown';
}

export function isHoverOpenEvent(openEventType: string | undefined): boolean {
	return Boolean(openEventType?.includes('mouse')) && openEventType !== 'mousedown';
}
