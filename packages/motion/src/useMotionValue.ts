// `useMotionValue(initial)` — a stable, reactive animatable value (reuses motion's
// `motionValue`). Bind it to a `motion.*` element via `style={{ x: mv }}`; the
// element subscribes and updates without re-rendering (see the style-binding effect
// in index.ts).
import { motionValue } from 'motion';
import { useState } from 'octane';

export function useMotionValue<T>(initial: T, ...args: any[]): any {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const [mv] = useState(
		() => motionValue(initial),
		slot !== undefined ? Symbol.for((slot.description ?? '') + ':mv') : undefined,
	);
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

export function isTransformKey(k: string): boolean {
	return k in TRANSFORM_FN;
}

// Apply one style/transform value to the element, rebuilding the transform string
// from the accumulated transform-key state.
export function applyStyleValue(
	node: HTMLElement,
	key: string,
	val: any,
	transformState: Record<string, any>,
): void {
	const fn = TRANSFORM_FN[key];
	if (fn) {
		transformState[key] = val;
		let t = '';
		for (const k in transformState) {
			let v = transformState[k];
			if (typeof v === 'number')
				v = PX_KEYS.has(k) ? `${v}px` : DEG_KEYS.has(k) ? `${v}deg` : `${v}`;
			t += `${TRANSFORM_FN[k]}(${v}) `;
		}
		node.style.transform = t.trim();
	} else {
		(node.style as any)[key] = typeof val === 'number' && !NO_UNIT.has(key) ? `${val}px` : val;
	}
}
