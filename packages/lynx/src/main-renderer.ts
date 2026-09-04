/**
 * PrimJS-safe, one-shot renderer ABI for Lynx's synchronous first screen.
 *
 * This intentionally mirrors only the compiler-facing descriptor surface from
 * `octane/universal/native`. It does not import the universal scheduler,
 * reconciler, effects, refs, event handlers, or background transport.
 */
import type {
	LinkedStateOptions,
	LinkedStatePrevious,
	UniversalComponent,
	UniversalContext,
	UniversalEventPriority,
	UniversalHostBatch,
	UniversalHostCommand,
	UniversalHostTemplateProgram,
	UniversalHostTemplateProgramBinding,
	UniversalHostTemplateProgramEvent,
	UniversalHostTemplateProgramNode,
	UniversalHostTemplateProgramValue,
	UniversalKey,
	UniversalPlan,
	UniversalPlanNode,
	UniversalPropEntry,
	UniversalRenderable,
	UniversalRenderContext,
} from 'octane/universal/native';
import { hasOwnSymbolFields } from './core/own-symbols.js';
import { isLynxNativeResource } from './resource.js';

const UNIVERSAL_PLAN = Symbol.for('octane.universal.plan');
const UNIVERSAL_VALUE = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST = Symbol.for('octane.universal.list');
const UNIVERSAL_COMPONENT = Symbol.for('octane.universal.component');
const UNIVERSAL_COMPONENT_VALUE = Symbol.for('octane.universal.component-value');
const UNIVERSAL_PROPS = Symbol.for('octane.universal.props');
const UNIVERSAL_CHILDREN = Symbol.for('octane.universal.children');
const UNIVERSAL_IF = Symbol.for('octane.universal.if');
const UNIVERSAL_SWITCH = Symbol.for('octane.universal.switch');
const UNIVERSAL_FOR = Symbol.for('octane.universal.for');
const UNIVERSAL_TRY = Symbol.for('octane.universal.try');
const UNIVERSAL_CONTEXT = Symbol.for('octane.universal.context');
const UNIVERSAL_ACTIVITY = Symbol.for('octane.universal.activity');
const UNIVERSAL_KEYED = Symbol.for('octane.universal.keyed');
const UNIVERSAL_PORTAL = Symbol.for('octane.universal.portal');
const LAZY_COMPONENT = Symbol.for('octane.lazy');
const CONTEXT_TAG = Symbol.for('octane.context');
const FIRST_SCREEN_EVENT = Symbol.for('octane.lynx.first-screen-event');
const NO_CHILDREN = Symbol('octane.lynx.first-screen.no-children');
const NO_KEY = Symbol('octane.lynx.first-screen.no-key');
const FIRST_SCREEN_WARM_DEPTH_CAP = 64;

const FIRST_SCREEN_LAZY_METADATA = Object.freeze({
	id: '<lazy>',
	target: 'universal' as const,
});

export const UNIVERSAL_HMR: unique symbol = Symbol.for('octane.universal.hmr') as never;

interface PlanValue {
	readonly $$kind: symbol;
	readonly plan: UniversalPlan;
	readonly values: readonly unknown[];
	readonly key: UniversalKey | null;
}

interface PropsValue {
	readonly $$kind: symbol;
	readonly props: Readonly<Record<string, unknown>>;
	readonly key: unknown;
	readonly hasKey: boolean;
	readonly hasChildren: boolean;
}

interface ComponentValue {
	readonly $$kind: symbol;
	readonly renderer: string;
	readonly component: UniversalComponent<any>;
	readonly props: PropsValue;
	readonly key: unknown;
	readonly hasKey: boolean;
}

interface FirstScreenOwner {
	readonly parent: FirstScreenOwner | null;
	readonly contexts: Map<UniversalContext<any>, unknown> | null;
	readonly visibility: 'visible' | 'hidden';
}

interface FirstScreenHost {
	kind: 'host';
	key: UniversalKey | null;
	id: number;
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly events: ReadonlyMap<string, UniversalEventPriority>;
	readonly visibility: 'visible' | 'hidden';
	readonly children: FirstScreenNode[];
}

interface FirstScreenRange {
	kind: 'range';
	key: UniversalKey | null;
	id: number;
	readonly children: FirstScreenNode[];
	readonly componentScope?: true;
	readonly templateProgram?: FirstScreenProgramTemplate;
}

type FirstScreenNode = FirstScreenHost | FirstScreenRange;

interface FirstScreenProgramValueSite {
	readonly slot: number;
	readonly text: boolean;
}

interface FirstScreenCompiledProgram {
	readonly wire: UniversalHostTemplateProgram;
	readonly values: readonly FirstScreenProgramValueSite[];
	readonly eventSlots: readonly number[];
}

interface FirstScreenProgramTemplate {
	readonly root: FirstScreenHost;
	readonly program: UniversalHostTemplateProgram;
	readonly values: readonly UniversalHostTemplateProgramValue[];
	firstListenerId: number | null;
}

interface FirstScreenAttempt {
	owner: FirstScreenOwner;
	nextId: number;
	nextListener: number;
	nextUniversalId: number;
	hostCount: number;
}

interface TrackedThenable<T = unknown> extends PromiseLike<T> {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: T;
	reason?: unknown;
}

class FirstScreenSuspense {
	constructor(readonly thenable: PromiseLike<unknown>) {}
}

let CURRENT_ATTEMPT: FirstScreenAttempt | null = null;
let NEXT_HOOK_SLOT = 0;
let FIRST_SCREEN_WARM_DEPTH = 0;
const SLOT_STACK: unknown[] = [];
const ACTIVE_FIRST_SCREEN_WARM_PLANS: Array<() => void> = [];
const FIRST_SCREEN_TEMPLATE_PROGRAMS = new WeakMap<
	UniversalPlan,
	FirstScreenCompiledProgram | null
>();

function currentAttempt(): FirstScreenAttempt {
	if (CURRENT_ATTEMPT === null) {
		throw new Error('Lynx first-screen hooks may only run while a component is rendering.');
	}
	return CURRENT_ATTEMPT;
}

function currentOwner(): FirstScreenOwner {
	return currentAttempt().owner;
}

function withOwner<T>(owner: FirstScreenOwner, render: () => T): T {
	const attempt = currentAttempt();
	const previous = attempt.owner;
	attempt.owner = owner;
	try {
		return render();
	} finally {
		attempt.owner = previous;
	}
}

function childOwner(
	parent: FirstScreenOwner,
	contexts: Map<UniversalContext<any>, unknown> | null = null,
	visibility: 'visible' | 'hidden' = parent.visibility,
): FirstScreenOwner {
	return { parent, contexts, visibility };
}

function assertRenderer(renderer: string): void {
	if (renderer !== 'lynx') {
		throw new Error(
			`Lynx first-screen renderer cannot evaluate renderer ${JSON.stringify(renderer)}.`,
		);
	}
}

