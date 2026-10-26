// Element descriptors
//
// createElement, scoped elements and values, isValidElement, cloneElement,
// Children, and the Fragment and Activity sentinels.

import { enableDescriptorFormActions } from './host-props.js';
import { hasOwnProp } from '../has-own.js';
import {
	applyElementDefaultProps,
	childElementKey,
	escapeMappedElementKey,
	childrenIterator,
} from '../shared-value-helpers.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { FRAGMENT_TAG, ACTIVITY_TAG, ELEMENT_TAG, PORTAL_TAG } from '../runtime-tags.js';
import { isRendererContext, registerClientRendererBridge } from '../renderer-bridge.js';
import type { ComponentBody, ElementDescriptor, Scope } from './types.js';
import { flushSync } from './engine.js';
import { type TrackedThenable, useThenable, trackThenable } from './use.js';
import {
	renderClientContextProvider,
	createScopedResolver,
	createNativeScopedResolver,
} from './context.js';
import { CURRENT_SCOPE, CURRENT_BLOCK } from './render.js';
import {
	POSITIONAL_CHILDREN,
	enableDescriptorFragmentRefs,
	renderFragmentRefDescriptor,
} from './deopt.js';
import { componentSlot } from './component-slots.js';
import { type FragmentProps, renderActivityDescriptor } from './activity.js';
import { EMPTY_ARGS } from './events.js';
import { HOST_DESCRIPTORS, enableHostDescriptors } from './drivers.js';

// The consumer's bundler substitutes the whole Node environment expression below,
// so the source guard must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

// The VALUE stays the sentinel symbol (the compiler matches `Fragment` by
// name and the runtime compares descriptor types by identity); the declared
// TYPE is component-shaped so long-form `<Fragment key ref>` JSX type-checks —
// which is the export's entire purpose (see above).
export const Fragment = FRAGMENT_TAG as unknown as (props: FragmentProps) => unknown;

interface ActivityDescriptorDispatch {
	type: symbol;
	body: ComponentBody;
}

// Generic element reconciliation must not retain the optional Activity engine.
// Importing the public sentinel installs its cold dispatch capability; direct
// compiled Activities already call activityBlock and do not need this wrapper.
export let activityDescriptorDispatch: ActivityDescriptorDispatch | null = null;

function initializeActivitySentinel(): symbol {
	const type: symbol = ACTIVITY_TAG;
	activityDescriptorDispatch = { type, body: renderActivityDescriptor };
	return type;
}

/** Activity keeps its runtime sentinel identity while accepting ordinary JSX props. */
export const Activity = /* @__PURE__ */ initializeActivitySentinel() as unknown as (props: {
	mode?: 'visible' | 'hidden';
	children?: unknown;
	name?: string;
	key?: string | number | bigint | null | undefined;
}) => unknown;

// ---------------------------------------------------------------------------
// Element descriptor — `createElement(Comp, props)`. The compiler lowers a JSX
// component element used at VALUE position (e.g. `root.render(<App foo={x}/>)`)
// to this call, so JSX-as-a-value matches React's `root.render(<App/>)` shape.
// It is a plain { type, props } record (like a ReactElement). `root.render`
// unwraps it; props are evaluated fresh at each call site, so re-rendering with
// `root.render(<App foo={next}/>)` updates props while keeping `type` identity.
// ---------------------------------------------------------------------------

// ElementDescriptor.key intentionally matches React's public shape (`null` for
// both no key and a nullish key), so preserve compiler-visible key PRESENCE out
// of band. This lets hydration keep an explicit `key={undefined}` as an
// independent reconciliation boundary without adding an observable descriptor
// field or penalizing unkeyed descriptors with extra object shape.
//
// A non-null `key` already proves presence, so only the AMBIGUOUS nullish-key
// case is recorded here — every `key={id}` element in a list would otherwise pay
// a WeakSet insert per render. Read presence through `elementKeyWasProvided`.
const KEYED_ELEMENT_DESCRIPTORS = new WeakSet<object>();
export function elementKeyWasProvided(descriptor: ElementDescriptor): boolean {
	return descriptor.key !== null || KEYED_ELEMENT_DESCRIPTORS.has(descriptor);
}
// Children.map/toArray synthesize stable traversal keys. Keep the original
// missing-key validation state out of band so rebasing an unkeyed element from
// a dynamic collection does not accidentally silence the renderer warning.
export const ELEMENTS_MISSING_LIST_KEY = new WeakSet<object>();
// Only compiler-authored descriptors with a deferred child body enter this
// collection. Ordinary createElement calls retain their exact public shape and
// allocation path.
export const SCOPED_ELEMENT_PROPS = new WeakSet<object>();
export const SCOPED_CHILDREN_RESOLVER: unique symbol = Symbol('octane.scopedChildren');
const SCOPED_CHILDREN_PROPERTY: PropertyDescriptor = {
	configurable: true,
	enumerable: true,
	get: function (this: { [SCOPED_CHILDREN_RESOLVER]: () => unknown }) {
		return this[SCOPED_CHILDREN_RESOLVER]();
	},
};

