export namespace additive {
    export let animation: any;
    export { noop as update };
}
export function addAdditiveAnimation(lookups: TweenAdditiveLookups): AdditiveAnimation;
export type AdditiveAnimation = {
    duration: number;
    _offset: number;
    _delay: number;
    _head: Tween;
    _tail: Tween;
};
import { noop } from '../core/consts.js';
import type { TweenAdditiveLookups } from '../types/index.js';
import type { Tween } from '../types/index.js';