function freezePlanNode(node: UniversalPlanNode): UniversalPlanNode {
	if (node.kind === 'host') {
		return Object.freeze({
			kind: 'host',
			type: node.type,
			...(node.props === undefined ? null : { props: Object.freeze({ ...node.props }) }),
			...(node.bindings === undefined
				? null
				: {
						bindings: Object.freeze(
							node.bindings.map(([name, slot]) => Object.freeze([name, slot] as const)),
						),
					}),
			...(node.propsSlot === undefined ? null : { propsSlot: node.propsSlot }),
			children: Object.freeze((node.children || []).map(freezePlanNode)),
		});
	}
	if (node.kind === 'range') {
		return Object.freeze({
			kind: 'range',
			children: Object.freeze(node.children.map(freezePlanNode)),
		});
	}
	if (node.kind === 'slot') return Object.freeze({ kind: 'slot', slot: node.slot });
	if (node.kind === 'component') {
		return Object.freeze({
			kind: 'component',
			renderer: node.renderer,
			...(node.component === undefined ? null : { component: node.component }),
			...(node.componentSlot === undefined ? null : { componentSlot: node.componentSlot }),
			...(node.propsSlot === undefined ? null : { propsSlot: node.propsSlot }),
			...(node.keySlot === undefined ? null : { keySlot: node.keySlot }),
			children: Object.freeze((node.children || []).map(freezePlanNode)),
		});
	}
	if (node.kind === 'if') {
		return Object.freeze({
			kind: 'if',
			conditionSlot: node.conditionSlot,
			then: freezePlanNode(node.then),
			...(node.else === undefined ? null : { else: freezePlanNode(node.else) }),
		});
	}
	if (node.kind === 'switch') {
		return Object.freeze({
			kind: 'switch',
			valueSlot: node.valueSlot,
			cases: Object.freeze(
				node.cases.map(([value, child]) => Object.freeze([value, freezePlanNode(child)] as const)),
			),
			...(node.default === undefined ? null : { default: freezePlanNode(node.default) }),
		});
	}
	return Object.freeze({
		kind: 'text',
		...(node.value === undefined ? null : { value: node.value }),
		...(node.slot === undefined ? null : { slot: node.slot }),
	});
}

export function universalPlan(renderer: string, root: UniversalPlanNode): UniversalPlan {
	assertRenderer(renderer);
	return Object.freeze({
		$$kind: UNIVERSAL_PLAN,
		renderer,
		root: freezePlanNode(root),
	}) as unknown as UniversalPlan;
}

export function universalValue(
	plan: UniversalPlan,
	values: readonly unknown[] = [],
	key: UniversalKey | null = null,
): UniversalRenderable {
	if ((plan as { $$kind?: unknown }).$$kind !== UNIVERSAL_PLAN) {
		throw new TypeError('universalValue expected a universal plan.');
	}
	return { $$kind: UNIVERSAL_VALUE, plan, values, key } as unknown as UniversalRenderable;
}

export function universalKey(key: UniversalKey, value: UniversalRenderable): UniversalRenderable {
	if ((value as { $$kind?: unknown }).$$kind === UNIVERSAL_VALUE) {
		return { ...(value as PlanValue), key } as UniversalRenderable;
	}
	return { $$kind: UNIVERSAL_KEYED, key, value } as unknown as UniversalRenderable;
}

export function universalList<T>(
	items: Iterable<T>,
	render: (item: T, index: number) => UniversalRenderable,
	empty?: UniversalRenderable,
): UniversalRenderable {
	const values: UniversalRenderable[] = [];
	let index = 0;
	for (const item of items) values.push(render(item, index++));
	return { $$kind: UNIVERSAL_LIST, values, ...(values.length === 0 ? { empty } : null) } as never;
}

function defineProtoProp(props: Record<PropertyKey, unknown>, value: unknown): void {
	Object.defineProperty(props, '__proto__', {
		configurable: true,
		enumerable: true,
		value,
		writable: true,
	});
}

function assignSpread(
	props: Record<PropertyKey, unknown>,
	value: unknown,
	canonicalizeHostClass: boolean,
): void {
	if (value == null) return;
	const source = Object(value) as Record<PropertyKey, unknown>;
	for (const key of Reflect.ownKeys(source)) {
		if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
		if (key === '__proto__') defineProtoProp(props, source[key]);
		else if (canonicalizeHostClass && key === 'className') props.class = source[key];
		else props[key] = source[key];
	}
}

export function universalProps(
	entries: readonly UniversalPropEntry[],
	children: unknown = NO_CHILDREN,
	canonicalizeHostClass = false,
	compilerOwnedRecord = false,
): PropsValue {
	if (compilerOwnedRecord) {
		return {
			$$kind: UNIVERSAL_PROPS,
			props: Object.freeze(entries as unknown as Record<string, unknown>),
			key: null,
			hasKey: false,
			hasChildren: false,
		};
	}
	const props: Record<string, unknown> = {};
	for (const entry of entries) {
		if (entry[0] === 'spread') {
			assignSpread(props, entry[1], canonicalizeHostClass);
			continue;
		}
		const name = canonicalizeHostClass && entry[1] === 'className' ? 'class' : entry[1];
		if (name === '__proto__') defineProtoProp(props, entry[2]);
		else props[name] = entry[2];
	}
	if (children !== NO_CHILDREN) props.children = children;
	const hasKey = Object.prototype.hasOwnProperty.call(props, 'key');
	const key = hasKey ? props.key : null;
	if (hasKey) delete props.key;
	return {
		$$kind: UNIVERSAL_PROPS,
		props: Object.freeze(props),
		key,
		hasKey,
		hasChildren: Object.prototype.hasOwnProperty.call(props, 'children'),
	};
}

function normalizeProps(value: unknown): PropsValue {
	if ((value as { $$kind?: unknown })?.$$kind === UNIVERSAL_PROPS) return value as PropsValue;
	return universalProps(value == null ? [] : [['spread', value]]);
}

export function universalComponent(
	renderer: string,
	component: UniversalComponent<any>,
	props: PropsValue | Readonly<Record<string, unknown>> | null = null,
	key: unknown = NO_KEY,
): UniversalRenderable {
	assertRenderer(renderer);
	const normalized = normalizeProps(props);
	return {
		$$kind: UNIVERSAL_COMPONENT_VALUE,
		renderer,
		component,
		props: normalized,
		key: key === NO_KEY ? normalized.key : key,
		hasKey: key !== NO_KEY || normalized.hasKey,
	} as never;
}

export function universalChildren(
	renderer: string,
	render: () => UniversalRenderable,
): UniversalRenderable {
	assertRenderer(renderer);
	return { $$kind: UNIVERSAL_CHILDREN, renderer, render } as never;
}

export function universalIf(
	condition: unknown,
	then: () => UniversalRenderable,
	otherwise: (() => UniversalRenderable) | null = null,
): UniversalRenderable {
	return { $$kind: UNIVERSAL_IF, condition: !!condition, then, else: otherwise } as never;
}

export function universalSwitch(
	value: unknown,
	cases: readonly (readonly [unknown, () => UniversalRenderable])[],
	defaultValue: (() => UniversalRenderable) | null = null,
): UniversalRenderable {
	return { $$kind: UNIVERSAL_SWITCH, value, cases, default: defaultValue } as never;
}

export function universalFor<T>(
	items: Iterable<T>,
	key: (item: T, index: number) => UniversalKey,
	render: (item: T, index: number) => UniversalRenderable,
	empty: (() => UniversalRenderable) | null = null,
	ownerless = false,
	compact = false,
	_hostComponent?: UniversalComponent<any> | true,
	_leafPlan?: UniversalPlan,
	_leafSignature?: string,
	componentScope = false,
): UniversalRenderable {
	return {
		$$kind: UNIVERSAL_FOR,
		items,
		key,
		render,
		empty,
		ownerless,
		compact,
		...(componentScope ? { componentScope: true } : null),
	} as never;
}