// Octane's analog of React's `ReactNode`: the type of a renderable prop or
// child. Octane renders element descriptors, primitives (coerced to text),
// nullish values, and arbitrarily nested arrays of these, and the compiler —
// not the type system — decides how a hole is rendered, so the type is
// deliberately `unknown` rather than a closed union (see the jsx-runtime
// `children` contract). Bindings ported from React should use this alias for
// props upstream typed as `ReactNode`; a structural union or React's own
// `ReactNode` would reject octane's nominal elements.
export type OctaneNode = unknown;

export function hasElementConfigKey(config: any): boolean {
	if (config == null || (typeof config !== 'object' && typeof config !== 'function')) return false;
	// React's development-only props.key warning getter is not a real key. This
	// matters when an element's props object is fed back into createElement.
	// Gated exactly like React's hasValidKey: the reflective probe allocates a
	// descriptor object on every call, and only a React DEV build can install
	// such a getter — so production reaches the key with one property read.
	if (process.env.NODE_ENV !== 'production' && hasOwnProp.call(config, 'key')) {
		const own = Object.getOwnPropertyDescriptor(config, 'key');
		if (own?.get != null && (own.get as any).isReactWarning) return false;
	}
	return config.key !== undefined;
}

function copyElementConfig(config: any): any {
	const props: any = {};
	if (config == null) return props;
	for (const name in config) {
		if (name !== 'key' && hasOwnProp.call(config, name)) props[name] = config[name];
	}
	return props;
}

function restoreWritableScopedChildren(props: any, name: string, value: unknown): boolean {
	const inherited = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(props), name);
	if (inherited?.get === undefined && inherited?.set === undefined) return false;
	// An inherited accessor can write children during the next assignment (or
	// default lookup). Keep the original writable value until copying finishes.
	Object.defineProperty(props, 'children', {
		configurable: true,
		enumerable: true,
		writable: true,
		value,
	});
	return true;
}

// A scoped child replaces any copied/default children value. Install the shared
// accessor at the same enumeration position without first adding a data field;
// keep the overwritten value only for defaultProps' undefined check.
function copyScopedElementConfig(type: any, config: any, resolve: () => unknown): any {
	// An own __proto__ can change where later assignments land (including an
	// inherited children setter). Preserve the full copy/default sequence before
	// replacing children in this uncommon case. The same applies if a caller has
	// explicitly installed children on Object.prototype.
	if (
		(config != null && hasOwnProp.call(config, '__proto__')) ||
		hasOwnProp.call(Object.prototype, 'children')
	) {
		const props = copyElementConfig(config);
		applyElementDefaultProps(type, props);
		Object.defineProperty(props, SCOPED_CHILDREN_RESOLVER, { value: resolve });
		Object.defineProperty(props, 'children', SCOPED_CHILDREN_PROPERTY);
		SCOPED_ELEMENT_PROPS.add(props);
		return props;
	}
	const props: any = {};
	Object.defineProperty(props, SCOPED_CHILDREN_RESOLVER, { value: resolve });
	let copiedChildren: any;
	let hasCopiedChildren = false;
	let childrenAreWritable = false;
	if (config != null) {
		for (const name in config) {
			if (name === 'key' || !hasOwnProp.call(config, name)) continue;
			if (name === 'children') {
				copiedChildren = config[name];
				Object.defineProperty(props, 'children', SCOPED_CHILDREN_PROPERTY);
				hasCopiedChildren = true;
			} else {
				const value = config[name];
				if (
					hasCopiedChildren &&
					!childrenAreWritable &&
					!hasOwnProp.call(props, name) &&
					restoreWritableScopedChildren(props, name, copiedChildren)
				) {
					childrenAreWritable = true;
				}
				props[name] = value;
			}
		}
	}
	const defaults = type?.defaultProps;
	if (defaults != null) {
		for (const name in defaults) {
			if (name === 'children') {
				if (
					(childrenAreWritable
						? props.children
						: hasCopiedChildren
							? copiedChildren
							: props.children) === undefined
				) {
					copiedChildren = defaults[name];
					if (childrenAreWritable) {
						props.children = copiedChildren;
					} else if (!hasCopiedChildren) {
						if ('children' in props) {
							// Preserve an inherited setter/throw before replacing the value.
							props.children = copiedChildren;
						} else {
							Object.defineProperty(props, 'children', SCOPED_CHILDREN_PROPERTY);
							hasCopiedChildren = true;
						}
					}
				}
			} else {
				if (
					hasCopiedChildren &&
					!childrenAreWritable &&
					!hasOwnProp.call(props, name) &&
					restoreWritableScopedChildren(props, name, copiedChildren)
				) {
					childrenAreWritable = true;
				}
				if (props[name] === undefined) props[name] = defaults[name];
			}
		}
	}
	if (childrenAreWritable || !hasCopiedChildren)
		Object.defineProperty(props, 'children', SCOPED_CHILDREN_PROPERTY);
	SCOPED_ELEMENT_PROPS.add(props);
	return props;
}

