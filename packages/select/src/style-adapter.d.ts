import type { CSSObjectWithLabel } from './types';

export interface StyleCache {
	key: string;
	inserted: Record<string, unknown>;
	registered: Record<string, string>;
}

export function createStyleCache(options?: { key?: string; nonce?: string }): StyleCache;

export function resolveComponentStyle(
	cssValue: CSSObjectWithLabel,
	className?: unknown,
	cache?: StyleCache,
	nonce?: string,
): { className: string; id: string };

export interface KeyframesValue {
	name: string;
	styles: string;
	anim: 1;
	toString(): string;
}

export function createKeyframes(cssValue: CSSObjectWithLabel): KeyframesValue;
