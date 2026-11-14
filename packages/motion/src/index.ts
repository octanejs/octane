// @octanejs/motion — Framer Motion for the octane renderer.
//
// Reuses motion's framework-agnostic animation engine (`animate`), gesture
// primitives (`hover`, `press`, `inView`), MotionValues, and scoped animation, and
// reimplements the `motion.*` components on octane. Each `motion.tag` renders a real
// host descriptor, captures its committed node by ref, and
// drives animation/gesture/layout/drag from layout effects — exactly the refs +
// effects + rendering path this is meant to exercise.
import { animate, hover, press, inView } from 'motion';
import {
	buildHTMLStyles,
	buildSVGAttrs,
	camelCaseAttributes,
	camelToDash,
	cancelFrame,
	frame as motionFrame,
	getValueAsType,
	isSVGElement,
	isSVGTag,
	isVariantLabel,
	numberValueTypes,
	resolveMotionValue,
	scrapeHTMLMotionValuesFromProps,
	scrapeSVGMotionValuesFromProps,
	SVGVisualElement,
	visualElementStore,
	type MotionValue,
} from 'motion-dom';
import {
	createElement,
	useContext,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useState,
	type OctaneElement,
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
import {
	isMotionValue,
	isTransformKey,
	applyStyleValue,
	removeTransformFn,
} from './useMotionValue';
import { useReducedMotionAtSlot } from './useReducedMotion';
import {
	layoutAnimationMode,
	layoutCellKey,
	recordLayoutCell,
	takeLayoutCell,
	type LayoutBox,
} from './layout';
import { LayoutAnimation } from './layout-animation';

// A plain-TS component gets its OWN block per instance (componentSlot), so fixed
// slot symbols don't collide across instances — and these are distinct within one.
const REFS = Symbol.for('octane-motion:refs');
const FRAME = Symbol.for('octane-motion:frame');
const HOST_REF = Symbol.for('octane-motion:hostRef');
const ENTER = Symbol.for('octane-motion:enter');
const ANIMATE = Symbol.for('octane-motion:animate');
const GESTURE = Symbol.for('octane-motion:gesture');
const EXIT = Symbol.for('octane-motion:exit');
const LAYOUT = Symbol.for('octane-motion:layout');
const DRAG = Symbol.for('octane-motion:drag');
const DRAG_LISTENER = Symbol.for('octane-motion:drag-listener');
const INVIEW = Symbol.for('octane-motion:inview');
const MV = Symbol.for('octane-motion:motionvalues');
const SVG_MV = Symbol.for('octane-motion:svg-motionvalues');
const LAYOUT_ID = Symbol.for('octane-motion:layoutid');
const LAYOUT_CLEANUP = Symbol.for('octane-motion:layout-cleanup');
const STAGGER_ORCH = Symbol.for('octane-motion:stagger-orch');
const STAGGER = Symbol.for('octane-motion:stagger');
const CONFIG_REDUCED = Symbol.for('octane-motion:config-reduced');
const LAYOUT_GROUP_STATE = Symbol.for('octane-motion:layout-group-state');
const LAZY_STATE = Symbol.for('octane-motion:lazy-state');
const LAZY_EFFECT = Symbol.for('octane-motion:lazy-effect');

// Tracks MotionValue / transform shorthand keys last applied to a host so a
// rebind can clear stale inline styles without wiping them on unmount (exit
// clones still need the live visual state).
const motionStyleKeys = new WeakMap<HTMLElement, string[]>();
const boxOf = (n: HTMLElement): LayoutBox => {
	const r = n.getBoundingClientRect();
	return { left: r.left, top: r.top, width: r.width, height: r.height };
};

// Props consumed by motion (everything else is spread onto the host element).
const MOTION_PROPS = new Set([
	'initial',
	'animate',
	'transition',
	'transformTemplate',
	'custom',
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
	'dragControls',
	'dragListener',
	'dragElastic',
	'dragMomentum',
	'onDrag',
	'onDragStart',
	'onDragEnd',
	'onAnimationComplete',
	'children',
]);

// Pinned Motion distinguishes these lowercase SVG tags and mixed-case SVG names
// from HTML and dashed custom elements (render/dom/utils/is-svg-component).
const svgHost =
	/^(?:animate|circle|defs|desc|ellipse|g|image|line|filter|marker|mask|metadata|path|pattern|polygon|polyline|rect|stop|switch|symbol|svg|text|tspan|use|view)$/;

// Drop a projected field permanently after an authored value takes over. Ordinary
// refreshes reuse the existing frame and the copy is installed only after commit.
function retained(values: Record<string, any>, original: Record<string, any>, current: any) {
	let next = values;
	for (const key in values) {
		if (Object.is(original[key], current?.[key])) continue;
		if (next === values) next = { ...values };
		delete next[key];
	}
	return next;
}

interface SVGAttributeValue {
	key: string;
	attribute: string;
	value: MotionValue<unknown>;
	sample: unknown;
}

function svgAttributeValue(key: string, sample: unknown): unknown {
	return key === 'x' || key === 'y' || key === 'scale'
		? sample
		: getValueAsType(sample, numberValueTypes[key]);
}

function bindSVGAttributes(node: SVGElement, attributes: SVGAttributeValue[]): () => void {
	let active = true;
	const cleanups = attributes.map(({ key, attribute, value, sample }) => {
		function write() {
			if (!active) return;
			const visual = visualElementStore.get(node);
			if (visual instanceof SVGVisualElement) {
				// An imperative Motion animation can keep rendering attributes after its
				// target changes. Observe its projected keys after the render step.
				for (const key in visual.renderState.attrs) {
					if (attribute === motionAttributeName(key)) return;
				}
			}
			const next = svgAttributeValue(key, value.get());
			// The direct lane handles scalar samples. This also keeps object
			// coercion from reentering commit during an asynchronous attribute write.
			if (!active) return;
			if (
				typeof next === 'string' ||
				typeof next === 'number' ||
				typeof next === 'bigint' ||
				(typeof next === 'boolean' && /^(?:aria|data)-/.test(attribute))
			)
				node.setAttribute(attribute, String(next));
			else node.removeAttribute(attribute);
		}
		const onChange = () => {
			if (active) motionFrame.postRender(write, false, true);
		};
		const unsubscribe = value.on('change', onChange);
		if (!Object.is(value.get(), sample)) onChange();
		return () => {
			unsubscribe();
			cancelFrame(write);
		};
	});
	return () => {
		active = false;
		for (const cleanup of cleanups) cleanup();
	};
}

const svgScalarAttribute =
	/^(?:[xy][12]?|d[xy]?|r[xy]?|c[xy]|f[rxy]|width|height|points|offset|scale|fill|fill-opacity|fill-rule|stroke|stroke-(?:width|opacity|dasharray|dashoffset|linecap|linejoin|miterlimit)|opacity|color|stop-color|stop-opacity|(?:data|aria)-[a-z][a-z0-9-]*)$/;

function motionAttributeName(key: string) {
	return camelCaseAttributes.has(key) ? key : camelToDash(key);
}

// Only attributes whose current sample projects directly to one host field.
function isMotionSVGAttribute(attribute: string, root: boolean): boolean {
	return root ? attribute === 'viewBox' : svgScalarAttribute.test(attribute);
}

function readDomProps(
	props: any,
	svg: boolean,
	svgRoot: boolean,
	out: Record<string, any>,
	latest: any,
) {
	const frame: ReturnType<typeof firstFrame> = latest.frame;
	const originalAttrs = frame?.attrs;
	const motionAttrs = frame?.motionAttrs;
	let attrs = originalAttrs;
	let subscriptions: SVGAttributeValue[] | undefined;
	for (const key in props) {
		if (!MOTION_PROPS.has(key)) {
			const value = props[key];
			const motion = svg && isMotionValue(value);
			out[key] = motion ? resolveMotionValue(value) : value;
			if (motion || subscriptions?.length) {
				const attribute = motionAttributeName(key);
				if (subscriptions) {
					for (let i = 0; i < subscriptions.length; i++) {
						if (subscriptions[i].attribute !== attribute) continue;
						subscriptions.splice(i, 1);
						break;
					}
				}
				if (motion && isMotionSVGAttribute(attribute, svgRoot))
					(subscriptions ??= []).push({ key, attribute, value, sample: out[key] });
			}
			// An authored static value takes over even if it equals the MotionValue's sample.
			if (!motion && value != null && motionAttrs?.has(key) && attrs && Object.hasOwn(attrs, key)) {
				if (attrs === originalAttrs) attrs = { ...attrs };
				delete attrs[key];
			}
		}
	}
	const raw = props.style;
	if (raw && typeof raw === 'object') {
		const style: Record<string, any> = {};
		for (const key in raw) {
			const value = raw[key];
			if (!isMotionValue(value) && !isTransformKey(key)) style[key] = value;
		}
		out.style = style;
	}
	if (frame && attrs) {
		attrs = retained(attrs, frame.originalAttrs, out);
		const style = retained(frame.style, frame.originalStyle, props.style);
		Object.assign(out, attrs);
		out.style = Object.assign(out.style ?? {}, style);
		if (attrs !== frame.attrs || style !== frame.style) {
			useLayoutEffect(
				() => {
					latest.frame = { ...frame, attrs, style };
				},
				[attrs, style],
				FRAME,
			);
		}
	}
	return subscriptions;
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

// Retain target values from the first render. Later target changes animate from
// the committed host, while ordinary style props continue to update independently.
function firstFrame(tag: string, svg: boolean, props: any, target: any, atEnd: boolean) {
	const raw = props.style;
	if (!svg && !raw && !target && !props.transformTemplate) return;
	const scraped = svg
		? scrapeSVGMotionValuesFromProps(props, {})
		: scrapeHTMLMotionValuesFromProps(props, {});
	let values: Record<string, any> | undefined;
	for (const key in scraped) {
		const value = resolveMotionValue(scraped[key]);
		if (value != null) (values ??= {})[key] = value;
	}
	if (target && typeof target === 'object') {
		values ??= {};
		for (const variant of Array.isArray(target) ? target : [target]) {
			if (!variant) continue;
			for (const key in variant) {
				if (key === 'transition' || key === 'transitionEnd') continue;
				const keyframes = variant[key];
				const value = Array.isArray(keyframes)
					? keyframes[atEnd ? keyframes.length - 1 : 0]
					: keyframes;
				if (value != null) values[key] = value;
			}
			Object.assign(values, variant.transitionEnd);
		}
	}
	if (!values && !props.transformTemplate) return;
	values ??= {};
	const state = {
		style: {} as Record<string, any>,
		vars: {},
		transform: {},
		transformOrigin: {},
		attrs: {} as Record<string, any>,
	};
	if (svg) buildSVGAttrs(state, values, tag === 'svg', props.transformTemplate, raw);
	else buildHTMLStyles(state, values, props.transformTemplate);
	const style = Object.assign(state.style, state.vars);
	const originalStyle: Record<string, any> = {};
	for (const key in style) originalStyle[key] = raw?.[key];
	const originalAttrs: Record<string, any> = {};
	let motionAttrs: Set<string> | undefined;
	for (const key in state.attrs) {
		const source = props[key];
		originalAttrs[key] = resolveMotionValue(source);
		if (isMotionValue(source)) (motionAttrs ??= new Set()).add(key);
	}
	return { style, attrs: state.attrs, originalAttrs, motionAttrs, originalStyle };
}

export type MotionComponent = (props: any, scope: any) => OctaneElement;

function createMotionComponent(tag: string, preloadedFeatures: boolean): MotionComponent {
	const svg = !tag.includes('-') && (svgHost.test(tag) || /[A-Z]/.test(tag));
	const svgRoot = svg && isSVGTag(tag);
	return function MotionComponent(props: any) {
		const config = useContext(MotionConfigContext);
		const layoutGroup = useContext(LayoutGroupContext);
		const lazy = useContext(LazyMotionContext);
		const inherited = useContext(VariantContext);
		// Read the PARENT's stagger orchestration before providing our own below.
		const parentStagger = useContext(StaggerContext);
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
		const inheritsAnimate = props.animate === undefined && isVariantLabel(inherited.animate);
		const initial = resolveVariant(initialLabel, props);
		const animateTargets = resolveVariant(animateLabel, props);
		const { values: resolvedInitial } = splitVariant(initial);
		const { values: resolvedAnimate, transition: animateVariantTransition } =
			splitVariant(animateTargets);
		const transition = animateVariantTransition ?? props.transition ?? config.transition;

		// Stable holder (also our stagger token) — created before we register/provide.
		const [latest] = useState(
			() =>
				({
					host: { current: null as HTMLElement | null },
					initialAnimationKey: initialLabel === false ? true : null,
					frame: firstFrame(
						tag,
						svg,
						props,
						resolvedAnimate && (initialLabel === false ? animateTargets : initial),
						initialLabel === false,
					),
					layout: null,
					layoutActive: false,
					dragListener: undefined,
					svgAttrs: undefined,
				}) as any,
			REFS,
		);
		const ref =
			props.ref == null
				? latest.host
				: useMemo(() => [latest.host, props.ref], [props.ref], HOST_REF);

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

		// Resolve a gesture/exit target to its values + its own (per-variant) transition,
		// so a variant target carrying a `transition` key honors it (like `animate` does).
		const rsv = (v: any) => splitVariant(resolveVariant(v, props));
		const exitS = rsv(props.exit);
		const hoverS = rsv(props.whileHover);
		const tapS = rsv(props.whileTap);
		const focusS = rsv(props.whileFocus);
		const inViewS = rsv(props.whileInView);

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
		// OCTANE DIVERGENCE[motion-initial-only-no-style-materialization][conformance:initial-only-no-style-materialization]
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
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
		const animationKey = stableKey(resolvedAnimate);
		// The first-frame style is captured during render, including hidden Activity
		// mounts whose first layout effect may see a different target.
		if (latest.initialAnimationKey === true) latest.initialAnimationKey = animationKey;
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
				if (!animationEnabled) return;
				// OCTANE DIVERGENCE[motion-lazy-initial-false-first-frame][conformance:lazy-initial-false-first-frame]
				if (latest.initialAnimationKey !== null) {
					const skip = latest.initialAnimationKey === animationKey;
					latest.initialAnimationKey = null;
					if (skip) return;
				}
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
					const controls = animateTarget(node, resolvedAnimate, t, latest.shouldReduceMotion);
					if (props.onAnimationComplete) whenDone(controls, () => props.onAnimationComplete());
					return () => controls.stop();
				}
			},
			[animationEnabled, animationKey, stableKey(transition), shouldReduceMotion],
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
		// Re-bind when the style bag's MotionValue identities or shorthand values change
		// so callers can swap `style={{ x }}` across updates (upstream useMotionValue).
		const styleMvDeps: any[] = [];
		if (props.style && typeof props.style === 'object') {
			for (const key in props.style) {
				const v = props.style[key];
				if (isMotionValue(v) || isTransformKey(key)) styleMvDeps.push(key, v);
			}
		}
		// The style inventory can grow or shrink; a hook dependency tuple cannot.
		// Retain an equal inventory so ordinary renders do not churn subscriptions.
		const previousStyleMvDeps: any[] | undefined = latest.styleMvDeps;
		let sameMotionStyles = previousStyleMvDeps?.length === styleMvDeps.length;
		if (sameMotionStyles) {
			for (let i = 0; i < styleMvDeps.length; i++) {
				if (!Object.is(previousStyleMvDeps![i], styleMvDeps[i])) {
					sameMotionStyles = false;
					break;
				}
			}
		}
		if (!sameMotionStyles) latest.styleMvDeps = styleMvDeps;
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
				// Clear only keys this effect previously managed that are absent from the
				// new style bag. Patch transform functions in place so animate/layout/drag
				// values on `style.transform` survive a MotionValue rebind.
				// Do not clear in cleanup: on unmount the exit effect clones this node
				// after layout-effect cleanups, and still needs the live transforms.
				const style = props.style;
				const prevKeys = motionStyleKeys.get(node);
				if (prevKeys) {
					for (const key of prevKeys) {
						const next = style && typeof style === 'object' ? style[key] : undefined;
						const stillManaged = next !== undefined && (isMotionValue(next) || isTransformKey(key));
						if (stillManaged) continue;
						// Plain static values stay in the style bag for host/domProps — do not blank
						// them after a MotionValue→static switch (domProps already applied them).
						if (next !== undefined) continue;
						if (key === 'transform' || isTransformKey(key)) latest.layout?.stop();
						if (isTransformKey(key)) removeTransformFn(node, key);
						else (node.style as any)[key] = '';
					}
					motionStyleKeys.delete(node);
				}

				if (!style || typeof style !== 'object') return;
				const appliedKeys: string[] = [];
				const cleanups: Array<() => void> = [];
				// Shared bag of currently bound transform shorthands so a compound
				// FLIP patch can keep sibling axes owned by other style MotionValues.
				const transformState: Record<string, any> = {};
				for (const key in style) {
					const v = style[key];
					if (isMotionValue(v)) {
						function apply(val: any) {
							// Author writes take ownership after removing the temporary projection.
							if (key === 'transform' || isTransformKey(key)) latest.layout?.stop();
							applyStyleValue(node, key, val, transformState);
						}
						apply(v.get());
						appliedKeys.push(key);
						cleanups.push(v.on('change', apply));
					} else if (isTransformKey(key)) {
						latest.layout?.stop();
						applyStyleValue(node, key, v, transformState);
						appliedKeys.push(key);
					}
				}
				if (appliedKeys.length) motionStyleKeys.set(node, appliedKeys);
				return function unsubscribeMotionStyles() {
					for (const cleanup of cleanups) cleanup();
				};
			},
			[latest.styleMvDeps],
			MV,
		);

		// Gestures: `whileHover` / `whileTap` / `whileFocus` animate to the gesture
		// target on start and back to the resting state on end. Targets/transition are
		// read from `latest`, so prop changes take effect without re-binding.
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
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
				const node: HTMLElement = latest.host.current;
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

		// Publish the listener setting only when this render commits. A live host
		// can receive a pointer event while a descendant's render is still pending.
		if ((dragEnabled && props.drag) || latest.dragListener !== undefined) {
			const { dragListener = true } = props;
			const listen = Boolean(dragListener);
			useInsertionEffect(
				() => {
					latest.dragListener = listen;
				},
				[listen],
				DRAG_LISTENER,
			);
		}

		// `drag`: pointer-drag the element, updating its transform. Supports axis lock
		// (`drag="x"`/`"y"`) and `dragConstraints` (a box of left/right/top/bottom px).
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
				if (!dragEnabled || !props.drag) return;
				let active = false;
				let startX = 0;
				let startY = 0;
				let originX = 0;
				let originY = 0;
				latest.dragX ??= 0;
				latest.dragY ??= 0;
				const onDown = (e: any) => {
					if (!latest.dragListener) return;
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

		// Single-element FLIP preserves author transforms and owns only its projection.
		// OCTANE DIVERGENCE[motion-bounded-layout-flip][conformance:bounded-layout-flip]
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
				if (latest.shouldReduceMotion) latest.layout?.stop();
				if (!layoutEnabled || !props.layout) {
					if (!layoutEnabled || latest.layoutActive || !layoutIdKey) latest.layout?.reset();
					latest.layoutActive = false;
					if (layoutEnabled && layoutIdKey) {
						latest.layout?.update(false, latest.transition, latest.shouldReduceMotion);
					}
					return;
				}
				if (!latest.layoutActive) latest.layout?.reset();
				latest.layoutActive = true;
				(latest.layout ??= new LayoutAnimation(node)).update(
					latest.layoutMode,
					latest.transition,
					latest.shouldReduceMotion,
				);
			},
			undefined,
			LAYOUT,
		);

		// `layoutId`: shared-element crossfade. On mount, if a same-id element recently
		// unmounted, FLIP from its recorded box to ours.
		// OCTANE DIVERGENCE[motion-bounded-layoutId][conformance:bounded-layoutId]
		useLayoutEffect(
			() => {
				const node: HTMLElement = latest.host.current;
				if (!layoutEnabled) return;
				const id = layoutIdKey;
				if (!id) return;
				const prev = takeLayoutCell(id);
				if (prev)
					(latest.layout ??= new LayoutAnimation(node)).update(
						latest.layoutMode,
						latest.transition,
						latest.shouldReduceMotion,
						prev,
					);
			},
			[layoutEnabled, layoutIdKey],
			LAYOUT_ID,
		);

		// Unmount: this cleanup runs while the node is still in the DOM. Record shared
		// layout state here—not in the keyed claim effect, whose cleanup also runs on
		// dependency changes—then clone any exiting node outside the block's range.
		// OCTANE DIVERGENCE[motion-exit-cleanup-before-detach][conformance:exit-cleanup-before-detach]
		useLayoutEffect(
			() => () => {
				const n: HTMLElement | null = latest.host.current;
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
		useLayoutEffect(() => () => latest.layout?.stop(), [], LAYOUT_CLEANUP);

		const host: Record<string, any> = {};
		const subscriptions = readDomProps(props, svg, svgRoot, host, latest);
		if (subscriptions?.length) {
			for (const { key } of subscriptions) host[key] = svgAttributeValue(key, host[key]);
			const previous: SVGAttributeValue[] | undefined = latest.svgAttrs;
			const stable =
				previous?.length === subscriptions.length &&
				subscriptions.every(
					({ key, value }, i) => previous[i].key === key && previous[i].value === value,
				)
					? previous
					: subscriptions;
			useLayoutEffect(
				() => {
					const node: unknown = latest.host.current;
					if (!isSVGElement(node)) return;
					latest.svgAttrs = stable;
					const cleanup = bindSVGAttributes(node, subscriptions);
					return () => {
						latest.svgAttrs = undefined;
						cleanup();
					};
				},
				[stable],
				SVG_MV,
			);
		}
		host.ref = ref;
		const children = props.children;
		return createElement(
			tag,
			host,
			children == null
				? children
				: createElement(
						VariantContext,
						{
							value: {
								initial:
									initialLabel === false || isVariantLabel(initialLabel)
										? initialLabel
										: inherited.initial,
								animate: isVariantLabel(animateLabel) ? animateLabel : inherited.animate,
							},
						},
						createElement(StaggerContext, { value: orch }, children),
					),
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
	const components = new Map<string, MotionComponent>();
	return new Proxy(
		{},
		{
			get(_target, tag) {
				if (typeof tag !== 'string') return undefined;
				const cached = components.get(tag);
				if (cached !== undefined) return cached;
				const component = createMotionComponent(tag, preloadedFeatures);
				components.set(tag, component);
				return component;
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
export function AnimatePresence(props: any, _scope?: unknown) {
	return props.children;
}

export interface LayoutGroupProps {
	children?: unknown;
	id?: string;
	inherit?: boolean | 'id';
}

export function LayoutGroup(props: LayoutGroupProps, _scope?: unknown) {
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
	return createElement(LayoutGroupContext, { value }, props.children);
}

// MotionConfig — provides global defaults (transition, reduced motion) to every
// motion element below it. A plain-TS component: stamps the config context, then
// renders children.
export function MotionConfig(props: any, _scope?: unknown) {
	const parent = useContext(MotionConfigContext);
	const reducedMotion = props.reducedMotion ?? parent.reducedMotion ?? 'never';
	// Octane slots hooks by call site, so this subscription can stay conditional.
	// Avoid paying for matchMedia listeners when the policy never consults it.
	const userPreference = reducedMotion === 'user' ? useReducedMotionAtSlot(CONFIG_REDUCED) : false;
	return createElement(
		MotionConfigContext,
		{
			value: {
				transition: props.transition ?? parent.transition,
				reducedMotion,
				shouldReduceMotion:
					reducedMotion === 'always' || (reducedMotion === 'user' && userPreference),
			},
		},
		props.children,
	);
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

export function LazyMotion(props: LazyMotionProps, _scope?: unknown) {
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

	return createElement(
		LazyMotionContext,
		{
			value: {
				features,
				strict: props.strict === true,
				provided: true,
			},
		},
		props.children,
	);
}

export { useAnimate } from './useAnimate';
export { useMotionValue } from './useMotionValue';
export { useScroll } from './useScroll';
export { useTransform } from './useTransform';
export { useSpring } from './useSpring';
export { useMotionValueEvent } from './useMotionValueEvent';
export { useReducedMotion } from './useReducedMotion';
export { useInView, type UseInViewOptions } from './useInView';
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
