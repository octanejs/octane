import type { MutableRefObject, OctaneNode } from '../util/OctaneTypes.ts';
import type { EasingInput } from './easing';
import type { AnimationItem, AnimationMatchByProp } from './matchBy';
import type { CartesianLayout, PolarLayout } from '../util/types';

export type AnimationInterpolateFn<ItemType, LayoutType extends CartesianLayout | PolarLayout> =
	(items: | ReadonlyArray<AnimationItem<ItemType>>
	| null, animationElapsedTime: number, layout: LayoutType) => ReadonlyArray<ItemType>;
export type AnimatedItemsProps<ItemType, LayoutType extends CartesianLayout | PolarLayout> = {
	animationInput: unknown;
	animationIdPrefix: string;
	items: ReadonlyArray<ItemType> | undefined;
	previousItemsRef: MutableRefObject<ReadonlyArray<ItemType> | null | undefined>;
	isAnimationActive: boolean | 'auto';
	animationBegin: number;
	animationDuration: number;
	animationEasing: EasingInput;
	onAnimationStart?: () => void;
	onAnimationEnd?: () => void;
	animationInterpolateFn: AnimationInterpolateFn<ItemType, LayoutType>;
	animationMatchBy?: AnimationMatchByProp<ItemType>;
	shouldUpdatePreviousRef?: (animationElapsedTime: number) => boolean;
	children: (items: ReadonlyArray<
		ItemType
	>, animationElapsedTime: number, isEntrance: boolean) => OctaneNode;
	layout: LayoutType;
};
// Port of animation/AnimatedItems.tsx — the reusable enter/update/exit
// animation wrapper for array-based chart data (Bar, Line, Area, Pie, …).
import { useCallback, useState } from 'octane';
import { JavascriptAnimate } from './JavascriptAnimate.tsrx';
import { useAnimationId } from '../util/useAnimationId.ts';
import { matchAnimationItems, matchByIndex } from './matchBy';
import { useAnimationStartSnapshot } from './useAnimationStartSnapshot.ts';

/**
 * Tracks animation state and provides callbacks for animation start/end.
 */
export function useAnimationCallbacks(onAnimationStart?: () => void, onAnimationEnd?: () => void) {
	const [isAnimating, setIsAnimating] = useState(false);
	const handleAnimationStart = useCallback(() => {
		if (typeof onAnimationStart === 'function') {
			onAnimationStart();
		}
		setIsAnimating(true);
	}, [onAnimationStart]);
	const handleAnimationEnd = useCallback(() => {
		if (typeof onAnimationEnd === 'function') {
			onAnimationEnd();
		}
		setIsAnimating(false);
	}, [onAnimationEnd]);
	return {
		isAnimating,
		handleAnimationStart,
		handleAnimationEnd,
	};
}

export function AnimatedItems<ItemType, LayoutType extends CartesianLayout | PolarLayout>(
	props: AnimatedItemsProps<ItemType, LayoutType>,
) {
	const {
		animationInput,
		animationIdPrefix,
		items,
		previousItemsRef,
		isAnimationActive,
		animationBegin,
		animationDuration,
		animationEasing,
		onAnimationStart,
		onAnimationEnd,
		animationInterpolateFn,
		animationMatchBy,
		shouldUpdatePreviousRef,
		children,
		layout,
	} = props;
	const animationId = useAnimationId(animationInput, animationIdPrefix);
	const animationStartItems = useAnimationStartSnapshot(animationId, previousItemsRef);
	const rawPrevItems = animationStartItems.startValue ?? null;
	const animationItems: ReadonlyArray<AnimationItem<ItemType>> | null = matchAnimationItems(
		rawPrevItems,
		items,
		animationMatchBy ?? matchByIndex,
	);
	return <JavascriptAnimate
		animationId={animationId}
		begin={animationBegin}
		duration={animationDuration}
		isActive={isAnimationActive}
		easing={animationEasing}
		onAnimationEnd={onAnimationEnd}
		onAnimationStart={onAnimationStart}
		key={animationId}
	>
		{(animationElapsedTime) => {
			const isEntrance = rawPrevItems == null;
			const stepData =
				items == null
					? items
					: animationInterpolateFn(animationItems, animationElapsedTime, layout);
			const canUpdate =
				shouldUpdatePreviousRef
					? shouldUpdatePreviousRef(animationElapsedTime)
					: animationElapsedTime > 0;
			animationStartItems.syncStepValue(stepData, animationElapsedTime, canUpdate);
			if (stepData == null) {
				return null;
			}
			return children(stepData, animationElapsedTime, isEntrance);
		}}
	</JavascriptAnimate>;
}
