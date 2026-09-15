import { UnresolvedValueKeyframe, AnimationOptions, MotionValue, Transition, ElementOrSelector, DOMKeyframesDefinition, AnimationPlaybackOptions, GroupAnimationWithThen, AnimationPlaybackControlsWithThen } from 'motion-dom';

/**
 * Lifecycle callbacks are not supported on individual sequence segments
 * because segments are consolidated into a single animation per subject.
 * Use sequence-level options (e.g. SequenceOptions.onComplete) instead.
 */
type LifecycleCallbacks = "onUpdate" | "onPlay" | "onComplete" | "onRepeat" | "onStop";
/**
 * Distributive Omit preserves union branches (unlike plain Omit).
 */
type DistributiveOmit<T, K extends string> = T extends any ? Omit<T, K> : never;
type SegmentTransitionOptions = DistributiveOmit<AnimationOptions, LifecycleCallbacks> & At;
type SegmentValueTransitionOptions = DistributiveOmit<Transition, LifecycleCallbacks> & At;
/**
 * Known keys of the object are suggested, but any key is accepted so
 * effects registered via `animate.addEffect()` can expose shorthands like
 * `rotateY` or `"params.time"` on subjects that don't have those properties.
 */
type ObjectTarget<O> = {
    [K in keyof O]?: O[K] | UnresolvedValueKeyframe | UnresolvedValueKeyframe[];
} & {
    [key: string]: unknown;
};
type SequenceTime = number | "<" | `+${number}` | `-${number}` | `${string}`;
type SequenceLabel = string;
interface SequenceLabelWithTime {
    name: SequenceLabel;
    at: SequenceTime;
}
interface At {
    at?: SequenceTime;
}
type MotionValueSegment = [
    MotionValue,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[]
];
type MotionValueSegmentWithTransition = [
    MotionValue,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[],
    SegmentValueTransitionOptions
];
type DOMSegment = [ElementOrSelector, DOMKeyframesDefinition];
type DOMSegmentWithTransition = [
    ElementOrSelector,
    DOMKeyframesDefinition,
    SegmentTransitionOptions
];
type ObjectSegment<O extends {} = {}> = [O, ObjectTarget<O>];
type ObjectSegmentWithTransition<O extends {} = {}> = [
    O,
    ObjectTarget<O>,
    SegmentTransitionOptions
];
type SequenceProgressCallback = (value: any) => void;
type FunctionSegment = [SequenceProgressCallback] | [SequenceProgressCallback, SegmentTransitionOptions] | [
    SequenceProgressCallback,
    UnresolvedValueKeyframe | UnresolvedValueKeyframe[],
    SegmentTransitionOptions
];
type Segment = ObjectSegment | ObjectSegmentWithTransition | SequenceLabel | SequenceLabelWithTime | MotionValueSegment | MotionValueSegmentWithTransition | DOMSegment | DOMSegmentWithTransition | FunctionSegment;
type AnimationSequence = Segment[];
interface SequenceOptions extends AnimationPlaybackOptions {
    delay?: number;
    duration?: number;
    defaultTransition?: Transition;
    reduceMotion?: boolean;
    skipAnimations?: boolean;
    onComplete?: () => void;
}

declare function animateSequence(definition: AnimationSequence, options?: SequenceOptions): GroupAnimationWithThen;

declare const animateMini: (elementOrSelector: ElementOrSelector, keyframes: DOMKeyframesDefinition, options?: AnimationOptions) => AnimationPlaybackControlsWithThen;

export { animateMini as animate, animateSequence };