export function universalTry(
	body: () => UniversalRenderable,
	pending: (() => UniversalRenderable) | null = null,
	catchBody: ((error: unknown, reset: () => void) => UniversalRenderable) | null = null,
): UniversalRenderable {
	return { $$kind: UNIVERSAL_TRY, body, pending, catch: catchBody } as never;
}

export function universalContext<T>(
	context: UniversalContext<T>,
	value: T,
	children: UniversalRenderable | (() => UniversalRenderable),
): UniversalRenderable {
	return { $$kind: UNIVERSAL_CONTEXT, context, value, children } as never;
}

export function universalActivity(
	mode: 'visible' | 'hidden' | string,
	body: () => UniversalRenderable,
): UniversalRenderable {
	if (mode !== 'visible' && mode !== 'hidden') {
		throw new TypeError(`Universal Activity mode must be "visible" or "hidden".`);
	}
	return { $$kind: UNIVERSAL_ACTIVITY, mode, body } as never;
}

export function defineUniversalComponent<P>(
	renderer: string,
	render: (props: P, context: UniversalRenderContext) => UniversalRenderable,
	metadata?: { module?: string },
): UniversalComponent<P> {
	assertRenderer(renderer);
	Object.defineProperty(render, UNIVERSAL_COMPONENT, {
		configurable: false,
		enumerable: false,
		value: Object.freeze({ id: renderer, module: metadata?.module, target: 'universal' }),
	});
	return render as UniversalComponent<P>;
}

/** Compiler sentinel replacing an ordinary background event expression. */
export const firstScreenEvent = FIRST_SCREEN_EVENT;

function componentMetadata(component: UniversalComponent<any>): {
	readonly id?: unknown;
	readonly module?: string;
} {
	const metadata = (component as unknown as Record<PropertyKey, unknown>)[UNIVERSAL_COMPONENT] as
		{ id?: unknown; module?: string } | undefined;
	if (metadata !== undefined) return metadata;
	if ((component as any)?.[LAZY_COMPONENT] === true) return FIRST_SCREEN_LAZY_METADATA;
	throw new Error('Lynx first-screen rendering requires a compiled Lynx component.');
}

export function hmrUniversalComponent<P>(
	renderer: string,
	component: UniversalComponent<P>,
): UniversalComponent<P> {
	assertRenderer(renderer);
	const metadata = (component as unknown as Record<PropertyKey, unknown>)[UNIVERSAL_COMPONENT] as
		{ id?: unknown; module?: string } | undefined;
	if (metadata?.id !== renderer) {
		throw new Error(
			`Universal HMR renderer mismatch: wrapper ${JSON.stringify(renderer)} cannot own ${JSON.stringify(metadata?.id)}.`,
		);
	}
	const state: {
		component: UniversalComponent<P>;
		update(incoming: UniversalComponent<P>): void;
	} = {
		component,
		update(incoming) {
			const incomingState = (incoming as unknown as Record<PropertyKey, unknown>)[UNIVERSAL_HMR] as
				{ component?: UniversalComponent<P> } | undefined;
			const next = incomingState?.component ?? incoming;
			const nextMetadata = (next as unknown as Record<PropertyKey, unknown>)[
				UNIVERSAL_COMPONENT
			] as { id?: unknown } | undefined;
			if (nextMetadata?.id !== renderer) {
				throw new Error(
					`Universal HMR renderer mismatch: wrapper ${JSON.stringify(renderer)} cannot accept ${JSON.stringify(nextMetadata?.id)}.`,
				);
			}
			state.component = next;
			if ((next as any).__warm === undefined) delete (wrapper as any).__warm;
			else (wrapper as any).__warm = (next as any).__warm;
		},
	};
	const wrapper = defineUniversalComponent<P>(
		renderer,
		(props, context) => state.component(props, context),
		{ module: metadata.module },
	);
	Object.defineProperty(wrapper, UNIVERSAL_HMR, { value: state });
	if ((component as any).__warm !== undefined) (wrapper as any).__warm = (component as any).__warm;
	return wrapper;
}

function firstScreenLazyProps(
	component: UniversalComponent<any>,
	props: any,
): Readonly<Record<string, unknown>> {
	const defaults = (component as any).defaultProps;
	if (defaults == null || typeof defaults !== 'object') return props;
	let resolved = props;
	for (const key of Object.keys(defaults)) {
		if (props == null || props[key] === undefined) {
			if (resolved === props) resolved = props == null ? {} : { ...props };
			resolved[key] = defaults[key];
		}
	}
	return resolved;
}

function resolveFirstScreenLazyModule(module: unknown): UniversalComponent<any> {
	let component = module;
	if (module != null) {
		const defaultExport = (module as { readonly default?: unknown }).default;
		if (defaultExport !== undefined) component = defaultExport;
	}
	if (typeof component !== 'function' || (component as any)[LAZY_COMPONENT] === true) {
		throw new Error(
			`Universal lazy expected a component function or module default, got ${
				(component as any)?.[LAZY_COMPONENT] === true ? 'a lazy component' : typeof component
			}.`,
		);
	}
	const resolved = component as UniversalComponent<any>;
	const metadata = componentMetadata(resolved);
	if (metadata.id !== 'lynx') {
		throw new Error(
			`Universal lazy for renderer "lynx" cannot render component ${JSON.stringify(metadata.id)}.`,
		);
	}
	return resolved;
}

/**
 * Main-thread mirror of universal lazy loading. A pending chunk can only commit
 * an authored `@pending` arm because the native first-screen pass is one-shot;
 * the retained background root owns later reveal/error updates after adoption.
 */
/* @__NO_SIDE_EFFECTS__ */
export function lazy<C extends UniversalComponent<any>>(
	load: () => PromiseLike<{ default: C } | C>,
): C {
	let status: 'uninitialized' | 'pending' | 'fulfilled' | 'rejected' = 'uninitialized';
	let result: unknown = null;
	let thenable: TrackedThenable<{ default: C } | C> | null = null;

	const initialize = (): void => {
		if (status !== 'uninitialized') return;
		try {
			const loaded = load();
			thenable = loaded as TrackedThenable<{ default: C } | C>;
			loaded.then(
				(module) => {
					if (status === 'uninitialized' || status === 'pending') {
						result = module;
						status = 'fulfilled';
					}
				},
				(error) => {
					if (status === 'uninitialized' || status === 'pending') {
						result = error;
						status = 'rejected';
					}
				},
			);
		} catch (error) {
			if (status === 'uninitialized') thenable = null;
			throw error;
		}
		if (status === 'uninitialized') status = 'pending';
	};

	const wrapper = ((props: any, context: UniversalRenderContext): UniversalRenderable => {
		if (status === 'uninitialized') initialize();
		let settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
		if (settledStatus === 'fulfilled') {
			const component = resolveFirstScreenLazyModule(result);
			return component(firstScreenLazyProps(component, props), context);
		}
		if (settledStatus === 'rejected') throw result;
		useBatch([thenable!]);
		settledStatus = status as 'pending' | 'fulfilled' | 'rejected';
		if (settledStatus === 'fulfilled') {
			const component = resolveFirstScreenLazyModule(result);
			return component(firstScreenLazyProps(component, props), context);
		}
		if (settledStatus === 'rejected') throw result;
		throw new FirstScreenSuspense(thenable!);
	}) as UniversalComponent<any>;
	Object.defineProperties(wrapper, {
		[LAZY_COMPONENT]: { value: true },
		__warm: { value: initialize },
	});
	return wrapper as C;
}