function scopedElementRecord<P>(
	type: ElementDescriptor<P>['type'],
	props: P,
	key: any,
	ref: any,
	resolve: () => unknown,
	invocationSite?: string,
): ElementDescriptor<P> {
	if (typeof type === 'string' && !HOST_DESCRIPTORS) enableHostDescriptors();
	const descriptor = { $$kind: ELEMENT_TAG, type, props, key, ref } as ElementDescriptor<P>;
	if (invocationSite !== undefined) descriptor.__octaneInvocationSite = invocationSite;
	Object.defineProperty(descriptor, SCOPED_CHILDREN_RESOLVER, { value: resolve });
	Object.defineProperty(descriptor, 'children', SCOPED_CHILDREN_PROPERTY);
	return descriptor;
}

function finalizeElementDescriptor<P>(descriptor: ElementDescriptor<P>): ElementDescriptor<P> {
	if (process.env.NODE_ENV !== 'production') {
		Object.freeze(descriptor.props);
		Object.freeze(descriptor);
	}
	return descriptor;
}

export const SCOPED_VALUE_RECORD: unique symbol = Symbol('octane.scopedValue');

export type ScopedValueDescriptor<P> = ElementDescriptor<P> & {
	readonly [SCOPED_VALUE_RECORD]?: () => ElementDescriptor<P>;
};

function scopedValueType(this: ScopedValueDescriptor<any>): ElementDescriptor['type'] {
	return this[SCOPED_VALUE_RECORD]!().type;
}
function scopedValueProps(this: ScopedValueDescriptor<any>): any {
	return this[SCOPED_VALUE_RECORD]!().props;
}
function scopedValueKey(this: ScopedValueDescriptor<any>): any {
	const next = this[SCOPED_VALUE_RECORD]!();
	const key = next.key;
	if (key === null && KEYED_ELEMENT_DESCRIPTORS.has(next)) {
		KEYED_ELEMENT_DESCRIPTORS.add(this);
	}
	return key;
}
function scopedValueRef(this: ScopedValueDescriptor<any>): any {
	return this[SCOPED_VALUE_RECORD]!().ref;
}
function scopedValueChildren(this: ScopedValueDescriptor<any>): any {
	return this[SCOPED_VALUE_RECORD]!().children;
}
function scopedValueInvocationSite(this: ScopedValueDescriptor<any>): string | undefined {
	return this[SCOPED_VALUE_RECORD]!().__octaneInvocationSite;
}
const SCOPED_VALUE_PROPERTIES: PropertyDescriptorMap = {
	type: { configurable: true, enumerable: true, get: scopedValueType },
	props: { configurable: true, enumerable: true, get: scopedValueProps },
	key: { configurable: true, enumerable: true, get: scopedValueKey },
	ref: { configurable: true, enumerable: true, get: scopedValueRef },
	children: { configurable: true, enumerable: true, get: scopedValueChildren },
	// Ordinary descriptors own this internal field only when a site exists, and
	// a deferred value cannot know without resolving its record. Keep it readable
	// but non-enumerable so the value enumerates the same public keys.
	__octaneInvocationSite: {
		configurable: true,
		enumerable: false,
		get: scopedValueInvocationSite,
	},
};

/**
 * Preserve an inspectable JSX descriptor while deferring its complete record.
 *
 * The marker stays eagerly available to public element checks, while inspecting
 * any actual field resolves type, props, key, ref, and children together in the
 * current render scope. A shared value is rebuilt when its provider scope or a
 * context it read changes, just like a scoped element's deferred children.
 *
 * @internal
 */
export function createScopedValue<P>(
	readElement: () => ElementDescriptor<P>,
): ElementDescriptor<P> {
	return scopedValueDescriptor(createScopedResolver(readElement));
}

/**
 * Whether a compiled return-JSX function is running as the component body of
 * `scope`. Every render path invokes a body as `body(props, scope, extra)` while
 * that Scope is current, so argument 1 is the current Scope only for that call.
 * A direct call returns a JSX value instead, which the compiler defers until the
 * value renders.
 *
 * @internal
 */
