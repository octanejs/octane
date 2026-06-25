// @octane-ts/motion — Framer Motion for the octane renderer.
//
// Reuses motion's framework-agnostic animation engine (`animate`) and gesture
// primitives (`hover`, `press`) and reimplements the `motion.*` components on
// octane. Each `motion.tag` renders a real host `<tag>` (via octane's
// `hostComponent` primitive), captures its node, and drives animations from layout
// effects — exactly the refs + effects + rendering path this is meant to exercise.
import { animate, hover, press } from 'motion';
import { hostComponent, useLayoutEffect, useState } from 'octane-ts';

// A plain-TS component gets its OWN block per instance (componentSlot), so fixed
// slot symbols don't collide across instances — and these are distinct within one.
const REFS = Symbol.for('octane-motion:refs');
const ENTER = Symbol.for('octane-motion:enter');
const ANIMATE = Symbol.for('octane-motion:animate');
const GESTURE = Symbol.for('octane-motion:gesture');
const EXIT = Symbol.for('octane-motion:exit');
const LAYOUT = Symbol.for('octane-motion:layout');

const MOTION_PROPS = new Set([
	'initial',
	'animate',
	'transition',
	'whileHover',
	'whileTap',
	'whileFocus',
	'exit',
	'layout',
	'variants',
	'children',
]);

function domProps(props: any): Record<string, any> {
	const out: Record<string, any> = {};
	for (const k in props) if (!MOTION_PROPS.has(k)) out[k] = props[k];
	return out;
}

// Cheap structural key so a layout effect re-runs only when the target actually
// changes (inline objects are a new reference every render).
function stableKey(v: any): string {
	return v == null ? '' : JSON.stringify(v);
}

function whenDone(controls: any, done: () => void): void {
	const p = controls && (controls.finished ?? controls);
	if (p && typeof p.then === 'function') p.then(done, done);
	else done();
}

function createMotionComponent(tag: string) {
	return function MotionComponent(scope: any, props: any): void {
		const node = hostComponent(scope, '_m', tag, domProps(props), props.children) as HTMLElement;

		// The exit cleanup is registered once (mount-time closure), but needs the
		// LATEST node/exit/transition — thread them through a stable holder.
		const [latest] = useState(() => ({}) as any, REFS);
		latest.node = node;
		latest.exit = props.exit;
		latest.transition = props.transition;

		// `initial`: apply instantly on mount (before the animate effect runs).
		useLayoutEffect(
			() => {
				if (props.initial) animate(node, props.initial, { duration: 0 });
			},
			[],
			ENTER,
		);

		// `animate`: animate to the target on mount and whenever it changes.
		useLayoutEffect(
			() => {
				if (props.animate) {
					const controls = animate(node, props.animate, props.transition);
					return () => controls.stop();
				}
			},
			[stableKey(props.animate), stableKey(props.transition)],
			ANIMATE,
		);

		// Gestures: `whileHover` / `whileTap` animate to the gesture target on start
		// and back to the resting (`animate`/`initial`) state on end.
		useLayoutEffect(
			() => {
				const base = props.animate ?? props.initial ?? {};
				const cleanups: Array<() => void> = [];
				if (props.whileHover) {
					cleanups.push(
						hover(node, () => {
							animate(node, props.whileHover, props.transition);
							return () => {
								animate(node, base, props.transition);
							};
						}),
					);
				}
				if (props.whileTap) {
					cleanups.push(
						press(node, () => {
							animate(node, props.whileTap, props.transition);
							return () => {
								animate(node, base, props.transition);
							};
						}),
					);
				}
				return () => cleanups.forEach((c) => c());
			},
			[],
			GESTURE,
		);

		// `layout`: animate layout changes with FLIP. Each commit, measure the box
		// (transform reset so it's the LAYOUT box, not the transformed one); if it
		// moved/resized vs the previous commit, apply the inverse transform instantly
		// then animate it back to identity — so the element appears to glide from its
		// old box to its new one. (A single-element FLIP; the full projection tree —
		// nested/shared layout, scale correction — is out of scope.)
		useLayoutEffect(
			() => {
				if (!props.layout) return;
				const prevTransform = node.style.transform;
				node.style.transform = '';
				const r = node.getBoundingClientRect();
				const box = { left: r.left, top: r.top, width: r.width, height: r.height };
				const prev = latest.layoutBox;
				latest.layoutBox = box;
				if (!prev) return;
				const dx = prev.left - box.left;
				const dy = prev.top - box.top;
				const sx = box.width ? prev.width / box.width : 1;
				const sy = box.height ? prev.height / box.height : 1;
				if (dx || dy || sx !== 1 || sy !== 1) {
					node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
					animate(node, { transform: 'translate(0px, 0px) scale(1, 1)' }, props.transition);
				} else {
					node.style.transform = prevTransform;
				}
			},
			undefined,
			LAYOUT,
		);

		// Exit: this effect's CLEANUP runs on unmount, while the node is still in the
		// DOM (octane fires cleanups before detaching). We clone the leaving node
		// OUTSIDE the block's range (so octane's removal doesn't take the clone),
		// animate the exit on the clone, and remove the clone when it finishes.
		useLayoutEffect(
			() => () => {
				const n: HTMLElement | null = latest.node;
				const exit = latest.exit;
				if (!exit || !n || !n.isConnected || n.parentNode == null) return;
				const parent = n.parentNode as HTMLElement;
				const clone = n.cloneNode(true) as HTMLElement;
				// Position the clone where the original sits, then append it at the END
				// of the parent — outside every range octane is about to remove (the
				// motion block AND any enclosing @if / list branch) — so it survives
				// the unmount and can animate out on its own.
				const rect = n.getBoundingClientRect();
				clone.style.position = 'absolute';
				clone.style.top = `${n.offsetTop}px`;
				clone.style.left = `${n.offsetLeft}px`;
				clone.style.width = `${rect.width}px`;
				clone.style.height = `${rect.height}px`;
				parent.appendChild(clone);
				const controls = animate(clone, exit, latest.transition);
				whenDone(controls, () => clone.remove());
			},
			[],
			EXIT,
		);
	};
}

// `motion.div`, `motion.span`, … — a proxy that lazily builds (and caches) a
// component per tag.
export const motion: any = new Proxy(
	{},
	{
		get(cache: any, tag: string | symbol) {
			if (typeof tag !== 'string') return undefined;
			return cache[tag] ?? (cache[tag] = createMotionComponent(tag));
		},
	},
);

// AnimatePresence — renders its children; each `motion.*` with an `exit` prop
// self-animates its own removal (see the exit cleanup above), so this is a thin
// passthrough that exists for drop-in compatibility with Framer Motion's API.
export function AnimatePresence(scope: any, props: any): void {
	if (typeof props.children === 'function') props.children(scope);
}

export { useAnimate } from './useAnimate';

// Re-export motion's framework-agnostic helpers (animate, stagger, value types, …).
export * from 'motion';