export function rendererRegion(): never {
	throw new Error('Lynx first-screen rendering does not support cross-renderer regions.');
}

function componentContext(): UniversalRenderContext {
	return {
		renderer: 'lynx',
		readContext: useContext,
		insertionEffect() {},
		layoutEffect() {},
		effect() {},
	};
}

function normalizeKey(value: unknown): UniversalKey | null {
	return typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'symbol' ||
		typeof value === 'bigint'
		? value
		: null;
}

const DISCRETE_EVENTS: ReadonlySet<string> = new Set([
	'blur',
	'change',
	'focus',
	'input',
	'longpress',
	'longtap',
	'tap',
	'touchend',
	'touchstart',
]);
const CONTINUOUS_EVENTS: ReadonlySet<string> = new Set([
	'layoutchange',
	'scroll',
	'touchmove',
	'wheel',
]);
const EVENT_PROP = /^(?:capture-bind|capture-catch|global-bind|bind|catch)([A-Za-z]+)$/;

function eventPriority(name: string): UniversalEventPriority | null {
	const match = EVENT_PROP.exec(name);
	if (match === null) return null;
	const event = match[1];
	return DISCRETE_EVENTS.has(event)
		? 'discrete'
		: CONTINUOUS_EVENTS.has(event)
			? 'continuous'
			: 'default';
}

function isTemplateProgramValue(value: unknown): value is UniversalHostTemplateProgramValue {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		typeof value === 'bigint'
	);
}

function compiledFirstScreenProgram(plan: UniversalPlan): FirstScreenCompiledProgram | null {
	const cached = FIRST_SCREEN_TEMPLATE_PROGRAMS.get(plan);
	if (cached !== undefined) return cached;
	if (plan.renderer !== 'lynx' || plan.root.kind !== 'host') {
		FIRST_SCREEN_TEMPLATE_PROGRAMS.set(plan, null);
		return null;
	}
	const nodes: UniversalHostTemplateProgramNode[] = [];
	const events: UniversalHostTemplateProgramEvent[] = [];
	const values: FirstScreenProgramValueSite[] = [];
	const eventSlots: number[] = [];
	const forbiddenProp = (name: string): boolean =>
		name === 'key' ||
		name === 'ref' ||
		name === 'children' ||
		name === '__proto__' ||
		name === 'hidden' ||
		name === 'attach' ||
		name === 'onUpdate' ||
		name.startsWith('main-thread:');
	const visit = (node: UniversalPlanNode, parent: number, parentType: string | null): boolean => {
		if (node.kind === 'slot' || node.kind === 'text') {
			if (parentType !== 'text') return false;
			const slot = node.kind === 'slot' ? node.slot : node.slot;
			if (slot === undefined) {
				nodes.push(
					Object.freeze({
						type: '#text',
						parent,
						props: Object.freeze({ value: String(node.kind === 'text' ? (node.value ?? '') : '') }),
					}),
				);
				return true;
			}
			const valueIndex = values.length;
			values.push(Object.freeze({ slot, text: true }));
			const binding: UniversalHostTemplateProgramBinding = Object.freeze({
				name: 'value',
				valueIndex,
			});
			nodes.push(
				Object.freeze({
					type: '#text',
					parent,
					props: Object.freeze({}),
					bindings: Object.freeze([binding]),
				}),
			);
			return true;
		}
		if (node.kind !== 'host' || node.propsSlot !== undefined) return false;
		if (node.type.length === 0 || node.type === 'list' || node.type === 'list-item') return false;

		const index = nodes.length;
		const bindingNames = new Set<string>();
		for (const [name] of node.bindings ?? []) {
			if (typeof name !== 'string' || bindingNames.has(name) || forbiddenProp(name)) return false;
			bindingNames.add(name);
		}
		const staticSource = node.props ?? {};
		if (hasOwnSymbolFields(staticSource)) return false;
		const staticProps: Record<string, UniversalHostTemplateProgramValue> = {};
		for (const name of Object.keys(staticSource)) {
			if (bindingNames.has(name)) continue;
			const value = staticSource[name];
			if (forbiddenProp(name) || eventPriority(name) !== null || !isTemplateProgramValue(value)) {
				return false;
			}
			if (name === '__proto__') defineProtoProp(staticProps, value);
			else staticProps[name] = value;
		}
		const bindings: UniversalHostTemplateProgramBinding[] = [];
		for (const [name, slot] of node.bindings ?? []) {
			const priority = eventPriority(name);
			if (priority !== null) {
				if (index === 0) return false;
				events.push(Object.freeze({ node: index, type: name, priority }));
				eventSlots.push(slot);
				continue;
			}
			const valueIndex = values.length;
			values.push(Object.freeze({ slot, text: false }));
			bindings.push(Object.freeze({ name, valueIndex }));
		}
		nodes.push(
			Object.freeze({
				type: node.type,
				parent,
				props: Object.freeze(staticProps),
				...(bindings.length === 0 ? null : { bindings: Object.freeze(bindings) }),
			}),
		);
		for (const child of node.children ?? []) {
			if (!visit(child, index, node.type)) return false;
		}
		return true;
	};
	const compiled = visit(plan.root, -1, null)
		? Object.freeze({
				wire: Object.freeze({ nodes: Object.freeze(nodes), events: Object.freeze(events) }),
				values: Object.freeze(values),
				eventSlots: Object.freeze(eventSlots),
			})
		: null;
	FIRST_SCREEN_TEMPLATE_PROGRAMS.set(plan, compiled);
	return compiled;
}

function prepareFirstScreenProgramValues(
	value: PlanValue,
	compiled: FirstScreenCompiledProgram,
): readonly UniversalHostTemplateProgramValue[] | null {
	for (const slot of compiled.eventSlots) {
		const event = value.values[slot];
		if (event !== FIRST_SCREEN_EVENT && typeof event !== 'function') return null;
	}
	const values: UniversalHostTemplateProgramValue[] = new Array(compiled.values.length);
	for (let index = 0; index < compiled.values.length; index++) {
		const site = compiled.values[index];
		const source = value.values[site.slot];
		if (site.text) {
			if (typeof source !== 'string' && typeof source !== 'number' && typeof source !== 'bigint') {
				return null;
			}
			values[index] = String(source);
		} else {
			if (!isTemplateProgramValue(source)) return null;
			values[index] = source;
		}
	}
	return Object.freeze(values);
}

function hostNode(
	type: string,
	rawProps: Readonly<Record<string, unknown>>,
	children: FirstScreenNode[],
): FirstScreenHost {
	const props: Record<string, unknown> = { ...rawProps };
	const key = normalizeKey(props.key);
	delete props.key;
	delete props.ref;
	delete props.children;
	const events = new Map<string, UniversalEventPriority>();
	for (const name of Object.keys(props)) {
		if (isLynxNativeResource(props[name])) {
			throw new TypeError(
				`Lynx first-screen rendering does not support native resource prop ${JSON.stringify(name)} on <${type}>; native resources are background-only.`,
			);
		}
		const priority = eventPriority(name);
		if (priority === null) continue;
		const value = props[name];
		delete props[name];
		if (value === FIRST_SCREEN_EVENT || typeof value === 'function') events.set(name, priority);
	}
	return {
		kind: 'host',
		key,
		id: 0,
		type,
		props: Object.freeze(props),
		events,
		visibility: currentOwner().visibility,
		children,
	};
}

