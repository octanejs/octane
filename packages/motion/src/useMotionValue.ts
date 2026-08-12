// `useMotionValue(initial)` — a stable, reactive animatable value (reuses motion's
// `motionValue`). Bind it to a `motion.*` element via `style={{ x: mv }}`; the
// element subscribes and updates without re-rendering (see the style-binding effect
// in index.ts).
import { motionValue } from 'motion';
import { useState } from 'octane';

// Memoized tagless sub-slot (single entry per caller slot) — same interned
// Symbol.for value, minus the per-render concat + registry lookup.
const mvSlotCache = new Map<symbol, symbol>();
function mvSlot(slot: symbol | undefined): symbol | undefined {
	if (slot === undefined) return undefined;
	let sym = mvSlotCache.get(slot);
	if (sym === undefined)
		mvSlotCache.set(slot, (sym = Symbol.for((slot.description ?? '') + ':mv')));
	return sym;
}

export function useMotionValue<T>(initial: T, ...args: any[]): any {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const [mv] = useState(() => motionValue(initial), mvSlot(slot));
	return mv;
}

// A MotionValue duck-typed (reactive get/set/subscribe).
export function isMotionValue(v: any): boolean {
	return v != null && typeof v.get === 'function' && typeof v.on === 'function';
}

// Transform shorthands → CSS transform functions (matching Framer Motion).
const TRANSFORM_FN: Record<string, string> = {
	x: 'translateX',
	y: 'translateY',
	z: 'translateZ',
	scale: 'scale',
	scaleX: 'scaleX',
	scaleY: 'scaleY',
	rotate: 'rotate',
	rotateX: 'rotateX',
	rotateY: 'rotateY',
	rotateZ: 'rotateZ',
	skewX: 'skewX',
	skewY: 'skewY',
};
const PX_KEYS = new Set(['x', 'y', 'z']);
const DEG_KEYS = new Set(['rotate', 'rotateX', 'rotateY', 'rotateZ', 'skewX', 'skewY']);
const NO_UNIT = new Set(['opacity', 'zIndex', 'scale', 'scaleX', 'scaleY']);

// Motion-style CSS transform function order: translate before scale/rotate so
// offsets are not scaled when both are present.
const TRANSFORM_ORDER = [
	'translateX',
	'translateY',
	'translateZ',
	'scale',
	'scaleX',
	'scaleY',
	'rotate',
	'rotateX',
	'rotateY',
	'rotateZ',
	'skewX',
	'skewY',
];

export function isTransformKey(k: string): boolean {
	return k in TRANSFORM_FN;
}

function unitizeTransformValue(key: string, val: any): string {
	if (typeof val !== 'number') return String(val);
	if (PX_KEYS.has(key)) return `${val}px`;
	if (DEG_KEYS.has(key)) return `${val}deg`;
	return `${val}`;
}

/** Locate `fn(...)` with balanced parentheses so nested `calc(...)` survives. */
function findTransformFnRange(
	transform: string,
	fn: string,
): { start: number; end: number } | null {
	const needle = fn + '(';
	let from = 0;
	while (from < transform.length) {
		const idx = transform.indexOf(needle, from);
		if (idx === -1) return null;
		// Prefer a token boundary so `scale(` does not match inside `scaleX(`.
		if (idx > 0 && /\S/.test(transform.charAt(idx - 1))) {
			from = idx + 1;
			continue;
		}
		let depth = 0;
		for (let i = idx + fn.length; i < transform.length; i++) {
			const ch = transform.charAt(i);
			if (ch === '(') depth++;
			else if (ch === ')') {
				depth--;
				if (depth === 0) return { start: idx, end: i + 1 };
			}
		}
		return null;
	}
	return null;
}

function insertTransformFn(current: string, next: string, fn: string): string {
	const orderIdx = TRANSFORM_ORDER.indexOf(fn);
	if (orderIdx === -1) return `${current} ${next}`.trim();
	for (let i = orderIdx + 1; i < TRANSFORM_ORDER.length; i++) {
		const later = findTransformFnRange(current, TRANSFORM_ORDER[i]);
		if (later) {
			const before = current.slice(0, later.start).trimEnd();
			const after = current.slice(later.start).trimStart();
			return before ? `${before} ${next} ${after}` : `${next} ${after}`;
		}
	}
	return `${current} ${next}`.trim();
}

/** Split `fn(a, b)` args at depth-0 commas so nested `calc(...)` survives. */
function splitTransformArgs(inner: string): string[] {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	for (let i = 0; i < inner.length; i++) {
		const ch = inner.charAt(i);
		if (ch === '(') depth++;
		else if (ch === ')') depth--;
		else if (ch === ',' && depth === 0) {
			const part = inner.slice(start, i).trim();
			if (part) parts.push(part);
			start = i + 1;
		}
	}
	const tail = inner.slice(start).trim();
	if (tail) parts.push(tail);
	return parts;
}

function replaceTransformRange(
	current: string,
	range: { start: number; end: number },
	next: string,
): string {
	return (current.slice(0, range.start) + next + current.slice(range.end)).trim();
}

