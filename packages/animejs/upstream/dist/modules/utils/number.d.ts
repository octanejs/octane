export function roundPad(v: number | string, decimalLength: number): string;
export function padStart(v: number, totalLength: number, padString: string): string;
export function padEnd(v: number, totalLength: number, padString: string): string;
export function wrap(v: number, min: number, max: number): number;
export function mapRange(value: number, inLow: number, inHigh: number, outLow: number, outHigh: number): number;
export function degToRad(degrees: number): number;
export function radToDeg(radians: number): number;
export function damp(start: number, end: number, deltaTime: number, factor: number): number;
export { snap, clamp, round, lerp } from "../core/helpers.js";