function range(
	children: FirstScreenNode[],
	key: UniversalKey | null = null,
	componentScope = false,
	templateProgram?: FirstScreenProgramTemplate,
): FirstScreenRange {
	return {
		kind: 'range',
		key,
		id: 0,
		children,
		...(componentScope ? { componentScope: true } : null),
		...(templateProgram === undefined ? null : { templateProgram }),
	};
}

interface FirstScreenComponentResult {
	readonly value: UniversalRenderable;
	readonly nodes: FirstScreenNode[];
}

function renderComponentResult(
	component: UniversalComponent<any>,
	props: Readonly<Record<string, unknown>>,
): FirstScreenComponentResult {
	const metadata = componentMetadata(component);
	if (metadata !== FIRST_SCREEN_LAZY_METADATA && metadata.id !== 'lynx') {
		throw new Error('Lynx first-screen rendering requires a compiled Lynx component.');
	}
	const owner = childOwner(currentOwner());
	const warmPlanCheckpoint = ACTIVE_FIRST_SCREEN_WARM_PLANS.length;
	try {
		return withOwner(owner, () => {
			const value = component(props, componentContext());
			return { value, nodes: materialize(value, null) };
		});
	} finally {
		ACTIVE_FIRST_SCREEN_WARM_PLANS.length = warmPlanCheckpoint;
	}
}

function renderComponent(
	component: UniversalComponent<any>,
	props: Readonly<Record<string, unknown>>,
): FirstScreenNode[] {
	return renderComponentResult(component, props).nodes;
}

function firstScreenProgramTemplate(
	value: UniversalRenderable,
	nodes: readonly FirstScreenNode[],
): FirstScreenProgramTemplate | undefined {
	const planValue = value as PlanValue;
	if (
		planValue?.$$kind !== UNIVERSAL_VALUE ||
		planValue.key !== null ||
		nodes.length !== 1 ||
		nodes[0].kind !== 'host'
	) {
		return undefined;
	}
	const compiled = compiledFirstScreenProgram(planValue.plan);
	if (compiled === null || compiled.wire.nodes.length === 0) return undefined;
	const values = prepareFirstScreenProgramValues(planValue, compiled);
	return values === null
		? undefined
		: { root: nodes[0], program: compiled.wire, values, firstListenerId: null };
}

function renderPlanNode(node: UniversalPlanNode, values: readonly unknown[]): FirstScreenNode[] {
	if (node.kind === 'slot') return materialize(values[node.slot], null);
	if (node.kind === 'text') {
		return materialize(node.slot === undefined ? (node.value ?? '') : values[node.slot], null);
	}
	if (node.kind === 'range') {
		const children: FirstScreenNode[] = [];
		for (const child of node.children) children.push(...renderPlanNode(child, values));
		return [range(children)];
	}
	if (node.kind === 'component') {
		const component = node.component ?? (values[node.componentSlot!] as UniversalComponent<any>);
		let props =
			node.propsSlot === undefined ? universalProps([]) : normalizeProps(values[node.propsSlot]);
		if ((node.children || []).length !== 0) {
			const childPlan = universalPlan('lynx', { kind: 'range', children: node.children! });
			props = universalProps(
				[['spread', props.props]],
				universalChildren('lynx', () => universalValue(childPlan, values)),
			);
		}
		const rendered = renderComponent(component, props.props);
		return [
			range(rendered, normalizeKey(node.keySlot === undefined ? props.key : values[node.keySlot])),
		];
	}
	if (node.kind === 'if') {
		const selected = values[node.conditionSlot] ? node.then : node.else;
		return selected === undefined ? [] : [range(renderPlanNode(selected, values))];
	}
	if (node.kind === 'switch') {
		let selected = node.default;
		for (const entry of node.cases) {
			if (entry[0] === values[node.valueSlot]) {
				selected = entry[1];
				break;
			}
		}
		return selected === undefined ? [] : [range(renderPlanNode(selected, values))];
	}
	const props: Record<string, unknown> = { ...(node.props || {}) };
	for (const binding of node.bindings || []) props[binding[0]] = values[binding[1]];
	if (node.propsSlot !== undefined)
		Object.assign(props, normalizeProps(values[node.propsSlot]).props);
	const dynamicChildren = props.children;
	const children: FirstScreenNode[] = [];
	if ((node.children || []).length !== 0) {
		for (const child of node.children!) children.push(...renderPlanNode(child, values));
	} else if (dynamicChildren !== undefined) {
		children.push(...materialize(dynamicChildren, null));
	}
	return [hostNode(node.type, props, children)];
}

function renderTry(value: Record<string, unknown>): FirstScreenNode[] {
	const attempt = currentAttempt();
	const universalIdCheckpoint = attempt.nextUniversalId;
	const warmPlanCheckpoint = ACTIVE_FIRST_SCREEN_WARM_PLANS.length;
	const owner = childOwner(currentOwner());
	return withOwner(owner, () => {
		try {
			const body = value.body as () => UniversalRenderable;
			return [range([range(materialize(body(), null))])];
		} catch (error) {
			ACTIVE_FIRST_SCREEN_WARM_PLANS.length = warmPlanCheckpoint;
			// The body is abandoned before pending/catch commits. Match the
			// background transaction by making its speculative useId allocations
			// available to whichever fallback becomes the first tree.
			attempt.nextUniversalId = universalIdCheckpoint;
			if (error instanceof FirstScreenSuspense) {
				const pending = value.pending as (() => UniversalRenderable) | null;
				if (pending === null) throw error;
				return [range([range(materialize(pending(), null))])];
			}
			const catchBody = value.catch as
				((error: unknown, reset: () => void) => UniversalRenderable) | null;
			if (catchBody === null) throw error;
			return [
				range([
					range(
						materialize(
							catchBody(error, () => {}),
							null,
						),
					),
				]),
			];
		} finally {
			ACTIVE_FIRST_SCREEN_WARM_PLANS.length = warmPlanCheckpoint;
		}
	});
}

function renderableKey(value: unknown): UniversalKey | null {
	const record = value as Record<string, unknown>;
	if (record?.$$kind === UNIVERSAL_VALUE) return (record as unknown as PlanValue).key;
	if (record?.$$kind === UNIVERSAL_KEYED) return normalizeKey(record.key);
	if (record?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
		const component = record as unknown as ComponentValue;
		return component.hasKey ? normalizeKey(component.key) : null;
	}
	return null;
}

