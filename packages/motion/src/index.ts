// @octanejs/motion — Framer Motion for the octane renderer.
//
// Reuses motion's framework-agnostic animation engine (`animate`), gesture
// primitives (`hover`, `press`, `inView`), MotionValues, and scoped animation, and
// reimplements the `motion.*` components on octane. Each `motion.tag` renders a real
// host `<tag>` (via octane's `hostComponent` primitive), captures its node, and
// drives animation/gesture/layout/drag from layout effects — exactly the refs +
// effects + rendering path this is meant to exercise.
import { animate, hover, press, inView } from 'motion';
import {
	childSlot,
	hostComponent,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	provideContext,
} from 'octane';
import {
	LayoutGroupContext,
	LazyMotionContext,
	MotionConfigContext,
	VariantContext,
	StaggerContext,
	type MotionFeatureBundle,
	resolveVariant,
	splitVariant,
} from './context';
import { isMotionValue, isTransformKey, applyStyleValue } from './useMotionValue';
import { useReducedMotionAtSlot } from './useReducedMotion';
import {
	layoutAnimationMode,
	layoutCellKey,
	layoutTransition,
	projectLayout,
	recordLayoutCell,
	takeLayoutCell,
	type LayoutBox,
} from './layout';

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
const CONFIG_REDUCED = Symbol.for('octane-motion:config-reduced');
const LAYOUT_GROUP_STATE = Symbol.for('octane-motion:layout-group-state');
const LAZY_STATE = Symbol.for('octane-motion:lazy-state');
const LAZY_EFFECT = Symbol.for('octane-motion:lazy-effect');