/**
 * Layout FLIP writes compound `translate(x, y)` / `scale(sx, sy)`. Decompose those
 * into shorthands when a style MotionValue binds so unbind can remove only that
 * shorthand without corrupting or orphaning the layout contribution.
 *
 * When `transformState` already holds a sibling axis (another bound style
 * MotionValue/static shorthand), prefer that over the FLIP compound value so a
 * single-axis patch does not clobber the sibling until it emits again.
 */
function patchCompoundTransform(
	current: string,
	key: string,
	val: any,
	transformState?: Record<string, any>,
): string | null {
	const unitized = unitizeTransformValue(key, val);
	if (key === 'x' || key === 'y') {
		const range = findTransformFnRange(current, 'translate');
		if (!range) return null;
		const inner = current.slice(range.start + 'translate('.length, range.end - 1);
		const args = splitTransformArgs(inner);
		let x =
			transformState && transformState.x !== undefined
				? unitizeTransformValue('x', transformState.x)
				: args[0] || '0px';
		let y =
			transformState && transformState.y !== undefined
				? unitizeTransformValue('y', transformState.y)
				: args[1] || '0px';
		if (key === 'x') x = unitized;
		else y = unitized;
		return replaceTransformRange(current, range, `translateX(${x}) translateY(${y})`);
	}
	if (key === 'scaleX' || key === 'scaleY') {
		const range = findTransformFnRange(current, 'scale');
		if (!range) return null;
		const inner = current.slice(range.start + 'scale('.length, range.end - 1);
		const args = splitTransformArgs(inner);
		let sx =
			transformState && transformState.scaleX !== undefined
				? unitizeTransformValue('scaleX', transformState.scaleX)
				: args[0] || '1';
		let sy =
			transformState && transformState.scaleY !== undefined
				? unitizeTransformValue('scaleY', transformState.scaleY)
				: args[1] !== undefined
					? args[1]
					: args[0] || '1';
		if (key === 'scaleX') sx = unitized;
		else sy = unitized;
		return replaceTransformRange(current, range, `scaleX(${sx}) scaleY(${sy})`);
	}
	return null;
}

/** Patch one transform function into the live CSS string without wiping others. */
export function patchTransformFn(
	node: HTMLElement,
	key: string,
	val: any,
	transformState?: Record<string, any>,
): void {
	const fn = TRANSFORM_FN[key];
	if (!fn) return;
	const next = `${fn}(${unitizeTransformValue(key, val)})`;
	const current = node.style.transform || '';
	if (!current || current === 'none') {
		node.style.transform = next;
		return;
	}
	const range = findTransformFnRange(current, fn);
	if (range) {
		// Layout FLIP writes asymmetric `scale(sx, sy)`. A style `scale` MotionValue
		// shares the `scale(` token, but replacing that compound with uniform
		// `scale(n)` drops an axis mid-FLIP. Leave asymmetric compounds alone —
		// `scaleX`/`scaleY` still decompose via patchCompoundTransform below.
		if (key === 'scale') {
			const inner = current.slice(range.start + 'scale('.length, range.end - 1);
			const args = splitTransformArgs(inner);
			if (args.length >= 2 && args[0] !== args[1]) {
				return;
			}
		}
		node.style.transform = replaceTransformRange(current, range, next);
		return;
	}
	const compound = patchCompoundTransform(current, key, val, transformState);
	if (compound !== null) {
		node.style.transform = compound;
		return;
	}
	node.style.transform = insertTransformFn(current, next, fn);
}

/**
 * Remove one shorthand transform function from the live CSS string.
 * Do not mutate compound layout FLIP `translate(...)` / `scale(...)` forms —
 * those are owned by layout, not by style MotionValue unbind.
 */
export function removeTransformFn(node: HTMLElement, key: string): void {
	const fn = TRANSFORM_FN[key];
	if (!fn) return;
	const current = node.style.transform || '';
	if (!current || current === 'none') return;
	const range = findTransformFnRange(current, fn);
	if (!range) return;
	// Style `scale` shares the `scale(` token with layout FLIP's compound
	// `scale(sx, sy)`. Only remove single-arg style-owned forms; leave compounds
	// for layout (mirrors patchTransformFn's asymmetric-scale guard on bind).
	if (key === 'scale') {
		const inner = current.slice(range.start + 'scale('.length, range.end - 1);
		const args = splitTransformArgs(inner);
		if (args.length >= 2) return;
	}
	const before = current.slice(0, range.start).trimEnd();
	const after = current.slice(range.end).trimStart();
	node.style.transform = before && after ? `${before} ${after}` : before || after;
}

// Apply one style/transform value to the element. Transform shorthands patch the
// live `transform` string in place so animate/layout/drag values survive rebinds.
export function applyStyleValue(
	node: HTMLElement,
	key: string,
	val: any,
	transformState?: Record<string, any>,
): void {
	if (TRANSFORM_FN[key]) {
		if (transformState) transformState[key] = val;
		patchTransformFn(node, key, val, transformState);
	} else {
		(node.style as any)[key] = typeof val === 'number' && !NO_UNIT.has(key) ? `${val}px` : val;
	}
}