function materialize(value: unknown, key: UniversalKey | null): FirstScreenNode[] {
	if (value == null || value === false || value === true) return [];
	const record = value as Record<string, unknown>;
	if (record?.$$kind === UNIVERSAL_KEYED) {
		const rendered = materialize(record.value, normalizeKey(record.key));
		if (rendered.length === 1) rendered[0].key = normalizeKey(record.key);
		else return [range(rendered, normalizeKey(record.key))];
		return rendered;
	}
	if (record?.$$kind === UNIVERSAL_LIST) {
		const values = record.values as readonly unknown[];
		if (values.length === 0 && Object.prototype.hasOwnProperty.call(record, 'empty')) {
			return materialize(record.empty, null);
		}
		const output: FirstScreenNode[] = [];
		for (const child of values) output.push(...materialize(child, renderableKey(child)));
		return output;
	}
	if (record?.$$kind === UNIVERSAL_VALUE) {
		const planValue = value as PlanValue;
		assertRenderer(planValue.plan.renderer);
		const rendered = renderPlanNode(planValue.plan.root, planValue.values);
		const resolvedKey = key ?? planValue.key;
		if (resolvedKey !== null && rendered.length === 1) rendered[0].key = resolvedKey;
		else if (resolvedKey !== null) return [range(rendered, resolvedKey)];
		return rendered;
	}
	if (record?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
		const component = value as ComponentValue;
		assertRenderer(component.renderer);
		return [
			range(
				renderComponent(component.component, component.props.props),
				component.hasKey ? normalizeKey(component.key) : key,
			),
		];
	}
	if (record?.$$kind === UNIVERSAL_CHILDREN) {
		assertRenderer(record.renderer as string);
		return materialize((record.render as () => UniversalRenderable)(), key);
	}
	if (record?.$$kind === UNIVERSAL_IF) {
		const body = record.condition ? record.then : record.else;
		return typeof body === 'function' ? [range(materialize(body(), null))] : [];
	}
	if (record?.$$kind === UNIVERSAL_SWITCH) {
		let selected = record.default as (() => UniversalRenderable) | null;
		for (const entry of record.cases as readonly (readonly [
			unknown,
			() => UniversalRenderable,
		])[]) {
			if (entry[0] === record.value) {
				selected = entry[1];
				break;
			}
		}
		return selected === null ? [] : [range(materialize(selected(), null))];
	}
	if (record?.$$kind === UNIVERSAL_FOR) {
		const output: FirstScreenNode[] = [];
		const keys = new Set<UniversalKey>();
		let index = 0;
		for (const item of record.items as Iterable<unknown>) {
			const itemKey = (record.key as (item: unknown, index: number) => UniversalKey)(item, index);
			if (keys.has(itemKey)) throw new Error(`Duplicate universal child key ${String(itemKey)}.`);
			keys.add(itemKey);
			const itemValue = (record.render as (item: unknown, index: number) => UniversalRenderable)(
				item,
				index++,
			);
			const component = itemValue as unknown as ComponentValue;
			const componentScope =
				record.componentScope === true &&
				component?.$$kind === UNIVERSAL_COMPONENT_VALUE &&
				component.renderer === 'lynx' &&
				!component.hasKey;
			let rendered: FirstScreenNode[];
			let templateProgram: FirstScreenProgramTemplate | undefined;
			if (componentScope) {
				const result = renderComponentResult(component.component, component.props.props);
				templateProgram = firstScreenProgramTemplate(result.value, result.nodes);
				rendered = [range(result.nodes)];
			} else {
				rendered = materialize(itemValue, null);
			}
			// `ownerless`/`compact` are compiler hints, not unconditional descriptor
			// semantics. The background Lynx client driver does not advertise the
			// compilerLeafProps capability, so universal-core deliberately falls back
			// to one logical owner range per item. The first-screen program must retain
			// those ranges too or every following host ID diverges during adoption.
			output.push(range(rendered, itemKey, componentScope, templateProgram));
		}
		if (index === 0 && typeof record.empty === 'function') {
			return [range(materialize((record.empty as () => UniversalRenderable)(), null))];
		}
		return output;
	}
	if (record?.$$kind === UNIVERSAL_CONTEXT) {
		const context = record.context as UniversalContext<unknown>;
		const owner = childOwner(currentOwner(), new Map([[context, record.value]]));
		return [
			range(
				withOwner(owner, () => {
					const children = record.children;
					return materialize(
						typeof children === 'function' ? (children as () => UniversalRenderable)() : children,
						null,
					);
				}),
			),
		];
	}
	if (record?.$$kind === UNIVERSAL_TRY) return renderTry(record);
	if (record?.$$kind === UNIVERSAL_ACTIVITY) {
		const visibility =
			currentOwner().visibility === 'hidden' || record.mode === 'hidden' ? 'hidden' : 'visible';
		const owner = childOwner(currentOwner(), null, visibility);
		return [
			range(
				withOwner(owner, () => materialize((record.body as () => UniversalRenderable)(), null)),
			),
		];
	}
	if (record?.$$kind === UNIVERSAL_PORTAL) {
		throw new Error('Lynx first-screen rendering does not support portals.');
	}
	if (Array.isArray(value)) {
		const output: FirstScreenNode[] = [];
		for (const child of value) output.push(...materialize(child, renderableKey(child)));
		return output;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		return [hostNode('#text', { value: String(value) }, [])];
	}
	throw new TypeError(
		`Unsupported Lynx first-screen child ${Object.prototype.toString.call(value)}.`,
	);
}

function assignIds(nodes: readonly FirstScreenNode[], attempt: FirstScreenAttempt): void {
	for (const node of nodes) {
		node.id = attempt.nextId++;
		if (node.kind === 'host') attempt.hostCount++;
		assignIds(node.children, attempt);
	}
}

function physicalChildren(
	nodes: readonly FirstScreenNode[],
	output: FirstScreenHost[] = [],
): FirstScreenHost[] {
	for (const node of nodes) {
		if (node.kind === 'host') output.push(node);
		else physicalChildren(node.children, output);
	}
	return output;
}

function selectFirstScreenTemplates(nodes: readonly FirstScreenNode[]): {
	readonly ranges: ReadonlyMap<FirstScreenRange, FirstScreenProgramTemplate>;
	readonly roots: ReadonlyMap<FirstScreenHost, FirstScreenProgramTemplate>;
} {
	const ranges = new Map<FirstScreenRange, FirstScreenProgramTemplate>();
	const roots = new Map<FirstScreenHost, FirstScreenProgramTemplate>();
	const visit = (
		children: readonly FirstScreenNode[],
		insideComponentScope: boolean,
		insideNativeList: boolean,
	): void => {
		for (const node of children) {
			if (node.kind === 'range') {
				if (node.componentScope && !insideComponentScope) {
					const template = node.templateProgram;
					if (
						template !== undefined &&
						node.key !== null &&
						!insideNativeList &&
						template.root.visibility === 'visible'
					) {
						ranges.set(node, template);
						roots.set(template.root, template);
						continue;
					}
				}
				visit(
					node.children,
					insideComponentScope || node.componentScope === true,
					insideNativeList,
				);
				continue;
			}
			visit(
				node.children,
				insideComponentScope,
				insideNativeList || node.type === 'list' || node.type === 'list-item',
			);
		}
	};
	visit(nodes, false, false);
	return { ranges, roots };
}

function templateCommand(
	template: FirstScreenProgramTemplate,
	parent: number | null,
): UniversalHostCommand {
	if (template.program.events.length !== 0 && template.firstListenerId === null) {
		throw new Error('Lynx first-screen template program lost its listener identity range.');
	}
	return {
		op: 'mount-template-range',
		parent,
		before: null,
		program: template.program,
		firstId: template.root.id,
		values: template.values,
		firstListenerId: template.firstListenerId,
	};
}