const boxOf = (n: HTMLElement): LayoutBox => {
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

const POSITIONAL_KEYS = new Set([
	'width',
	'height',
	'top',
	'left',
	'right',
	'bottom',
	'transform',
	'transformPerspective',
	'x',
	'y',
	'z',
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
	'skew',
	'skewX',
	'skewY',
]);

function reducedTransition(values: any, transition: any, shouldReduceMotion: boolean): any {
	if (!shouldReduceMotion || values == null || typeof values !== 'object') return transition;

	let reduced: Record<string, any> | null = null;
	for (const key in values) {
		if (!POSITIONAL_KEYS.has(key)) continue;
		const next = (reduced ??= { ...(transition || {}) });
		const valueTransition =
			transition?.[key] != null && typeof transition[key] === 'object' ? transition[key] : {};
		next[key] = { ...valueTransition, type: false, delay: 0, duration: 0 };
	}
	return reduced ?? transition;
}

function animateTarget(
	node: HTMLElement,
	values: any,
	transition: any,
	shouldReduceMotion: boolean,
): any {
	return animate(node, values, reducedTransition(values, transition, shouldReduceMotion));
}

export type MotionComponent = (props: any, scope: any) => void;

function createMotionComponent(tag: string, preloadedFeatures: boolean): MotionComponent {
	return function MotionComponent(props: any, scope: any): void {
		const config = useContext(MotionConfigContext);
		const layoutGroup = useContext(LayoutGroupContext);
		const lazy = useContext(LazyMotionContext);
		const inherited = useContext(VariantContext);
		// Read the PARENT's stagger orchestration before providing our own below.
		const parentStagger = useContext(StaggerContext);
		const variants = props.variants;
		const features = preloadedFeatures ? domMax : lazy.features;
		const animationEnabled = preloadedFeatures || features?.animation === true;
		const gesturesEnabled = preloadedFeatures || features?.gestures === true;
		const dragEnabled = preloadedFeatures || features?.drag === true;
		const layoutEnabled = preloadedFeatures || features?.layout === true;
		const shouldReduceMotion = config.shouldReduceMotion === true;
		const layoutIdKey =
			props.layoutId === undefined
				? undefined
				: layoutCellKey(
						layoutGroup.layoutIdNamespace ?? (layoutGroup.id ? [layoutGroup.id] : undefined),
						props.layoutId,
					);

		// Reason: browser bundlers replace this expression even though they do not
		// define a global `process`; guarding `process` would silently disable strict mode.
		if (
			process.env.NODE_ENV !== 'production' &&
			preloadedFeatures &&
			lazy.provided &&
			lazy.strict
		) {
			throw new Error(
				'You have rendered a `motion` component within a strict `LazyMotion` component. Import and render from `@octanejs/motion/react-m` instead.',
			);
		}

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
		latest.shouldReduceMotion = shouldReduceMotion;
		latest.animationEnabled = animationEnabled;
		latest.layoutEnabled = layoutEnabled;
		latest.layoutIdKey = layoutIdKey;
		latest.layoutMode = layoutAnimationMode(props.layout);

		// `initial`: apply instantly on mount (before the animate effect runs).
		useLayoutEffect(
			() => {
				if (animationEnabled && resolvedInitial) {
					animate(node, resolvedInitial, { duration: 0 });
				}
			},
			[],
			ENTER,
		);

		// `animate`: animate to the (resolved) target on mount and whenever it changes.
		// If we're a stagger child, fold in our per-child delay (our index + the sibling
		// count are both known by now — all children registered during the parent render).
		useLayoutEffect(
			() => {
				if (animationEnabled && resolvedAnimate) {
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
					const controls = animateTarget(node, resolvedAnimate, t, latest.shouldReduceMotion);
					if (props.onAnimationComplete) whenDone(controls, () => props.onAnimationComplete());
					return () => controls.stop();
				}
			},
			[animationEnabled, stableKey(resolvedAnimate), stableKey(transition), shouldReduceMotion],
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
				if (!gesturesEnabled) return;
				const cleanups: Array<() => void> = [];
				const gesture = (
					bind: (el: Element, onStart: () => () => void) => () => void,
					valuesKey: string,
					transitionKey: string,
				) =>
					bind(node, () => {
						animateTarget(
							node,
							latest[valuesKey],
							latest[transitionKey] ?? latest.transition,
							latest.shouldReduceMotion,
						);
						return () => {
							animateTarget(node, latest.base, latest.transition, latest.shouldReduceMotion);
						};
					});
				if (props.whileHover)
					cleanups.push(gesture(hover as any, 'whileHover', 'whileHoverTransition'));
				if (props.whileTap) cleanups.push(gesture(press as any, 'whileTap', 'whileTapTransition'));
				if (props.whileFocus) {
					const onFocus = () =>
						animateTarget(
							node,
							latest.whileFocus,
							latest.whileFocusTransition ?? latest.transition,
							latest.shouldReduceMotion,
						);
					const onBlur = () =>
						animateTarget(node, latest.base, latest.transition, latest.shouldReduceMotion);
					node.addEventListener('focus', onFocus);
					node.addEventListener('blur', onBlur);
					cleanups.push(() => {
						node.removeEventListener('focus', onFocus);
						node.removeEventListener('blur', onBlur);
					});
				}
				return () => cleanups.forEach((c) => c());
			},
			[gesturesEnabled],
			GESTURE,
		);

		// `whileInView`: animate when the element enters the viewport, and back out
		// when it leaves (unless `viewport.once`). Reuses motion's `inView`.
		useLayoutEffect(
			() => {
				if (!gesturesEnabled || !props.whileInView) return;
				const stop = inView(
					node,
					() => {
						animateTarget(
							node,
							latest.whileInView,
							latest.whileInViewTransition ?? latest.transition,
							latest.shouldReduceMotion,
						);
						return () => {
							if (!props.viewport?.once) {
								animateTarget(node, latest.base, latest.transition, latest.shouldReduceMotion);
							}
						};
					},
					props.viewport,
				);
				return () => stop();
			},
			[gesturesEnabled],
			INVIEW,
		);

		// `drag`: pointer-drag the element, updating its transform. Supports axis lock
		// (`drag="x"`/`"y"`) and `dragConstraints` (a box of left/right/top/bottom px).
		useLayoutEffect(
			() => {
				if (!dragEnabled || !props.drag) return;
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
			[dragEnabled],
			DRAG,
		);

		// `layout`: animate layout changes with FLIP. Each commit, measure the box
		// (transform reset so it's the LAYOUT box, not the transformed one); if it
		// moved/resized vs the previous commit, apply the inverse transform instantly
		// then animate it back to identity. (A single-element FLIP; the full projection
		// tree — nested/shared layout, scale correction — is out of scope.)
		useLayoutEffect(
			() => {
				if (!layoutEnabled || !props.layout) {
					latest.layoutBox = undefined;
					return;
				}
				const prevTransform = node.style.transform;
				node.style.transform = '';
				const r = node.getBoundingClientRect();
				const box = { left: r.left, top: r.top, width: r.width, height: r.height };
				const prev = latest.layoutBox;
				latest.layoutBox = box;
				if (!prev) {
					node.style.transform = prevTransform;
					return;
				}
				const projection = projectLayout(prev, box, latest.layoutMode);
				if (projection) {
					if (latest.shouldReduceMotion) {
						node.style.transform = prevTransform;
					} else {
						node.style.transform = projection.from;
						animate(node, { transform: projection.to }, layoutTransition(latest.transition));
					}
				} else {
					node.style.transform = prevTransform;
				}
			},
			undefined,
			LAYOUT,
		);

		// `layoutId`: shared-element crossfade. On mount, if a same-id element recently
		// unmounted, FLIP from its recorded box to ours.
		useLayoutEffect(
			() => {
				if (!layoutEnabled) return;
				const id = layoutIdKey;
				if (!id) return;
				const prev = takeLayoutCell(id);
				if (prev) {
					if (!latest.shouldReduceMotion) {
						const prevTransform = node.style.transform;
						node.style.transform = '';
						const box = boxOf(node);
						const projection = projectLayout(prev, box, latest.layoutMode);
						if (projection) {
							node.style.transform = projection.from;
							animate(node, { transform: projection.to }, layoutTransition(latest.transition));
						} else {
							node.style.transform = prevTransform;
						}
					}
				}
			},
			[layoutEnabled, layoutIdKey],
			LAYOUT_ID,
		);

		// Unmount: this cleanup runs while the node is still in the DOM. Record shared
		// layout state here—not in the keyed claim effect, whose cleanup also runs on
		// dependency changes—then clone any exiting node outside the block's range.
		useLayoutEffect(
			() => () => {
				const n: HTMLElement | null = latest.node;
				const layoutId = latest.layoutIdKey;
				if (latest.layoutEnabled && layoutId && n?.isConnected) {
					recordLayoutCell(layoutId, boxOf(n));
				}
				if (!latest.animationEnabled) return;
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
				const controls = animateTarget(
					clone,
					exit,
					latest.exitTransition ?? latest.transition,
					latest.shouldReduceMotion,
				);
				whenDone(controls, () => clone.remove());
			},
			[],
			EXIT,
		);
	};
}

export const domAnimation: MotionFeatureBundle = Object.freeze({
	animation: true,
	gestures: true,
	drag: false,
	layout: false,
});

export const domMax: MotionFeatureBundle = Object.freeze({
	animation: true,
	gestures: true,
	drag: true,
	layout: true,
});

export type MotionProxy = Record<string, MotionComponent>;

function motionProxy(preloadedFeatures: boolean): MotionProxy {
	return new Proxy(
		{},
		{
			get(cache: Record<string, MotionComponent>, tag: string | symbol) {
				if (typeof tag !== 'string') return undefined;
				return cache[tag] ?? (cache[tag] = createMotionComponent(tag, preloadedFeatures));
			},
		},
	);
}

// `motion.div`, `motion.span`, … — a proxy that lazily builds (and caches) a
// component per tag.
export const motion = motionProxy(true);

// `m` renders the same hosts but activates animation/gesture/layout behavior
// only from its nearest LazyMotion feature bundle.
export const m = motionProxy(false);

// AnimatePresence — renders its children; each `motion.*` with an `exit` prop
// self-animates its own removal (see the exit cleanup above), so this is a thin
// passthrough that exists for drop-in compatibility with Framer Motion's API.
export function AnimatePresence(props: any, scope: any): void {
	renderTransparentChildren(props.children, scope);
}

export interface LayoutGroupProps {
	children?: unknown;
	id?: string;
	inherit?: boolean | 'id';
}

export function LayoutGroup(props: LayoutGroupProps, scope: any): void {
	const parent = useContext(LayoutGroupContext);
	const value = useMemo(
		() => {
			const inherit = props.inherit ?? true;
			const inheritId = inherit === true || inherit === 'id';
			const id =
				inheritId && parent.id ? (props.id ? `${parent.id}-${props.id}` : parent.id) : props.id;
			const parentNamespace = parent.layoutIdNamespace ?? (parent.id ? [parent.id] : undefined);
			const layoutIdNamespace =
				inheritId && parent.id
					? props.id
						? [...(parentNamespace ?? [parent.id]), props.id]
						: parentNamespace
					: props.id
						? [props.id]
						: undefined;
			return { id, layoutIdNamespace };
		},
		[parent.id, parent.layoutIdNamespace, props.id, props.inherit],
		LAYOUT_GROUP_STATE,
	);
	provideContext(scope, LayoutGroupContext, value);
	renderTransparentChildren(props.children, scope);
}

// MotionConfig — provides global defaults (transition, reduced motion) to every
// motion element below it. A plain-TS component: stamps the config context, then
// renders children.
export function MotionConfig(props: any, scope: any): void {
	const parent = useContext(MotionConfigContext);
	const reducedMotion = props.reducedMotion ?? parent.reducedMotion ?? 'never';
	// Octane slots hooks by call site, so this subscription can stay conditional.
	// Avoid paying for matchMedia listeners when the policy never consults it.
	const userPreference = reducedMotion === 'user' ? useReducedMotionAtSlot(CONFIG_REDUCED) : false;
	provideContext(scope, MotionConfigContext, {
		transition: props.transition ?? parent.transition,
		reducedMotion,
		shouldReduceMotion: reducedMotion === 'always' || (reducedMotion === 'user' && userPreference),
	});
	renderTransparentChildren(props.children, scope);
}

export type LazyMotionFeatures =
	| MotionFeatureBundle
	| (() =>
			| Promise<MotionFeatureBundle | { default: MotionFeatureBundle }>
			| MotionFeatureBundle
			| { default: MotionFeatureBundle });

export interface LazyMotionProps {
	children?: unknown;
	features: LazyMotionFeatures;
	strict?: boolean;
}

interface LoadedLazyFeatures {
	features: MotionFeatureBundle | null;
	error?: { value: unknown };
}

function normalizeFeatures(
	value: MotionFeatureBundle | { default: MotionFeatureBundle },
): MotionFeatureBundle {
	return 'default' in value ? value.default : value;
}

export function LazyMotion(props: LazyMotionProps, scope: any): void {
	const [loaded, setLoaded] = useState<LoadedLazyFeatures>(() => ({ features: null }), LAZY_STATE);
	const source = props.features;
	const isLoader = typeof source === 'function';
	const features = isLoader ? loaded.features : normalizeFeatures(source);
	if (isLoader && loaded.error) throw loaded.error.value;

	// Match Motion's mount-time loader semantics. In particular, an idiomatic
	// inline `features={() => import(...)}` must survive parent re-renders.
	useEffect(
		() => {
			if (typeof source !== 'function') return;
			let current = true;
			const fail = (error: unknown) => {
				if (current) setLoaded({ features: null, error: { value: error } });
			};
			try {
				void Promise.resolve(source()).then((value) => {
					if (!current) return;
					let features: MotionFeatureBundle;
					try {
						features = normalizeFeatures(value);
					} catch (error) {
						fail(error);
						return;
					}
					setLoaded({ features });
				}, fail);
			} catch (error) {
				fail(error);
			}
			return () => {
				current = false;
			};
		},
		[],
		LAZY_EFFECT,
	);

	provideContext(scope, LazyMotionContext, {
		features,
		strict: props.strict === true,
		provided: true,
	});
	renderTransparentChildren(props.children, scope);
}

function renderTransparentChildren(children: unknown, scope: any): void {
	childSlot(scope, 0, scope.block.parentNode, children, scope.block.endMarker);
}

export { useAnimate } from './useAnimate';
export { useMotionValue } from './useMotionValue';
export { useScroll } from './useScroll';
export { useTransform } from './useTransform';
export { useSpring } from './useSpring';
export { useMotionValueEvent } from './useMotionValueEvent';
export { useReducedMotion } from './useReducedMotion';
export {
	LayoutGroupContext,
	LazyMotionContext,
	MotionConfigContext,
	VariantContext,
	StaggerContext,
} from './context';

// Re-export motion's framework-agnostic helpers (animate, stagger, value types, …).
export * from 'motion';
export type { TargetAndTransition, Transition } from 'motion';
