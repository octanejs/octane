/**
 * @overload
 * @param  {DOMTargetSelector} targetSelector
 * @param  {String} propName
 * @return {String}
 *
 * @overload
 * @param  {JSTargetsParam} targetSelector
 * @param  {String} propName
 * @return {Number|String}
 *
 * @overload
 * @param  {DOMTargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String} unit
 * @return {String}
 *
 * @overload
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {Boolean} unit
 * @return {Number}
 *
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String|Boolean} [unit]
 */
export function get(targetSelector: DOMTargetSelector, propName: string): string;
/**
 * @overload
 * @param  {DOMTargetSelector} targetSelector
 * @param  {String} propName
 * @return {String}
 *
 * @overload
 * @param  {JSTargetsParam} targetSelector
 * @param  {String} propName
 * @return {Number|String}
 *
 * @overload
 * @param  {DOMTargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String} unit
 * @return {String}
 *
 * @overload
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {Boolean} unit
 * @return {Number}
 *
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String|Boolean} [unit]
 */
export function get(targetSelector: JSTargetsParam, propName: string): number | string;
/**
 * @overload
 * @param  {DOMTargetSelector} targetSelector
 * @param  {String} propName
 * @return {String}
 *
 * @overload
 * @param  {JSTargetsParam} targetSelector
 * @param  {String} propName
 * @return {Number|String}
 *
 * @overload
 * @param  {DOMTargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String} unit
 * @return {String}
 *
 * @overload
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {Boolean} unit
 * @return {Number}
 *
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String|Boolean} [unit]
 */
export function get(targetSelector: DOMTargetsParam, propName: string, unit: string): string;
/**
 * @overload
 * @param  {DOMTargetSelector} targetSelector
 * @param  {String} propName
 * @return {String}
 *
 * @overload
 * @param  {JSTargetsParam} targetSelector
 * @param  {String} propName
 * @return {Number|String}
 *
 * @overload
 * @param  {DOMTargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String} unit
 * @return {String}
 *
 * @overload
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {Boolean} unit
 * @return {Number}
 *
 * @param  {TargetsParam} targetSelector
 * @param  {String} propName
 * @param  {String|Boolean} [unit]
 */
export function get(targetSelector: TargetsParam, propName: string, unit: boolean): number;
export { registerTargets as $ };
export function set(targets: TargetsParam, parameters: AnimationParams): JSAnimation;
export function remove(targets: TargetsParam, renderable?: Renderable | WAAPIAnimation, propertyName?: string): TargetsArray;
export { cleanInlineStyles } from "../core/styles.js";
import type { DOMTargetSelector } from '../types/index.js';
import type { JSTargetsParam } from '../types/index.js';
import type { DOMTargetsParam } from '../types/index.js';
import type { TargetsParam } from '../types/index.js';
import { registerTargets } from '../core/targets.js';
import type { AnimationParams } from '../types/index.js';
import { JSAnimation } from '../animation/animation.js';
import type { Renderable } from '../types/index.js';
import type { WAAPIAnimation } from '../waapi/waapi.js';
import type { TargetsArray } from '../types/index.js';
