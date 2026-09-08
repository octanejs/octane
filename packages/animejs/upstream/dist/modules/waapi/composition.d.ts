export function removeWAAPIAnimation($el: DOMTarget, property?: string, parent?: WAAPIAnimation): globalThis.Animation;
export function addWAAPIAnimation(parent: WAAPIAnimation, $el: DOMTarget, property: string, keyframes: PropertyIndexedKeyframes, params: KeyframeAnimationOptions): Animation;
import type { DOMTarget } from '../types/index.js';
import type { WAAPIAnimation } from '../waapi/waapi.js';