export function isRenderCall(scope: unknown): boolean {
	return scope === CURRENT_SCOPE && scope !== null;
}

/**
 * The value a direct call of a compiled return-JSX function returns: its record
 * builder, applied to the locals it reads, when the value renders or is
 * inspected.
 *
 * @internal
 */
export function deferRecord<P>(
	read: (...locals: any[]) => ElementDescriptor<P>,
	...locals: any[]
): ElementDescriptor<P> {
	return createScopedValue(() => read(...locals));
}

/** @internal Native deferred JSX preserves its complete descriptor contract. */
export function nativeCreateScopedValue<P>(
	readElement: () => ElementDescriptor<P>,
): ElementDescriptor<P> {
	return scopedValueDescriptor(createNativeScopedResolver(readElement));
}

function scopedValueDescriptor<P>(resolve: () => ElementDescriptor<P>): ElementDescriptor<P> {
	const descriptor = { $$kind: ELEMENT_TAG } as ElementDescriptor<P>;
	Object.defineProperty(descriptor, SCOPED_VALUE_RECORD, { value: resolve });
	// Different renderer copies can share the initial { $$kind } V8 map. Seed
	// this module's symbol before accessor transitions to keep their maps apart.
	Object.defineProperty(descriptor, 'type', SCOPED_VALUE_PROPERTIES['type']);
	Object.defineProperty(descriptor, 'props', SCOPED_VALUE_PROPERTIES['props']);
	Object.defineProperty(descriptor, 'key', SCOPED_VALUE_PROPERTIES['key']);
	Object.defineProperty(descriptor, 'ref', SCOPED_VALUE_PROPERTIES['ref']);
	Object.defineProperty(descriptor, 'children', SCOPED_VALUE_PROPERTIES['children']);
	Object.defineProperty(
		descriptor,
		'__octaneInvocationSite',
		SCOPED_VALUE_PROPERTIES['__octaneInvocationSite'],
	);
	if (process.env.NODE_ENV !== 'production') Object.freeze(descriptor);
	return descriptor;
}

/**
 * Compiler-only JSX descriptor whose child tree resolves in its rendered scope.
 *
 * Matching accessors preserve the ordinary descriptor type, props, key, ref, and
 * synchronously inspectable children without introducing component boundaries or
 * hydration markers. Scope/context-aware memoization prevents one module-level
 * element from retaining another provider's children or stale context values.
 *
 * @internal
 */
export function createScopedElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props: P | null | undefined,
	readChildren: () => unknown,
	invocationSite?: string,
): ElementDescriptor<P> {
	return scopedElementDescriptor(type, props, createScopedResolver(readChildren), invocationSite);
}

/** @internal Resolve native children in their represented render Scope. */
export function nativeCreateScopedElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props: P | null | undefined,
	readChildren: () => unknown,
	invocationSite?: string,
): ElementDescriptor<P> {
	return scopedElementDescriptor(
		type,
		props,
		createNativeScopedResolver(readChildren),
		invocationSite,
	);
}

function scopedElementDescriptor<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props: P | null | undefined,
	children: () => unknown,
	invocationSite?: string,
): ElementDescriptor<P> {
	const src = (props ?? null) as any;
	const hasKey = hasElementConfigKey(src);
	const key = hasKey ? '' + src.key : null;
	const copiedProps = copyScopedElementConfig(type, src, children);
	const descriptor = scopedElementRecord(
		type,
		copiedProps as P,
		key,
		copiedProps.ref !== undefined ? copiedProps.ref : null,
		children,
		invocationSite,
	);
	if (
		key === null &&
		src != null &&
		(typeof src === 'object' || typeof src === 'function') &&
		'key' in src
	) {
		KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	}
	return finalizeElementDescriptor(descriptor);
}

// React-shape `createElement(type, props, ...children)`. Two-arg calls
// (`createElement(Comp, props)`) stay the component-value form the compiler emits
// for `{<Comp/>}`. With a string `type` and/or explicit children it produces a
// host descriptor for the runtime de-opt renderer. `key` is lifted out of props
// (React semantics — `key` is never a real prop). A `null` config is React's
// "no props" spelling; its overload infers `P` from `type` alone so a bare
// `null` never becomes the descriptor's props type.
export function createElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props: null,
	...children: any[]
): ElementDescriptor<P>;
export function createElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props?: P | null,
	...children: any[]
): ElementDescriptor<P>;
export function createElement<P>(
	type: ComponentBody<P> | string | typeof Fragment,
	props?: P | null,
	...children: any[]
): ElementDescriptor<P> {
	enableDescriptorCapabilities();
	return createElementFromConfig(undefined, type, props, children);
}

