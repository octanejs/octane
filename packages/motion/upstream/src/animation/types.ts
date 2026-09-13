import {
    AnyResolvedKeyframe,
    KeyframeResolver,
    OnKeyframesResolved,
} from "motion-dom"

export type ResolveKeyframes<V extends AnyResolvedKeyframe> = (
    keyframes: V[],
    onComplete: OnKeyframesResolved<V>,
    name?: string,
    motionValue?: any
) => KeyframeResolver<V>