function stagePlacements(
	nodes: readonly FirstScreenNode[],
	commands: UniversalHostCommand[],
	templateRanges: ReadonlyMap<FirstScreenRange, FirstScreenProgramTemplate>,
	templateRoots: ReadonlyMap<FirstScreenHost, FirstScreenProgramTemplate>,
): void {
	for (const node of nodes) {
		if (node.kind === 'range' && templateRanges.has(node)) continue;
		stagePlacements(node.children, commands, templateRanges, templateRoots);
		if (node.kind !== 'host') continue;
		for (const child of physicalChildren(node.children)) {
			const template = templateRoots.get(child);
			commands.push(
				template === undefined
					? { op: 'insert', parent: node.id, id: child.id, before: null }
					: templateCommand(template, node.id),
			);
		}
	}
}

function stageCreates(
	nodes: readonly FirstScreenNode[],
	commands: UniversalHostCommand[],
	templateRanges: ReadonlyMap<FirstScreenRange, FirstScreenProgramTemplate>,
): void {
	for (const node of nodes) {
		if (node.kind === 'range' && templateRanges.has(node)) continue;
		if (node.kind === 'host') {
			commands.push({ op: 'create', id: node.id, type: node.type, props: node.props });
		}
		stageCreates(node.children, commands, templateRanges);
	}
}

function stageEvents(
	nodes: readonly FirstScreenNode[],
	commands: UniversalHostCommand[],
	templateRanges: ReadonlyMap<FirstScreenRange, FirstScreenProgramTemplate>,
	attempt: FirstScreenAttempt,
): void {
	const visit = (children: readonly FirstScreenNode[]): void => {
		for (const node of children) {
			if (node.kind === 'range') {
				const template = templateRanges.get(node);
				if (template !== undefined) {
					if (template.program.events.length !== 0) {
						template.firstListenerId = attempt.nextListener;
						attempt.nextListener += template.program.events.length;
					}
					continue;
				}
			}
			if (node.kind === 'host') {
				for (const [type, priority] of node.events) {
					commands.push({
						op: 'event',
						id: node.id,
						type,
						listener: { id: attempt.nextListener++, priority },
					});
				}
			}
			visit(node.children);
		}
	};
	visit(nodes);
}

function freezeBatch(commands: UniversalHostCommand[]): UniversalHostBatch {
	for (const command of commands) Object.freeze(command);
	return Object.freeze({ renderer: 'lynx', version: 1, commands: Object.freeze(commands) });
}

export interface LynxFirstScreenRenderResult {
	readonly batch: UniversalHostBatch;
	readonly hostCount: number;
	readonly logicalCount: number;
}

/** Evaluate one compiled root and produce the background-compatible initial host batch. */
export function renderLynxFirstScreen<Props>(
	component: UniversalComponent<Props>,
	props: Props,
): LynxFirstScreenRenderResult {
	if (CURRENT_ATTEMPT !== null)
		throw new Error('Lynx first-screen roots cannot render reentrantly.');
	const rootOwner: FirstScreenOwner = { parent: null, contexts: null, visibility: 'visible' };
	const attempt: FirstScreenAttempt = {
		owner: rootOwner,
		nextId: 1,
		// Universal roots reserve one million listener IDs per root. The main and
		// background programs have isolated module globals, so their first roots
		// both begin at the same deterministic listener seed.
		nextListener: 1_000_000,
		nextUniversalId: 1,
		hostCount: 0,
	};
	CURRENT_ATTEMPT = attempt;
	ACTIVE_FIRST_SCREEN_WARM_PLANS.length = 0;
	FIRST_SCREEN_WARM_DEPTH = 0;
	let nodes: FirstScreenNode[];
	try {
		const metadata = componentMetadata(component);
		if (metadata !== FIRST_SCREEN_LAZY_METADATA && metadata.id !== 'lynx') {
			throw new Error('Lynx first-screen root.render() requires a compiled Lynx component.');
		}
		nodes = materialize(component(props, componentContext()), null);
		assignIds(nodes, attempt);
	} catch (error) {
		if (error instanceof FirstScreenSuspense) {
			throw new Error(
				'Lynx first-screen rendering suspended without an authored @pending boundary; the synchronous first-screen pass cannot wait for lazy chunks or other asynchronous work.',
				{ cause: error.thenable },
			);
		}
		throw error;
	} finally {
		ACTIVE_FIRST_SCREEN_WARM_PLANS.length = 0;
		FIRST_SCREEN_WARM_DEPTH = 0;
		CURRENT_ATTEMPT = null;
	}

	const templates = selectFirstScreenTemplates(nodes);
	const commands: UniversalHostCommand[] = [];
	stageCreates(nodes, commands, templates.ranges);
	stageEvents(nodes, commands, templates.ranges, attempt);
	stagePlacements(nodes, commands, templates.ranges, templates.roots);
	for (const host of physicalChildren(nodes)) {
		const template = templates.roots.get(host);
		commands.push(
			template === undefined
				? { op: 'insert', parent: null, id: host.id, before: null }
				: templateCommand(template, null),
		);
	}
	const hidden: FirstScreenHost[] = [];
	const collectHiddenPostOrder = (children: readonly FirstScreenNode[]): void => {
		for (const child of children) {
			if (child.kind === 'range' && templates.ranges.has(child)) continue;
			collectHiddenPostOrder(child.children);
			if (child.kind === 'host' && child.visibility === 'hidden') hidden.push(child);
		}
	};
	collectHiddenPostOrder(nodes);
	for (const host of hidden) commands.push({ op: 'visibility', id: host.id, state: 'hidden' });
	return Object.freeze({
		batch: freezeBatch(commands),
		hostCount: attempt.hostCount,
		logicalCount: attempt.nextId - 1,
	});
}

export function hookSlots(count: number): number {
	const base = NEXT_HOOK_SLOT;
	NEXT_HOOK_SLOT += count;
	return base;
}

export function withSlot<T>(slot: unknown, fn: (...args: any[]) => T, ...args: any[]): T {
	SLOT_STACK.push(slot);
	try {
		return fn(...args);
	} finally {
		SLOT_STACK.pop();
	}
}

const NOOP_UPDATE = () => {};

export function useState<T>(
	initial: T | (() => T),
	_slot?: unknown,
): [T, (value: T | ((previous: T) => T)) => void, () => T] {
	currentOwner();
	const value = typeof initial === 'function' ? (initial as () => T)() : initial;
	return [value, NOOP_UPDATE, () => value];
}

export const __useStateWithGetter = useState;

export function useLinkedState<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	_optionsOrSlot?: LinkedStateOptions<Source, Value> | symbol | string | number,
	_slot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void] {
	currentOwner();
	return [reconcile(source, undefined), NOOP_UPDATE];
}

export function __useLinkedStateWithGetter<Source, Value>(
	source: Source,
	reconcile: (source: Source, previous: LinkedStatePrevious<Source, Value> | undefined) => Value,
	optionsOrSlot?: LinkedStateOptions<Source, Value> | symbol | string | number,
	slot?: unknown,
): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value] {
	const [value, setValue] = useLinkedState(source, reconcile, optionsOrSlot, slot);
	return [value, setValue, () => value];
}

