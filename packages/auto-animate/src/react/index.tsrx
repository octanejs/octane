import { useState, useCallback, useMemo, useEffect } from 'octane';
import autoAnimate from '@formkit/auto-animate';
import type {
	AutoAnimateOptions,
	AutoAnimationPlugin,
	AnimationController,
} from '@formkit/auto-animate';

type AutoAnimateRefCallback<T extends Element> = (node: T | null) => void;

/**
 * AutoAnimate hook for adding dead-simple transitions and animations.
 * Per packages/auto-animate/upstream/src/react/index.ts
 */
export function useAutoAnimate<T extends Element>(
	options?: Partial<AutoAnimateOptions> | AutoAnimationPlugin | symbol,
): [AutoAnimateRefCallback<T>, (enabled: boolean) => void] {
	// OCTANE DIVERGENCE: compiler injects a trailing hook slot; when the hook
	// is called with no options the slot lands in the first argument.
	const resolvedOptions =
		typeof options === 'symbol' ? undefined : options;
	const [controller, setController] = useState<AnimationController | undefined>();
	const memoizedOptions = useMemo(function memoOptions() {
		return resolvedOptions;
	}, []);
	const element = useCallback(function bindElement(node: T | null) {
		if (node instanceof HTMLElement) {
			setController(autoAnimate(node, memoizedOptions));
		} else {
			setController(undefined);
		}
	}, [memoizedOptions]);
	const setEnabled = useCallback(function setEnabled(enabled: boolean) {
		if (controller) {
			if (enabled) {
				controller.enable();
			} else {
				controller.disable();
			}
		}
	}, [controller]);

	useEffect(function destroyController() {
		return function onUnmount() {
			controller?.destroy?.();
		};
	}, [controller]);

	return [element, setEnabled];
}
