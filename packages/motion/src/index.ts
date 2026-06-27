// @octanejs/motion — Framer Motion for the octane renderer.
//
// Reuses motion's framework-agnostic animation engine (`animate`), gesture
// primitives (`hover`, `press`, `inView`), MotionValues, and scoped animation, and
// reimplements the `motion.*` components on octane. Each `motion.tag` renders a real
// host `<tag>` (via octane's `hostComponent` primitive), captures its node, and
// drives animation/gesture/layout/drag from layout effects — exactly the refs +
// effects + rendering path this is meant to exercise.
import { animate, hover, press, inView } from 'motion';
import { hostComponent, useLayoutEffect, useState, provideContext } from 'octane';
import {
	MotionConfigContext,
	VariantContext,
	StaggerContext,
	resolveVariant,
	splitVariant,
} from './context';
import { isMotionValue, isTransformKey, applyStyleValue } from './useMotionValue';
import { useContext } from 'octane';

// A plain-TS component gets its OWN block per instance (componentSlot), so fixed
// slot symbols don't collide across instances — and these are distinct within one.
const REFS = Symbol.for('octane-motion:refs');
const ENTER = Symbol.for('octane-motion:enter');
const ANIMATE = Symbol.for('octane-motion:animate');
const GESTURE = Symbol.for('octane-motion:gesture');
const EXIT = Symbol.for('octane-motion:exit');
const LAYOUT = Symbol.for('octane-motion:layout');
const DRAG = Symbol.for('octane-motion:drag');
const INVIEW = Symbol.for('octane-motion:inview');
const MV = Symbol.for('octane-motion:motionvalues');
const LAYOUT_ID = Symbol.for('octane-motion:layoutid');
const STAGGER_ORCH = Symbol.for('octane-motion:stagger-orch');
const STAGGER = Symbol.for('octane-motion:stagger');

// Shared-element registry: a `layoutId` element records its box on unmount; the
// next element to mount with the same id crossfades (FLIPs) from it. (A basic
// shared-layout "magic move"; the full projection tree is out of scope.)
interface Box {
	left: number;
	top: number;
	width: number;
	height: number;
}
const layoutCells = new Map<string, Box>();
const boxOf = (n: HTMLElement): Box => {
	const r = n.getBoundingClientRect();
	return { left: r.left, top: r.top, width: r.width, height: r.height };
};

// Props consumed by motion (everything else is spread onto the host element).
const MOTION_PROPS = new Set([
	'initial',
	'animate',
	'transition',
	'whileHover',
	'whileTap',
	'whileFocus',
	'whileInView',
	'viewport',
	'exit',
	'layout',
	'layoutId',
	'variants',
	'drag',
	'dragConstraints',
	'dragElastic',
	'dragMomentum',
	'onDrag',
	'onDragStart',
	'onDragEnd',
	'onAnimationComplete',
	'children',
]);

function domProps(props: any): Record<string, any> {
	const out: Record<string, any> = {};
	for (const k in props) {
		if (MOTION_PROPS.has(k)) continue;
		if (k === 'style' && props.style && typeof props.style === 'object') {
			// Motion values + transform shorthands (x/y/scale/…) are applied by the
			// motion-value effect, not written to the DOM as raw style.
			const s: Record<string, any> = {};
			for (const sk in props.style) {
				const v = props.style[sk];
				if (isMotionValue(v) || isTransformKey(sk)) continue;
				s[sk] = v;
			}
			out.style = s;
		} else {
			out[k] = props[k];
		}
	}
	return out;
}

// Cheap structural key so a layout effect re-runs only when the target actually
// changes (inline objects are a new reference every render).
function stableKey(v: any): string {
	return v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
}

function whenDone(controls: any, done: () => void): void {
	const p = controls && (controls.finished ?? controls);
	if (p && typeof p.then === 'function') p.then(done, done);
	else done();
}

function clamp(v: number, min: number, max: number): number {
	return v < min ? min : v > max ? max : v;
}