// Public factories accept arbitrary props, so they install every descriptor
// capability a prop can select. Compiled JSX installs only what its props name.
function enableDescriptorCapabilities(): void {
	enableDescriptorFormActions();
	enableDescriptorFragmentRefs();
	enableHostDescriptors();
}

/** @internal Compiler-emitted host descriptor: its props were classified statically. */
export function createHostElement<P>(
	type: string,
	props?: P | null,
	...children: any[]
): ElementDescriptor<P> {
	if (!HOST_DESCRIPTORS) enableHostDescriptors();
	return createElementFromConfig(undefined, type, props, children);
}

/** @internal Compiler-authored element descriptor with stable invocation identity. */
export function createElementAt<P>(
	invocationSite: string,
	type: ComponentBody<P> | string | typeof Fragment,
	props?: P | null,
	...children: any[]
): ElementDescriptor<P> {
	enableDescriptorCapabilities();
	return createElementFromConfig(invocationSite, type, props, children);
}

/** Compiler-owned ordered JSX config, without an intermediate element record. */
export function componentSlotFromConfig(
	parentScope: Scope,
	slotKey: number,
	domParent: Node,
	comp: ComponentBody | string | typeof Fragment,
	config: any,
	invocationSite?: string,
	anchor?: Node | null,
): void {
	if (typeof comp === 'function' && isRendererContext(comp)) {
		registerClientRendererBridge(renderClientContextProvider, flushSync);
	}
	const key = hasElementConfigKey(config) ? '' + config.key : undefined;
	const props = copyElementConfig(config);
	applyElementDefaultProps(comp, props);
	const body =
		comp === Fragment
			? props.ref != null || hasOwnProp.call(props, 'ref')
				? renderFragmentRefDescriptor
				: renderFragmentConfig
			: comp;
	componentSlot(
		parentScope,
		slotKey,
		domParent,
		body,
		props,
		invocationSite,
		anchor,
		false,
		false,
		key,
		true,
	);
}

function renderFragmentConfig(props: { children?: unknown }): unknown {
	return props.children;
}

/**
 * @internal Compiler-owned positional children; omitted children allocate no rest array.
 * Also consumed by app-core/src/client-entry-runtime.js; coordinate ABI changes with that adapter.
 * A caller whose type can be a host string installs the host renderer first
 * (enableHostDescriptors): compiled JSX does so once per module, when it
 * cannot prove its tag is a function, so a bundle whose descriptors are all
 * components does not retain the renderer.
 */
export function createElementFromConfig<P>(
	invocationSite: string | undefined,
	type: ComponentBody<P> | string | typeof Fragment,
	props: P | null | undefined,
	children: any[] = EMPTY_ARGS,
): ElementDescriptor<P> {
	if (typeof type === 'function' && isRendererContext(type)) {
		registerClientRendererBridge(renderClientContextProvider, flushSync);
	}
	const src = (props ?? null) as any;
	const hasKey = hasElementConfigKey(src);
	const key = hasKey ? '' + src.key : null;
	const hasPositional = children.length > 0;
	let kids = hasPositional ? (children.length === 1 ? children[0] : children) : src?.children;
	// Multiple positional children → a fresh array of FIXED siblings (never reordered).
	// Tag it so the de-opt list keys them by index without the missing-key warning that
	// is meant for `.map()` results. (A single child is passed through as-is — a lone
	// `.map()` array stays untagged and keeps the warning.)
	if (children.length > 1) {
		POSITIONAL_CHILDREN.add(children);
		if (process.env.NODE_ENV !== 'production') Object.freeze(children);
	}
	// Build the descriptor's props WITHOUT mutating the caller's object, with `key`
	// lifted OUT of props (React semantics — `key` is never a real prop).
	//
	// React-shape contract: positional children ARE `props.children`. A COMPONENT
	// descriptor reaches its body through componentSlot, which forwards `props` only
	// (not `descriptor.children`) — so a component that reads `{props.children}`
	// (rendered via childSlot) needs them mirrored into props. Host descriptors also
	// expose children through `props.children`, matching React element shape and making
	// clone/render-prop patterns in React ecosystem bindings preserve host children.
	// Positional children override an explicit `props.children`, matching React.
	//
	// createElement is callable userland API, so it must snapshot config even on
	// the common two-argument path. Mutating the caller's object after creation
	// must not retroactively mutate the element.
	const p = copyElementConfig(src);
	if (hasPositional) p.children = kids;
	applyElementDefaultProps(type, p);
	kids = p.children;
	const descriptor: ElementDescriptor<P> = {
		$$kind: ELEMENT_TAG,
		type,
		props: p as P,
		key,
		ref: p.ref !== undefined ? p.ref : null,
		children: kids ?? null,
	};
	if (invocationSite !== undefined) descriptor.__octaneInvocationSite = invocationSite;
	// Only a NULLISH `key` leaves presence ambiguous (`key` is non-null exactly when
	// `hasKey`), so the prototype-chain probe stays off the keyed-list hot path.
	if (
		key === null &&
		src != null &&
		(typeof src === 'object' || typeof src === 'function') &&
		'key' in src
	) {
		KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	}
	return finalizeElementDescriptor(descriptor);
}
export function isElementDescriptor(v: any): v is ElementDescriptor {
	return v != null && v.$$kind === ELEMENT_TAG;
}
export function isHostDescriptor(v: any): v is ElementDescriptor & { type: string } {
	return v != null && v.$$kind === ELEMENT_TAG && typeof v.type === 'string';
}