export function useReducer<S, A, I = S>(
	_reducer: (state: S, action: A) => S,
	initialArg: I,
	initOrSlot?: ((value: I) => S) | unknown,
	_maybeSlot?: unknown,
): [S, (action: A) => void, () => S] {
	currentOwner();
	const value =
		typeof initOrSlot === 'function'
			? (initOrSlot as (value: I) => S)(initialArg)
			: (initialArg as unknown as S);
	return [value, NOOP_UPDATE, () => value];
}

export const __useReducerWithGetter = useReducer;

export function useInsertionEffect(): void {
	currentOwner();
}
export function useLayoutEffect(): void {
	currentOwner();
}
export function useEffect(): void {
	currentOwner();
}

export function useMemo<T>(
	compute: () => T,
	_deps?: readonly unknown[] | null,
	_slot?: unknown,
): T {
	currentOwner();
	return compute();
}

export function useCallback<T extends (...args: any[]) => any>(
	callback: T,
	_deps?: readonly unknown[] | null,
	_slot?: unknown,
): T {
	currentOwner();
	return callback;
}

export function useRef<T>(initial: T, _slot?: unknown): { current: T } {
	currentOwner();
	return { current: initial };
}

export function useId(_slot?: unknown): string {
	const attempt = currentAttempt();
	const index = attempt.nextUniversalId++;
	const sum = 1 + index;
	const paired = (sum * (sum + 1)) / 2 + index;
	return `:octane-u${paired.toString(36)}:`;
}

export function useSyncExternalStore<T>(
	_subscribe: (onStoreChange: () => void) => () => void,
	getSnapshot: () => T,
): T {
	currentOwner();
	return getSnapshot();
}

export function useDeferredValue<T>(value: T): T {
	currentOwner();
	return value;
}

export function startTransition(_fn: () => void | Promise<unknown>): void {}

export function useTransition(_slot?: unknown): [boolean, typeof startTransition] {
	currentOwner();
	return [false, startTransition];
}

export function useActionState<State, Payload>(
	_action: (previousState: State, payload: Payload) => State | Promise<State>,
	initialState: State,
): [State, (payload: Payload) => void, boolean] {
	currentOwner();
	return [initialState, NOOP_UPDATE, false];
}

export interface FormStatus {
	pending: boolean;
	data: unknown;
	method: string | null;
	action: string | ((formData: unknown) => void | Promise<void>) | null;
}

const FORM_STATUS: FormStatus = Object.freeze({
	pending: false,
	data: null,
	method: null,
	action: null,
});

export function useFormStatus(): FormStatus {
	currentOwner();
	return FORM_STATUS;
}

export function useOptimistic<State, Action = State>(
	passthrough: State,
	_reducer?: (state: State, action: Action) => State,
): [State, (action: Action) => void] {
	currentOwner();
	return [passthrough, NOOP_UPDATE];
}

export function useContext<T>(context: UniversalContext<T>): T {
	for (let owner: FirstScreenOwner | null = currentOwner(); owner !== null; owner = owner.parent) {
		if (owner.contexts?.has(context)) return owner.contexts.get(context) as T;
	}
	return context.defaultValue;
}

function trackThenable<T>(thenable: TrackedThenable<T>): void {
	if (
		thenable.status === 'pending' ||
		thenable.status === 'fulfilled' ||
		thenable.status === 'rejected'
	) {
		return;
	}
	thenable.status = 'pending';
	thenable.then(
		(value) => {
			thenable.status = 'fulfilled';
			thenable.value = value;
		},
		(error) => {
			thenable.status = 'rejected';
			thenable.reason = error;
		},
	);
}

export function use<T>(usable: UniversalContext<T> | PromiseLike<T>): T {
	if ((usable as UniversalContext<T>).$$kind === CONTEXT_TAG)
		return useContext(usable as UniversalContext<T>);
	const thenable = usable as TrackedThenable<T>;
	if (thenable.status === 'fulfilled') return thenable.value as T;
	if (thenable.status === 'rejected') throw thenable.reason;
	trackThenable(thenable);
	throw new FirstScreenSuspense(thenable);
}

function warmFirstScreenPlan(plan: () => void): void {
	if (FIRST_SCREEN_WARM_DEPTH >= FIRST_SCREEN_WARM_DEPTH_CAP) return;
	FIRST_SCREEN_WARM_DEPTH++;
	try {
		plan();
	} catch {
		// Warming is speculative and cannot replace the authored pending arm.
	} finally {
		FIRST_SCREEN_WARM_DEPTH--;
	}
}

export function useBatch(items: any[], warm?: () => void): void {
	if (items.length === 0) {
		if (warm !== undefined) ACTIVE_FIRST_SCREEN_WARM_PLANS.push(warm);
		return;
	}
	let pending: TrackedThenable[] | null = null;
	for (const item of items) {
		if (item == null || typeof item.then !== 'function') continue;
		const thenable = item as TrackedThenable;
		trackThenable(thenable);
		if (thenable.status === 'rejected') break;
		if (thenable.status === 'pending') (pending ??= []).push(thenable);
	}
	if (pending === null) return;
	for (let index = 0; index < ACTIVE_FIRST_SCREEN_WARM_PLANS.length; index++) {
		warmFirstScreenPlan(ACTIVE_FIRST_SCREEN_WARM_PLANS[index]);
	}
	if (warm !== undefined) warmFirstScreenPlan(warm);
	if (pending.length === 1) throw new FirstScreenSuspense(pending[0]);
	throw new FirstScreenSuspense(Promise.all(pending));
}

export function warmMemo(): void {}

/** Compiler ABI: warm plans belong only to the component that declared them. */
export function markWarm<T extends Function>(component: T, plan: unknown): T {
	Object.defineProperty(component, '__warm', {
		configurable: true,
		get() {
			return this === component ? plan : undefined;
		},
	});
	return component;
}

export function warmChild(component: any, props: any): void {
	if (FIRST_SCREEN_WARM_DEPTH === 0 || component == null) return;
	const plan = component.__warm;
	if (typeof plan === 'function') warmFirstScreenPlan(() => plan(props));
}

export function useImperativeHandle(): void {
	currentOwner();
}

export function useEffectEvent<T extends (...args: any[]) => any>(_fn: T, _slot?: unknown): T {
	currentOwner();
	return NOOP_UPDATE as T;
}

export function useDebugValue(): void {
	currentOwner();
}

export function requestFormReset(): void {}

export function memo<P>(component: UniversalComponent<P>): UniversalComponent<P> {
	return component;
}

export function createPortal(children: UniversalRenderable, target: unknown): UniversalRenderable {
	return { $$kind: UNIVERSAL_PORTAL, children, target } as never;
}

export const Activity: unique symbol = Symbol.for('octane.Activity') as never;

export interface NativeUniversalContext<T> extends UniversalContext<T> {
	(props: {
		value: T;
		children?: UniversalRenderable | (() => UniversalRenderable);
	}): UniversalRenderable;
	readonly Provider: NativeUniversalContext<T>;
}

export function createContext<T>(defaultValue: T): NativeUniversalContext<T> {
	const context = ((props: {
		value: T;
		children?: UniversalRenderable | (() => UniversalRenderable);
	}) => universalContext(context, props.value, props.children)) as NativeUniversalContext<T>;
	Object.defineProperties(context, {
		$$kind: { value: CONTEXT_TAG, enumerable: true },
		defaultValue: { value: defaultValue, enumerable: true },
		Provider: { value: context, enumerable: true },
		$$version: { value: 0, enumerable: true, writable: true },
	});
	return context;
}