function createMotionComponent(tag: string) {
	return function MotionComponent(props: any, scope: any): void {
		const config = useContext(MotionConfigContext);
		const inherited = useContext(VariantContext);
		// Read the PARENT's stagger orchestration before providing our own below.
		const parentStagger = useContext(StaggerContext);
		const variants = props.variants;

		// Variant labels: an explicit prop wins, else inherit the parent's label.
		const initialLabel = props.initial !== undefined ? props.initial : inherited.initial;
		const animateLabel = props.animate !== undefined ? props.animate : inherited.animate;
		// A child PARTICIPATES in its parent's stagger when it animates via an inherited
		// label rather than its own `animate`.
		const inheritsAnimate = props.animate === undefined && typeof inherited.animate === 'string';
		const { values: resolvedInitial } = splitVariant(resolveVariant(initialLabel, variants));
		const { values: resolvedAnimate, transition: animateVariantTransition } = splitVariant(
			resolveVariant(animateLabel, variants),
		);
		const transition = animateVariantTransition ?? props.transition ?? config.transition;

		// Stable holder (also our stagger token) — created before we register/provide.
		const [latest] = useState(() => ({}) as any, REFS);

		// As a child: register with the parent's orchestration to get a stable index.
		if (parentStagger && parentStagger.active && inheritsAnimate) {
			if (!parentStagger.children.includes(latest)) parentStagger.children.push(latest);
			latest.staggerParent = parentStagger;
		} else {
			latest.staggerParent = null;
		}

		// As a parent: build/refresh OUR orchestration from our (variant) transition and
		// provide it to children.
		const [orch] = useState(
			() =>
				({
					active: false,
					staggerChildren: 0,
					delayChildren: 0,
					staggerDirection: 1,
					children: [],
				}) as any,
			STAGGER_ORCH,
		);
		const staggerSrc = animateVariantTransition ?? props.transition;
		orch.staggerChildren = staggerSrc?.staggerChildren ?? 0;
		orch.delayChildren = staggerSrc?.delayChildren ?? 0;
		orch.staggerDirection = staggerSrc?.staggerDirection ?? 1;
		orch.active =
			orch.staggerChildren > 0 ||
			orch.delayChildren > 0 ||
			typeof orch.delayChildren === 'function';

		// Propagate the active labels + stagger orchestration to descendants (passing
		// through inherited labels), before rendering children.
		provideContext(scope, VariantContext, {
			initial: typeof initialLabel === 'string' ? initialLabel : inherited.initial,
			animate: typeof animateLabel === 'string' ? animateLabel : inherited.animate,
		});
		provideContext(scope, StaggerContext, orch);

		// Slot 0 of this component's own block (one hostComponent per motion instance).
		const node = hostComponent(scope, 0, tag, domProps(props), props.children) as HTMLElement;

		// Resolve a gesture/exit target to its values + its own (per-variant) transition,
		// so a variant target carrying a `transition` key honors it (like `animate` does).
		const rsv = (v: any) => splitVariant(resolveVariant(v, variants));
		const exitS = rsv(props.exit);
		const hoverS = rsv(props.whileHover);
		const tapS = rsv(props.whileTap);
		const focusS = rsv(props.whileFocus);
		const inViewS = rsv(props.whileInView);

		latest.node = node;
		latest.transition = transition;
		latest.exit = exitS.values;
		latest.exitTransition = exitS.transition;
		latest.whileHover = hoverS.values;
		latest.whileHoverTransition = hoverS.transition;
		latest.whileTap = tapS.values;
		latest.whileTapTransition = tapS.transition;
		latest.whileFocus = focusS.values;
		latest.whileFocusTransition = focusS.transition;
		latest.whileInView = inViewS.values;
		latest.whileInViewTransition = inViewS.transition;
		latest.base = resolvedAnimate ?? resolvedInitial ?? {};
		latest.drag = props.drag;
		latest.dragConstraints = props.dragConstraints;
		latest.onDrag = props.onDrag;
		latest.onDragStart = props.onDragStart;
		latest.onDragEnd = props.onDragEnd;

		// `initial`: apply instantly on mount (before the animate effect runs).
		useLayoutEffect(
			() => {
				if (resolvedInitial) animate(node, resolvedInitial, { duration: 0 });
			},
			[],
			ENTER,
		);

		// `animate`: animate to the (resolved) target on mount and whenever it changes.
		// If we're a stagger child, fold in our per-child delay (our index + the sibling
		// count are both known by now — all children registered during the parent render).
		useLayoutEffect(
			() => {
				if (resolvedAnimate) {
					let t = transition;
					const o = latest.staggerParent;
					if (o && o.active) {
						const index = o.children.indexOf(latest);
						const count = o.children.length;
						let delay: number;
						if (typeof o.delayChildren === 'function') {
							// Framer's stagger()/function form: delayChildren(index, total) IS the delay.
							delay = o.delayChildren(index, count);
						} else {
							const offset = o.staggerDirection === 1 ? index : count - 1 - index;
							delay = (o.delayChildren || 0) + offset * (o.staggerChildren || 0);
						}
						if (delay > 0) t = { ...(t || {}), delay: (t?.delay || 0) + delay };
					}
					const controls = animate(node, resolvedAnimate, t);
					if (props.onAnimationComplete) whenDone(controls, () => props.onAnimationComplete());
					return () => controls.stop();
				}
			},
			[stableKey(resolvedAnimate), stableKey(transition)],
			ANIMATE,
		);

		// As a stagger child, deregister from the parent's orchestration on unmount so
		// indices/counts stay correct for surviving siblings.
		useLayoutEffect(
			() => () => {
				const o = latest.staggerParent;
				if (o) {
					const i = o.children.indexOf(latest);
					if (i >= 0) o.children.splice(i, 1);
				}
			},
			[],
			STAGGER,
		);

		// Motion values + static transform shorthands in `style`. MotionValues are
		// subscribed (and update the element without a re-render); shorthands apply once.
		useLayoutEffect(
			() => {
				const style = props.style;
				if (!style || typeof style !== 'object') return;
				const transformState: Record<string, any> = {};
				const cleanups: Array<() => void> = [];
				for (const key in style) {
					const v = style[key];
					if (isMotionValue(v)) {
						const apply = (val: any) => applyStyleValue(node, key, val, transformState);
						apply(v.get());
						cleanups.push(v.on('change', apply));
					} else if (isTransformKey(key)) {
						applyStyleValue(node, key, v, transformState);
					}
				}
				return () => cleanups.forEach((c) => c());
			},
			[],
			MV,
		);

		// Gestures: `whileHover` / `whileTap` / `whileFocus` animate to the gesture
		// target on start and back to the resting state on end. Targets/transition are
		// read from `latest`, so prop changes take effect without re-binding.
		useLayoutEffect(
			() => {
				const cleanups: Array<() => void> = [];
				const gesture = (
					bind: (el: Element, onStart: () => () => void) => () => void,
					valuesKey: string,
					transitionKey: string,
				) =>
					bind(node, () => {
						animate(node, latest[valuesKey], latest[transitionKey] ?? latest.transition);
						return () => {
							animate(node, latest.base, latest.transition);
						};
					});
				if (props.whileHover)
					cleanups.push(gesture(hover as any, 'whileHover', 'whileHoverTransition'));
				if (props.whileTap) cleanups.push(gesture(press as any, 'whileTap', 'whileTapTransition'));
				if (props.whileFocus) {
					const onFocus = () =>
						animate(node, latest.whileFocus, latest.whileFocusTransition ?? latest.transition);
					const onBlur = () => animate(node, latest.base, latest.transition);
					node.addEventListener('focus', onFocus);
					node.addEventListener('blur', onBlur);
					cleanups.push(() => {
						node.removeEventListener('focus', onFocus);
						node.removeEventListener('blur', onBlur);
					});
				}
				return () => cleanups.forEach((c) => c());
			},
			[],
			GESTURE,
		);

		// `whileInView`: animate when the element enters the viewport, and back out
		// when it leaves (unless `viewport.once`). Reuses motion's `inView`.
		useLayoutEffect(
			() => {
				if (!props.whileInView) return;
				const stop = inView(
					node,
					() => {
						animate(node, latest.whileInView, latest.whileInViewTransition ?? latest.transition);
						return () => {
							if (!props.viewport?.once) animate(node, latest.base, latest.transition);
						};
					},
					props.viewport,
				);
				return () => stop();
			},
			[],
			INVIEW,
		);

		// `drag`: pointer-drag the element, updating its transform. Supports axis lock
		// (`drag="x"`/`"y"`) and `dragConstraints` (a box of left/right/top/bottom px).
		useLayoutEffect(
			() => {
				if (!props.drag) return;
				let active = false;
				let startX = 0;
				let startY = 0;
				let originX = 0;
				let originY = 0;
				latest.dragX ??= 0;
				latest.dragY ??= 0;
				const onDown = (e: any) => {
					active = true;
					startX = e.clientX;
					startY = e.clientY;
					originX = latest.dragX;
					originY = latest.dragY;
					latest.onDragStart?.(e, { point: { x: e.clientX, y: e.clientY } });
				};
				const onMove = (e: any) => {
					if (!active) return;
					let x = latest.drag === 'y' ? originX : originX + (e.clientX - startX);
					let y = latest.drag === 'x' ? originY : originY + (e.clientY - startY);
					const c = latest.dragConstraints;
					if (c) {
						x = clamp(x, c.left ?? -Infinity, c.right ?? Infinity);
						y = clamp(y, c.top ?? -Infinity, c.bottom ?? Infinity);
					}
					latest.dragX = x;
					latest.dragY = y;
					node.style.transform = `translateX(${x}px) translateY(${y}px)`;
					latest.onDrag?.(e, {
						offset: { x: x - originX, y: y - originY },
						point: { x: e.clientX, y: e.clientY },
					});
				};
				const onUp = (e: any) => {
					if (!active) return;
					active = false;
					latest.onDragEnd?.(e, { point: { x: e.clientX, y: e.clientY } });
				};
				node.addEventListener('pointerdown', onDown);
				window.addEventListener('pointermove', onMove);
				window.addEventListener('pointerup', onUp);
				return () => {
					node.removeEventListener('pointerdown', onDown);
					window.removeEventListener('pointermove', onMove);
					window.removeEventListener('pointerup', onUp);
				};
			},
			[],
			DRAG,
		);

		// `layout`: animate layout changes with FLIP. Each commit, measure the box
		// (transform reset so it's the LAYOUT box, not the transformed one); if it
		// moved/resized vs the previous commit, apply the inverse transform instantly
		// then animate it back to identity. (A single-element FLIP; the full projection
		// tree — nested/shared layout, scale correction — is out of scope.)
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
					animate(node, { transform: 'translate(0px, 0px) scale(1, 1)' }, transition);
				} else {
					node.style.transform = prevTransform;
				}
			},
			undefined,
			LAYOUT,
		);

		// `layoutId`: shared-element crossfade. On mount, if a same-id element recently
		// unmounted, FLIP from its recorded box to ours; on unmount, record our box for
		// the next same-id element (the cleanup runs while still in the DOM).
		useLayoutEffect(
			() => {
				const id = props.layoutId;
				if (!id) return;
				const prev = layoutCells.get(id);
				if (prev) {
					layoutCells.delete(id);
					node.style.transform = '';
					const box = boxOf(node);
					const dx = prev.left - box.left;
					const dy = prev.top - box.top;
					const sx = box.width ? prev.width / box.width : 1;
					const sy = box.height ? prev.height / box.height : 1;
					if (dx || dy || sx !== 1 || sy !== 1) {
						node.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
						animate(node, { transform: 'translate(0px, 0px) scale(1, 1)' }, latest.transition);
					}
				}
				return () => {
					if (node.isConnected) layoutCells.set(id, boxOf(node));
				};
			},
			[],
			LAYOUT_ID,
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
				const rect = n.getBoundingClientRect();
				clone.style.position = 'absolute';
				clone.style.top = `${n.offsetTop}px`;
				clone.style.left = `${n.offsetLeft}px`;
				clone.style.width = `${rect.width}px`;
				clone.style.height = `${rect.height}px`;
				parent.appendChild(clone);
				const controls = animate(clone, exit, latest.exitTransition ?? latest.transition);
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
export function AnimatePresence(props: any, scope: any): void {
	if (typeof props.children === 'function') props.children(undefined, scope);
}

// MotionConfig — provides global defaults (transition, reduced motion) to every
// motion element below it. A plain-TS component: stamps the config context, then
// renders children.
export function MotionConfig(props: any, scope: any): void {
	provideContext(scope, MotionConfigContext, {
		transition: props.transition,
		reducedMotion: props.reducedMotion,
	});
	if (typeof props.children === 'function') props.children(undefined, scope);
}

export { useAnimate } from './useAnimate';
export { useMotionValue } from './useMotionValue';
export { useScroll } from './useScroll';
export { useTransform } from './useTransform';
export { useSpring } from './useSpring';
export { useMotionValueEvent } from './useMotionValueEvent';
export { MotionConfigContext, VariantContext, StaggerContext } from './context';

// Re-export motion's framework-agnostic helpers (animate, stagger, value types, …).
export * from 'motion';