// ---------------------------------------------------------------------------
// React-compatible `isValidElement` / `cloneElement` / `Children`.
//
// These operate on octane's element descriptors (`createElement` / JSX-at-value)
// and children VALUES, mirroring React's public API so libraries that inspect or
// re-project children — a Radix-style `Slot`/`asChild`, `Children.only`, etc. —
// port unchanged. Children traversal flattens nested arrays and treats
// `null`/`undefined`/booleans as empty (visited as `null`, matching React's
// `traverseAllChildren`); `toArray`/`map` drop the empties from their results.
// ---------------------------------------------------------------------------

/**
 * True for a createElement/JSX descriptor. Known descriptors, including unions,
 * retain their prop types; supply P to narrow an element-or-props union.
 */
export function isValidElement<P = any, E extends ElementDescriptor<P> = ElementDescriptor<P>>(
	v: E | null | undefined,
): v is E;
export function isValidElement<P = any>(v: unknown): v is ElementDescriptor<P>;
export function isValidElement(v: unknown): v is ElementDescriptor {
	return isElementDescriptor(v);
}

/**
 * `cloneElement(element, config?, ...children)` — a new descriptor with `element`'s
 * props shallow-merged under `config` (config wins), `key` overridden by `config.key`,
 * and children replaced by any passed positionally (else the original children are kept).
 * `ref` is a normal prop here (octane is ref-as-prop), so it merges like any other.
 */
