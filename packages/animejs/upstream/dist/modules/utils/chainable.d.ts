/**
 * @typedef {Object} ChainablesMap
 * @property {ChainedClamp} clamp
 * @property {ChainedRound} round
 * @property {ChainedSnap} snap
 * @property {ChainedWrap} wrap
 * @property {ChainedLerp} lerp
 * @property {ChainedDamp} damp
 * @property {ChainedMapRange} mapRange
 * @property {ChainedRoundPad} roundPad
 * @property {ChainedPadStart} padStart
 * @property {ChainedPadEnd} padEnd
 * @property {ChainedDegToRad} degToRad
 * @property {ChainedRadToDeg} radToDeg
 */
/**
 * @callback ChainedUtilsResult
 * @param {Number} value - The value to process through the chained operations
 * @return {Number} The processed result
 */
/**
 * @typedef {ChainablesMap & ChainedUtilsResult} ChainableUtil
 */
/**
 * @callback ChainedRoundPad
 * @param {Number} decimalLength - Number of decimal places
 * @return {ChainableUtil}
 */
export const roundPad: typeof numberUtils.roundPad & ChainedRoundPad;
/**
 * @callback ChainedPadStart
 * @param {Number} totalLength - Target length
 * @param {String} padString - String to pad with
 * @return {ChainableUtil}
 */
export const padStart: typeof numberUtils.padStart & ChainedPadStart;
/**
 * @callback ChainedPadEnd
 * @param {Number} totalLength - Target length
 * @param {String} padString - String to pad with
 * @return {ChainableUtil}
 */
export const padEnd: typeof numberUtils.padEnd & ChainedPadEnd;
/**
 * @callback ChainedWrap
 * @param {Number} min - Minimum boundary
 * @param {Number} max - Maximum boundary
 * @return {ChainableUtil}
 */
export const wrap: typeof numberUtils.wrap & ChainedWrap;
/**
 * @callback ChainedMapRange
 * @param {Number} inLow - Input range minimum
 * @param {Number} inHigh - Input range maximum
 * @param {Number} outLow - Output range minimum
 * @param {Number} outHigh - Output range maximum
 * @return {ChainableUtil}
 */
export const mapRange: typeof numberUtils.mapRange & ChainedMapRange;
/**
 * @callback ChainedDegToRad
 * @return {ChainableUtil}
 */
export const degToRad: typeof numberUtils.degToRad & ChainedDegToRad;
/**
 * @callback ChainedRadToDeg
 * @return {ChainableUtil}
 */
export const radToDeg: typeof numberUtils.radToDeg & ChainedRadToDeg;
/**
 * @callback ChainedSnap
 * @param {Number|Array<Number>} increment - Step size or array of snap points
 * @return {ChainableUtil}
 */
export const snap: typeof numberUtils.snap & ChainedSnap;
/**
 * @callback ChainedClamp
 * @param {Number} min - Minimum boundary
 * @param {Number} max - Maximum boundary
 * @return {ChainableUtil}
 */
export const clamp: typeof numberUtils.clamp & ChainedClamp;
/**
 * @callback ChainedRound
 * @param {Number} decimalLength - Number of decimal places
 * @return {ChainableUtil}
 */
export const round: typeof numberUtils.round & ChainedRound;
/**
 * @callback ChainedLerp
 * @param {Number} start - Starting value
 * @param {Number} end - Ending value
 * @return {ChainableUtil}
 */
export const lerp: typeof numberUtils.lerp & ChainedLerp;
/**
 * @callback ChainedDamp
 * @param {Number} start - Starting value
 * @param {Number} end - Target value
 * @param {Number} deltaTime - Delta time in ms
 * @return {ChainableUtil}
 */
export const damp: typeof numberUtils.damp & ChainedDamp;
export type UtilityFunction = (...args: any[]) => number | string;
export type ChainablesMap = {
    clamp: ChainedClamp;
    round: ChainedRound;
    snap: ChainedSnap;
    wrap: ChainedWrap;
    lerp: ChainedLerp;
    damp: ChainedDamp;
    mapRange: ChainedMapRange;
    roundPad: ChainedRoundPad;
    padStart: ChainedPadStart;
    padEnd: ChainedPadEnd;
    degToRad: ChainedDegToRad;
    radToDeg: ChainedRadToDeg;
};
export type ChainedUtilsResult = (value: number) => number;
export type ChainableUtil = ChainablesMap & ChainedUtilsResult;
export type ChainedRoundPad = (decimalLength: number) => ChainableUtil;
export type ChainedPadStart = (totalLength: number, padString: string) => ChainableUtil;
export type ChainedPadEnd = (totalLength: number, padString: string) => ChainableUtil;
export type ChainedWrap = (min: number, max: number) => ChainableUtil;
export type ChainedMapRange = (inLow: number, inHigh: number, outLow: number, outHigh: number) => ChainableUtil;
export type ChainedDegToRad = () => ChainableUtil;
export type ChainedRadToDeg = () => ChainableUtil;
export type ChainedSnap = (increment: number | Array<number>) => ChainableUtil;
export type ChainedClamp = (min: number, max: number) => ChainableUtil;
export type ChainedRound = (decimalLength: number) => ChainableUtil;
export type ChainedLerp = (start: number, end: number) => ChainableUtil;
export type ChainedDamp = (start: number, end: number, deltaTime: number) => ChainableUtil;
declare const numberUtils: typeof numberImports;
import * as numberImports from './number.js';
export {};
