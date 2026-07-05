// Minimal stand-in for .base-ui/packages/react/src/internals/usePressAndHold.ts. The full hook
// implements hold-to-auto-repeat + touch/scroll heuristics (288 lines, deferred). This stub
// provides inert pointer handlers so single-press stepping (via the button's own onClick) works
// and never skips a click. TODO: port the full auto-repeat behavior + dedicated timing tests.
export function isTouchLikePointerType(pointerType: string): boolean {
	return pointerType === 'touch' || pointerType === 'pen';
}

export interface UsePressAndHoldParameters {
	disabled: boolean;
	readOnly?: boolean;
	tick: (triggerEvent?: any) => boolean;
	onStop?: (nativeEvent: any) => void;
	tickDelay?: number;
	startDelay?: number;
	scrollDistance?: number;
	elementRef: { current: HTMLElement | null };
}

export function usePressAndHold(_params: UsePressAndHoldParameters): {
	pointerHandlers: Record<string, (event: any) => void>;
	shouldSkipClick: (event: any) => boolean;
} {
	return {
		pointerHandlers: {
			onTouchStart() {},
			onTouchEnd() {},
			onPointerDown() {},
			onPointerUp() {},
			onPointerMove() {},
			onPointerLeave() {},
		},
		shouldSkipClick: () => false,
	};
}