export function cloneElement<P>(
	element: ElementDescriptor<P>,
	config?: any,
	...children: any[]
): ElementDescriptor<P> {
	if (!isElementDescriptor(element)) {
		throw new Error(formatClientError(4));
	}
	enableDescriptorCapabilities();
	let scopedChildren: (() => unknown) | undefined;
	let copiedGetter: (() => unknown) | undefined;
	let props: any;
	if (SCOPED_ELEMENT_PROPS.has(element.props as object)) {
		// Copy a scoped descriptor's child accessor without evaluating it in the caller's scope.
		const get = Object.getOwnPropertyDescriptor(element, 'children')!.get;
		if (get === SCOPED_CHILDREN_PROPERTY.get) {
			scopedChildren = (element as any)[SCOPED_CHILDREN_RESOLVER];
		} else {
			// A complete scoped value can wrap a scoped element. Its shared getter
			// reads a resolver from its receiver, so bind that one to the source.
			// A user-replaced getter still receives the clone as before.
			copiedGetter =
				get === SCOPED_VALUE_PROPERTIES['children'].get ? () => get!.call(element) : get;
		}
		props = {};
		for (const name in element.props) {
			if (name !== 'key' && name !== 'children' && hasOwnProp.call(element.props, name)) {
				props[name] = (element.props as any)[name];
			}
		}
	} else {
		props = copyElementConfig(element.props);
	}
	let key = element.key;
	let hasKeyOverride = false;
	let replacedChildren = false;
	if (config != null) {
		hasKeyOverride = hasElementConfigKey(config);
		if (hasKeyOverride) key = '' + config.key;
		for (const name in config) {
			if (name === 'key') continue;
			// React 19 keeps refs as props, but cloneElement treats an explicitly
			// undefined ref as absent for backwards compatibility.
			if (name === 'ref' && config.ref === undefined) continue;
			if (hasOwnProp.call(config, name)) {
				props[name] = config[name];
				if (name === 'children') replacedChildren = true;
			}
		}
	}
	const n = children.length;
	let kids: any;
	let keepsScopedChildren = false;
	if (n === 1) {
		kids = children[0];
	} else if (n > 1) {
		POSITIONAL_CHILDREN.add(children);
		kids = children;
	} else if ((scopedChildren !== undefined || copiedGetter !== undefined) && !replacedChildren) {
		if (copiedGetter === undefined) {
			Object.defineProperty(props, SCOPED_CHILDREN_RESOLVER, { value: scopedChildren });
		}
		Object.defineProperty(
			props,
			'children',
			copiedGetter === undefined
				? SCOPED_CHILDREN_PROPERTY
				: { configurable: true, enumerable: true, get: copiedGetter },
		);
		SCOPED_ELEMENT_PROPS.add(props);
		keepsScopedChildren = true;
		kids = null;
	} else {
		// No new children: reuse `config.children` (now merged into props) or the original.
		kids = 'children' in props ? props.children : element.children;
	}
	if (n > 0) props.children = kids;
	const ref = props.ref !== undefined ? props.ref : null;
	let descriptor: ElementDescriptor<P>;
	if (keepsScopedChildren && copiedGetter === undefined) {
		descriptor = scopedElementRecord(
			element.type,
			props,
			key,
			ref,
			scopedChildren!,
			element.__octaneInvocationSite,
		);
	} else {
		descriptor = {
			$$kind: ELEMENT_TAG,
			type: element.type,
			props,
			key,
			ref,
			children: kids ?? null,
		};
		if (element.__octaneInvocationSite !== undefined)
			descriptor.__octaneInvocationSite = element.__octaneInvocationSite;
		if (keepsScopedChildren) {
			// A production caller may replace the accessor. Copy its receiver-sensitive
			// getter unchanged on this cold path.
			Object.defineProperty(descriptor, 'children', {
				configurable: true,
				enumerable: true,
				get: copiedGetter!,
			});
		}
	}
	// Only a nullish result key needs the out-of-band record (see createElement).
	if (
		key === null &&
		(elementKeyWasProvided(element) || (config != null && hasOwnProp.call(config, 'key')))
	) {
		KEYED_ELEMENT_DESCRIPTORS.add(descriptor);
	}
	// A mapped/toArray descriptor retains its missing-key provenance when it is
	// cloned unchanged. Supplying a real replacement key fixes that diagnostic,
	// just as React.cloneElement(mappedChild, {key}) does.
	if (ELEMENTS_MISSING_LIST_KEY.has(element) && !hasKeyOverride) {
		ELEMENTS_MISSING_LIST_KEY.add(descriptor);
	}
	return finalizeElementDescriptor(descriptor);
}

function cloneAndReplaceElementKey(element: ElementDescriptor, key: string): ElementDescriptor {
	const scoped = SCOPED_ELEMENT_PROPS.has(element.props);
	let descriptor: ElementDescriptor;
	if (scoped) {
		const get = Object.getOwnPropertyDescriptor(element, 'children')!.get;
		if (get === SCOPED_CHILDREN_PROPERTY.get) {
			descriptor = scopedElementRecord(
				element.type,
				element.props,
				key,
				element.ref,
				(element as any)[SCOPED_CHILDREN_RESOLVER],
				element.__octaneInvocationSite,
			);
		} else {
			const copiedGetter =
				get === SCOPED_VALUE_PROPERTIES['children'].get ? () => get!.call(element) : get;
			descriptor = {
				$$kind: ELEMENT_TAG,
				type: element.type,
				props: element.props,
				key,
				ref: element.ref,
				children: null,
			};
			if (element.__octaneInvocationSite !== undefined)
				descriptor.__octaneInvocationSite = element.__octaneInvocationSite;
			Object.defineProperty(descriptor, 'children', {
				configurable: true,
				enumerable: true,
				get: copiedGetter!,
			});
		}
	} else {
		descriptor = {
			$$kind: ELEMENT_TAG,
			type: element.type,
			props: element.props,
			key,
			ref: element.ref,
			children: element.children,
		};
		if (element.__octaneInvocationSite !== undefined)
			descriptor.__octaneInvocationSite = element.__octaneInvocationSite;
	}
	// `key` is a real (non-null) string here, so presence is already implied.
	if (ELEMENTS_MISSING_LIST_KEY.has(element)) ELEMENTS_MISSING_LIST_KEY.add(descriptor);
	return finalizeElementDescriptor(descriptor);
}

function resolveChildrenThenable(thenable: TrackedThenable): any {
	// During a component render, use the same tracked call-order storage and
	// Suspense sentinel as use(). This lets a cached promise in Children.map
	// suspend and replay through the nearest Octane boundary.
	if (CURRENT_BLOCK !== null) return useThenable(thenable);
	trackThenable(thenable);
	if (thenable.status === 'fulfilled') return thenable.value;
	if (thenable.status === 'rejected') throw thenable.reason;
	throw thenable;
}

function describeObjectForError(value: object): string {
	let rendered: string;
	try {
		rendered = String(value);
	} catch {
		return 'object with keys {' + Object.keys(value).join(', ') + '}';
	}
	return rendered === '[object Object]'
		? 'object with keys {' + Object.keys(value).join(', ') + '}'
		: rendered;
}

export function invalidChildError(child: object): Error {
	const found = describeObjectForError(child);
	return new Error(formatClientError(3, found));
}

export function invalidElementTypeError(type: unknown): Error {
	const found =
		type === null
			? 'null'
			: type === undefined
				? 'undefined'
				: typeof type === 'object'
					? describeObjectForError(type as object)
					: JSON.stringify(type);
	return new Error(formatClientError(24, found));
}

function mapIntoChildren(
	children: any,
	out: any[],
	escapedPrefix: string,
	nameSoFar: string,
	callback: (child: any) => any,
	validateKey = false,
): number {
	let type = typeof children;
	if (type === 'undefined' || type === 'boolean') {
		children = null;
		type = 'object';
	}

	const isLeaf =
		children === null ||
		type === 'string' ||
		type === 'number' ||
		type === 'bigint' ||
		isElementDescriptor(children) ||
		(children != null && children.$$kind === PORTAL_TAG);
	if (isLeaf) {
		const child = children;
		let mapped = callback(child);
		const childKey = nameSoFar === '' ? '.' + childElementKey(child, 0) : nameSoFar;
		if (Array.isArray(mapped)) {
			mapIntoChildren(mapped, out, escapeMappedElementKey(childKey) + '/', '', (value) => value);
		} else if (mapped != null) {
			if (isElementDescriptor(mapped)) {
				const mappedKey = mapped.key;
				mapped = cloneAndReplaceElementKey(
					mapped,
					escapedPrefix +
						(mappedKey != null && (!child || child.key !== mappedKey)
							? escapeMappedElementKey('' + mappedKey) + '/'
							: '') +
						childKey,
				);
				if (validateKey && isElementDescriptor(child) && child.key == null) {
					ELEMENTS_MISSING_LIST_KEY.add(mapped);
				}
			}
			out.push(mapped);
		}
		return 1;
	}

	let count = 0;
	const nextPrefix = nameSoFar === '' ? '.' : nameSoFar + ':';
	if (Array.isArray(children)) {
		const validateItems = validateKey || !POSITIONAL_CHILDREN.has(children);
		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			count += mapIntoChildren(
				child,
				out,
				escapedPrefix,
				nextPrefix + childElementKey(child, i),
				callback,
				validateItems,
			);
		}
		return count;
	}

	const iterator = childrenIterator(children);
	if (iterator !== null) {
		const cursor = iterator.call(children);
		let step: IteratorResult<any>;
		let i = 0;
		while (!(step = cursor.next()).done) {
			const child = step.value;
			count += mapIntoChildren(
				child,
				out,
				escapedPrefix,
				nextPrefix + childElementKey(child, i++),
				callback,
				true,
			);
		}
		return count;
	}

	if (type === 'object') {
		if (typeof children.then === 'function') {
			return mapIntoChildren(
				resolveChildrenThenable(children),
				out,
				escapedPrefix,
				nameSoFar,
				callback,
				validateKey,
			);
		}
		throw invalidChildError(children);
	}
	return 0;
}

export const Children = {
	/** Iterate children, flattening collections; empties are visited as `null`. */
	forEach(children: any, fn: (child: any, index: number) => void, context?: any): void {
		if (children == null) return;
		let index = 0;
		mapIntoChildren(children, [], '', '', (child) => {
			fn.call(context, child, index++);
			return null;
		});
	},
	/** Map children to a flat, React-keyed array; empty results are dropped. */
	map<T>(
		children: any,
		fn: (child: any, index: number) => T,
		context?: any,
	): T[] | null | undefined {
		if (children == null) return children as null | undefined;
		const out: T[] = [];
		let index = 0;
		mapIntoChildren(children, out, '', '', (child) => fn.call(context, child, index++));
		return out;
	},
	/** Number of children `map`/`forEach` would visit (empties included, like React). */
	count(children: any): number {
		if (children == null) return 0;
		return mapIntoChildren(children, [], '', '', () => null);
	},
	/** Flatten children into a React-keyed array, dropping empty entries. */
	toArray(children: any): any[] {
		const out: any[] = [];
		if (children != null) mapIntoChildren(children, out, '', '', (child) => child);
		return out;
	},
	/** Assert `children` is a single element and return it (`React.Children.only`). */
	only<T>(children: T): T {
		if (!isElementDescriptor(children)) {
			throw new Error(formatClientError(2));
		}
		return children;
	},
};
