/**
 * Experimental host-neutral renderer core.
 *
 * This module deliberately does not generalise the DOM runtime. Compiled
 * universal components produce immutable host plans plus dynamic values. A
 * root materialises those plans into core-owned logical records, stages one
 * ordered host batch, and publishes topology/refs/effects only after the
 * driver accepts that batch.
 *
 * @experimental This subpath is an internal-first renderer proving surface and
 * may change in patch releases until real Three and transported renderers
 * validate the protocol.
 */
import {
	type Context,
	type Scope,
	useContext as useDomContext,
	useLayoutEffect as useDomLayoutEffect,
	useState as useDomState,
} from './runtime.js';

const UNIVERSAL_PLAN = Symbol.for('octane.universal.plan');
const UNIVERSAL_VALUE = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST = Symbol.for('octane.universal.list');
const UNIVERSAL_COMPONENT = Symbol.for('octane.universal.component');
const UNIVERSAL_BOUNDARY = Symbol.for('octane.universal.boundary');

export type UniversalKey = string | number | symbol | bigint;

export interface UniversalRendererMetadata {
	readonly id: string;
	readonly module?: string;
	readonly target: 'universal';
}

export interface UniversalBoundaryMetadata {
	readonly id: string;
	readonly ownerRenderer: string;
	readonly childRenderer: string;
	readonly childrenProp: string;
}

export interface UniversalHostPlan {
	readonly kind: 'host';
	readonly type: string;
	readonly props?: Readonly<Record<string, unknown>>;
	readonly bindings?: readonly (readonly [name: string, slot: number])[];
	readonly children?: readonly UniversalPlanNode[];
}

export interface UniversalTextPlan {
	readonly kind: 'text';
	readonly value?: string;
	readonly slot?: number;
}

export interface UniversalSlotPlan {
	readonly kind: 'slot';
	readonly slot: number;
}

export interface UniversalRangePlan {
	readonly kind: 'range';
	readonly children: readonly UniversalPlanNode[];
}

export type UniversalPlanNode =
	| UniversalHostPlan
	| UniversalTextPlan
	| UniversalSlotPlan
	| UniversalRangePlan;

export interface UniversalPlan {
	readonly $$kind: typeof UNIVERSAL_PLAN;
	readonly renderer: string;
	readonly root: UniversalPlanNode;
}

export interface UniversalPlanValue {
	readonly $$kind: typeof UNIVERSAL_VALUE;
	readonly plan: UniversalPlan;
	readonly values: readonly unknown[];
	readonly key: UniversalKey | null;
}

interface UniversalListValue {
	readonly $$kind: typeof UNIVERSAL_LIST;
	readonly values: readonly UniversalPlanValue[];
}

export type UniversalComponent<P = any> = ((
	props: P,
	context: UniversalRenderContext,
) => UniversalPlanValue) & {
	readonly [UNIVERSAL_COMPONENT]: UniversalRendererMetadata;
};

export interface UniversalRenderContext {
	readonly renderer: string;
	readContext<T>(context: Context<T>): T;
	insertionEffect(create: () => void | (() => void), deps?: readonly unknown[]): void;
	layoutEffect(create: () => void | (() => void), deps?: readonly unknown[]): void;
	effect(create: () => void | (() => void), deps?: readonly unknown[]): void;
}

export type UniversalHostCommand =
	| {
			readonly op: 'create';
			readonly id: number;
			readonly type: string;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'update';
			readonly id: number;
			readonly props: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly op: 'insert' | 'move';
			readonly parent: number | null;
			readonly id: number;
			readonly before: number | null;
	  }
	| { readonly op: 'remove'; readonly parent: number | null; readonly id: number }
	| { readonly op: 'destroy'; readonly id: number };

export interface UniversalHostBatch {
	readonly renderer: string;
	readonly version: number;
	readonly commands: readonly UniversalHostCommand[];
}

export interface UniversalHostDriver<Container = unknown, PublicInstance = unknown> {
	readonly id: string;
	readonly capabilities?: ReadonlySet<string>;
	/** Apply a fully validated ordered batch atomically. */
	commit(container: Container, batch: UniversalHostBatch): void;
	getPublicInstance(container: Container, id: number): PublicInstance | null;
}

export interface UniversalCommitTransport<Container = unknown> {
	commit(
		container: Container,
		batch: UniversalHostBatch,
		apply: (batch: UniversalHostBatch) => void,
	): void;
}

export interface UniversalRootOptions<Container> {
	transport?: UniversalCommitTransport<Container>;
}

export interface UniversalTransaction {
	readonly status: 'prepared' | 'committed' | 'aborted';
	readonly batch: UniversalHostBatch;
	commit(): void;
	abort(): void;
}

export interface UniversalSuspendedAttempt {
	readonly status: 'suspended' | 'aborted';
	readonly thenable: PromiseLike<unknown>;
	abort(): void;
}

export type UniversalPreparedAttempt = UniversalTransaction | UniversalSuspendedAttempt;

export interface UniversalRoot<P = any> {
	readonly renderer: string;
	prepare(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	render(component: UniversalComponent<P>, props: P): UniversalPreparedAttempt;
	unmount(): void;
}

interface BlueprintRange {
	kind: 'range';
	key: UniversalKey | null;
	children: BlueprintNode[];
}

interface BlueprintHost {
	kind: 'host';
	key: UniversalKey | null;
	type: string;
	props: Record<string, unknown>;
	ref: unknown;
	children: BlueprintNode[];
}

type BlueprintNode = BlueprintRange | BlueprintHost;

interface LogicalRecord {
	id: number;
	kind: 'range' | 'host';
	key: UniversalKey | null;
	type: string | null;
	props: Record<string, unknown>;
	ref: unknown;
	refCleanup: (() => void) | null;
	refAttached: boolean;
	parent: LogicalRecord | null;
	children: LogicalRecord[];
}

interface DraftRecord {
	record: LogicalRecord;
	blueprint: BlueprintNode;
	children: DraftRecord[];
	isNew: boolean;
}

type EffectPhase = 'insertion' | 'layout' | 'passive';

interface StateHook<T = unknown> {
	kind: 'state';
	value: T;
	set: (value: T | ((previous: T) => T)) => void;
	get: () => T;
}

interface ReducerHook<S = unknown, A = unknown> {
	kind: 'reducer';
	value: S;
	reducer: (state: S, action: A) => S;
	dispatch: (action: A) => void;
	get: () => S;
}

interface MemoHook<T = unknown> {
	kind: 'memo';
	value: T;
	deps: readonly unknown[] | null;
}

interface RefHook<T = unknown> {
	kind: 'ref';
	value: { current: T };
}

interface EffectHook {
	kind: 'effect';
	slot: unknown;
	phase: EffectPhase;
	create: () => void | (() => void);
	deps: readonly unknown[] | null;
	cleanup: (() => void) | null;
	mounted: boolean;
	previous: EffectHook | null;
}

type UniversalHook = StateHook | ReducerHook | MemoHook | RefHook | EffectHook;

interface UniversalOwnerRecord {
	readonly root: UniversalRootImpl<any, any>;
	readonly renderer: string;
	hooks: Map<unknown, UniversalHook>;
	effectOrder: EffectHook[];
	disposed: boolean;
	bridge: BoundaryOwner | null;
}

interface BoundaryOwner {
	readContext<T>(context: Context<T>): T;
	invalidate(): void;
}

interface RenderAttempt {
	owner: UniversalOwnerRecord;
	hooks: Map<unknown, UniversalHook>;
	seenEffects: EffectHook[];
	implicitSlot: number;
}

let CURRENT_ATTEMPT: RenderAttempt | null = null;
let NEXT_HOOK_SLOT = 0;
const UNIVERSAL_SLOT_STACK: unknown[] = [];

class UniversalSuspense {
	constructor(readonly thenable: PromiseLike<unknown>) {}
}

class UniversalSuspendedAttemptImpl implements UniversalSuspendedAttempt {
	private state: 'suspended' | 'aborted' = 'suspended';

	constructor(
		private readonly root: UniversalRootImpl<any, any>,
		readonly thenable: PromiseLike<unknown>,
	) {
		thenable.then(
			() => this.settle(),
			() => this.settle(),
		);
	}

	get status(): 'suspended' | 'aborted' {
		return this.state;
	}

	private settle(): void {
		if (this.state !== 'suspended') return;
		this.root.finishSuspension(this, true);
	}

	abort(): void {
		if (this.state !== 'suspended') return;
		this.state = 'aborted';
		this.root.finishSuspension(this, false);
	}
}

function assertRendererId(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError(`${label} must be a non-empty renderer id.`);
	}
}

function freezePlanNode(node: UniversalPlanNode): UniversalPlanNode {
	if (node.kind === 'host') {
		if (typeof node.type !== 'string' || node.type === '') {
			throw new TypeError('A universal host plan requires a non-empty string type.');
		}
		const props = Object.freeze({ ...(node.props ?? {}) });
		const bindings = Object.freeze(
			(node.bindings ?? []).map((binding) => Object.freeze([binding[0], binding[1]] as const)),
		);
		const children = Object.freeze((node.children ?? []).map(freezePlanNode));
		return Object.freeze({ kind: 'host', type: node.type, props, bindings, children });
	}
	if (node.kind === 'range') {
		return Object.freeze({
			kind: 'range',
			children: Object.freeze(node.children.map(freezePlanNode)),
		});
	}
	if (node.kind === 'slot') {
		return Object.freeze({ kind: 'slot', slot: node.slot });
	}
	return Object.freeze({
		kind: 'text',
		...(node.value === undefined ? null : { value: node.value }),
		...(node.slot === undefined ? null : { slot: node.slot }),
	});
}

export function universalPlan(renderer: string, root: UniversalPlanNode): UniversalPlan {
	assertRendererId(renderer, 'universalPlan renderer');
	return Object.freeze({ $$kind: UNIVERSAL_PLAN, renderer, root: freezePlanNode(root) });
}

export function universalValue(
	plan: UniversalPlan,
	values: readonly unknown[] = [],
	key: UniversalKey | null = null,
): UniversalPlanValue {
	if (plan?.$$kind !== UNIVERSAL_PLAN)
		throw new TypeError('universalValue expected a universal plan.');
	return { $$kind: UNIVERSAL_VALUE, plan, values, key };
}

export function universalKey(key: UniversalKey, value: UniversalPlanValue): UniversalPlanValue {
	if (value?.$$kind !== UNIVERSAL_VALUE) {
		throw new TypeError('universalKey expected a universal plan value.');
	}
	return { ...value, key };
}

export function universalList<T>(
	items: Iterable<T>,
	render: (item: T, index: number) => UniversalPlanValue,
): UniversalListValue {
	const values: UniversalPlanValue[] = [];
	let index = 0;
	const keys = new Set<UniversalKey>();
	for (const item of items) {
		const value = render(item, index++);
		if (value?.$$kind !== UNIVERSAL_VALUE || value.key === null) {
			throw new Error('Universal keyed lists require every item to have an explicit key.');
		}
		if (keys.has(value.key)) throw new Error(`Duplicate universal list key ${String(value.key)}.`);
		keys.add(value.key);
		values.push(value);
	}
	return { $$kind: UNIVERSAL_LIST, values };
}

export function defineUniversalComponent<P>(
	renderer: string,
	render: (props: P, context: UniversalRenderContext) => UniversalPlanValue,
	metadata?: { module?: string },
): UniversalComponent<P> {
	assertRendererId(renderer, 'defineUniversalComponent renderer');
	if (typeof render !== 'function')
		throw new TypeError('defineUniversalComponent expected a function.');
	Object.defineProperty(render, UNIVERSAL_COMPONENT, {
		configurable: false,
		enumerable: false,
		value: Object.freeze({ id: renderer, module: metadata?.module, target: 'universal' }),
	});
	return render as UniversalComponent<P>;
}

function getComponentMetadata(component: UniversalComponent): UniversalRendererMetadata {
	const metadata = component?.[UNIVERSAL_COMPONENT];
	if (metadata === undefined) {
		throw new Error('Universal roots accept only compiler-defined universal components.');
	}
	return metadata;
}

function materializeValue(
	value: unknown,
	expectedRenderer: string,
	key: UniversalKey | null,
): BlueprintNode[] {
	if (value == null || value === false || value === true) return [];
	if ((value as UniversalListValue)?.$$kind === UNIVERSAL_LIST) {
		const output: BlueprintNode[] = [];
		for (const item of (value as UniversalListValue).values) {
			output.push(...materializePlanValue(item, expectedRenderer));
		}
		return output;
	}
	if ((value as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
		const planValue = value as UniversalPlanValue;
		const nodes = materializePlanValue(planValue, expectedRenderer);
		if (key !== null && nodes.length === 1) nodes[0].key = key;
		return nodes;
	}
	if (Array.isArray(value)) {
		const output: BlueprintNode[] = [];
		for (const child of value) output.push(...materializeValue(child, expectedRenderer, null));
		return output;
	}
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		return [
			{
				kind: 'host',
				key,
				type: '#text',
				props: { value: String(value) },
				ref: null,
				children: [],
			},
		];
	}
	throw new TypeError(
		`Unsupported universal dynamic child ${Object.prototype.toString.call(value)}.`,
	);
}

function materializeNode(
	node: UniversalPlanNode,
	values: readonly unknown[],
	renderer: string,
): BlueprintNode[] {
	if (node.kind === 'slot') return materializeValue(values[node.slot], renderer, null);
	if (node.kind === 'text') {
		const value = node.slot === undefined ? (node.value ?? '') : values[node.slot];
		return materializeValue(value, renderer, null);
	}
	if (node.kind === 'range') {
		const children: BlueprintNode[] = [];
		for (const child of node.children) children.push(...materializeNode(child, values, renderer));
		return [{ kind: 'range', key: null, children }];
	}
	const props: Record<string, unknown> = { ...(node.props ?? {}) };
	for (const [name, slot] of node.bindings ?? []) props[name] = values[slot];
	const ref = props.ref ?? null;
	delete props.ref;
	delete props.key;
	const children: BlueprintNode[] = [];
	for (const child of node.children ?? [])
		children.push(...materializeNode(child, values, renderer));
	return [{ kind: 'host', key: null, type: node.type, props, ref, children }];
}

function materializePlanValue(
	value: UniversalPlanValue,
	expectedRenderer: string,
): BlueprintNode[] {
	if (value.plan.renderer !== expectedRenderer) {
		throw new Error(
			`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(value.plan.renderer)}.`,
		);
	}
	const nodes = materializeNode(value.plan.root, value.values, expectedRenderer);
	if (value.key === null) return nodes;
	if (nodes.length === 1) {
		nodes[0].key = value.key;
		return nodes;
	}
	return [{ kind: 'range', key: value.key, children: nodes }];
}

function assertBlueprintCapabilities(
	nodes: readonly BlueprintNode[],
	renderer: string,
	capabilities: ReadonlySet<string> | undefined,
): void {
	for (const node of nodes) {
		if (node.kind === 'host' && node.type === '#text' && !capabilities?.has('text')) {
			throw new Error(
				`Universal renderer ${JSON.stringify(renderer)} does not declare the text capability.`,
			);
		}
		assertBlueprintCapabilities(node.children, renderer, capabilities);
	}
}

function sameRecordShape(record: LogicalRecord, blueprint: BlueprintNode): boolean {
	return (
		record.kind === blueprint.kind &&
		Object.is(record.key, blueprint.key) &&
		(record.kind !== 'host' || record.type === (blueprint as BlueprintHost).type)
	);
}

function createLogicalRecord(id: number, blueprint: BlueprintNode): LogicalRecord {
	return {
		id,
		kind: blueprint.kind,
		key: blueprint.key,
		type: blueprint.kind === 'host' ? blueprint.type : null,
		props: {},
		ref: null,
		refCleanup: null,
		refAttached: false,
		parent: null,
		children: [],
	};
}

function shallowPropsEqual(
	left: Readonly<Record<string, unknown>>,
	right: Readonly<Record<string, unknown>>,
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const key of leftKeys) {
		if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.is(left[key], right[key])) {
			return false;
		}
	}
	return true;
}

function physicalRecords(records: readonly LogicalRecord[]): LogicalRecord[] {
	const output: LogicalRecord[] = [];
	for (const record of records) {
		if (record.kind === 'host') output.push(record);
		else output.push(...physicalRecords(record.children));
	}
	return output;
}

function physicalDrafts(records: readonly DraftRecord[]): DraftRecord[] {
	const output: DraftRecord[] = [];
	for (const record of records) {
		if (record.record.kind === 'host') output.push(record);
		else output.push(...physicalDrafts(record.children));
	}
	return output;
}

function walkLogical(record: LogicalRecord, visit: (record: LogicalRecord) => void): void {
	visit(record);
	for (const child of record.children) walkLogical(child, visit);
}

function walkDraft(record: DraftRecord, visit: (record: DraftRecord) => void): void {
	visit(record);
	for (const child of record.children) walkDraft(child, visit);
}

function walkDraftPostOrder(record: DraftRecord, visit: (record: DraftRecord) => void): void {
	for (const child of record.children) walkDraftPostOrder(child, visit);
	visit(record);
}

function collectRemovedPostOrder(record: LogicalRecord, output: LogicalRecord[]): void {
	for (const child of record.children) collectRemovedPostOrder(child, output);
	if (record.kind === 'host') output.push(record);
}

function detachRef(
	record: LogicalRecord,
	ref: unknown = record.ref,
	refCleanup: (() => void) | null = record.refCleanup,
): void {
	if (ref == null || !record.refAttached) return;
	record.refAttached = false;
	if (refCleanup !== null) {
		if (record.refCleanup === refCleanup) record.refCleanup = null;
		refCleanup();
		return;
	}
	if (typeof ref === 'function') ref(null);
	else if (typeof ref === 'object') (ref as { current: unknown }).current = null;
}

function attachRef(record: LogicalRecord, value: unknown): void {
	const ref = record.ref;
	if (ref == null) return;
	record.refAttached = true;
	if (typeof ref === 'function') {
		const cleanup = ref(value);
		record.refCleanup = typeof cleanup === 'function' ? cleanup : null;
	} else if (typeof ref === 'object') {
		(ref as { current: unknown }).current = value;
	}
}

function runCommitTasks(tasks: readonly (() => void)[]): void {
	let hasError = false;
	let firstError: unknown;
	for (const task of tasks) {
		try {
			task();
		} catch (error) {
			if (!hasError) {
				hasError = true;
				firstError = error;
			}
		}
	}
	if (hasError) throw firstError;
}

function depsEqual(left: readonly unknown[] | null, right: readonly unknown[] | null): boolean {
	if (left === null || right === null || left.length !== right.length) return false;
	for (let index = 0; index < left.length; index++) {
		if (!Object.is(left[index], right[index])) return false;
	}
	return true;
}

function currentAttempt(): RenderAttempt {
	if (CURRENT_ATTEMPT === null) {
		throw new Error('Universal hooks may only run while a universal component is rendering.');
	}
	return CURRENT_ATTEMPT;
}

function resolveHookSlot(slot: unknown): unknown {
	const attempt = currentAttempt();
	const own = slot ?? `implicit:${attempt.implicitSlot++}`;
	if (UNIVERSAL_SLOT_STACK.length === 0) return own;
	let key = '@octane:universal-hook:';
	for (const part of [...UNIVERSAL_SLOT_STACK, own]) {
		const value =
			typeof part === 'symbol'
				? `s${part.description?.length ?? 0}:${part.description ?? ''}`
				: `v${String(part).length}:${String(part)}`;
		key += value;
	}
	return Symbol.for(key);
}

export function hookSlots(count: number): number {
	const base = NEXT_HOOK_SLOT;
	NEXT_HOOK_SLOT += count;
	return base;
}

export function withSlot<T>(slot: unknown, fn: (...args: any[]) => T, ...args: any[]): T {
	UNIVERSAL_SLOT_STACK.push(slot);
	try {
		return fn(...args);
	} finally {
		UNIVERSAL_SLOT_STACK.pop();
	}
}

function scheduleOwner(owner: UniversalOwnerRecord): void {
	if (!owner.disposed) owner.root.schedule();
}

export function useState<T>(
	initial: T | (() => T),
	slot?: unknown,
): [T, (value: T | ((previous: T) => T)) => void, () => T] {
	const attempt = currentAttempt();
	const resolved = resolveHookSlot(slot);
	let hook = attempt.hooks.get(resolved) as StateHook<T> | undefined;
	if (hook?.kind !== 'state') {
		const owner = attempt.owner;
		hook = {
			kind: 'state',
			value: typeof initial === 'function' ? (initial as () => T)() : initial,
			set(value) {
				const live = owner.hooks.get(resolved) as StateHook<T> | undefined;
				if (live?.kind !== 'state') return;
				const next =
					typeof value === 'function' ? (value as (previous: T) => T)(live.value) : value;
				if (Object.is(next, live.value)) return;
				live.value = next;
				scheduleOwner(owner);
			},
			get() {
				const live = owner.hooks.get(resolved) as StateHook<T> | undefined;
				return live?.kind === 'state' ? live.value : hook!.value;
			},
		};
		attempt.hooks.set(resolved, hook as UniversalHook);
	}
	return [hook.value, hook.set, hook.get];
}

export const __useStateWithGetter = useState;

export function useReducer<S, A, I = S>(
	reducer: (state: S, action: A) => S,
	initialArg: I,
	initOrSlot?: ((value: I) => S) | unknown,
	maybeSlot?: unknown,
): [S, (action: A) => void, () => S] {
	const init = typeof initOrSlot === 'function' ? (initOrSlot as (value: I) => S) : null;
	const slot = maybeSlot ?? (init === null ? initOrSlot : undefined);
	const attempt = currentAttempt();
	const resolved = resolveHookSlot(slot);
	let hook = attempt.hooks.get(resolved) as ReducerHook<S, A> | undefined;
	if (hook?.kind !== 'reducer') {
		const owner = attempt.owner;
		hook = {
			kind: 'reducer',
			value: init === null ? (initialArg as unknown as S) : init(initialArg),
			reducer,
			dispatch(action) {
				const live = owner.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				if (live?.kind !== 'reducer') return;
				live.value = live.reducer(live.value, action);
				scheduleOwner(owner);
			},
			get() {
				const live = owner.hooks.get(resolved) as ReducerHook<S, A> | undefined;
				return live?.kind === 'reducer' ? live.value : hook!.value;
			},
		};
		attempt.hooks.set(resolved, hook as UniversalHook);
	} else if (hook.reducer !== reducer) {
		hook = { ...hook, reducer };
		attempt.hooks.set(resolved, hook as UniversalHook);
	}
	return [hook.value, hook.dispatch, hook.get];
}

export const __useReducerWithGetter = useReducer;

function enqueueUniversalEffect(
	phase: EffectPhase,
	create: () => void | (() => void),
	deps: readonly unknown[] | null | undefined,
	slot?: unknown,
): void {
	const attempt = currentAttempt();
	const resolved = resolveHookSlot(slot);
	const previous = attempt.owner.hooks.get(resolved) as EffectHook | undefined;
	const hook: EffectHook = {
		kind: 'effect',
		slot: resolved,
		phase,
		create,
		deps: deps === undefined ? null : deps,
		cleanup: previous?.kind === 'effect' ? previous.cleanup : null,
		mounted: previous?.kind === 'effect' ? previous.mounted : false,
		previous: previous?.kind === 'effect' ? previous : null,
	};
	attempt.hooks.set(resolved, hook);
	attempt.seenEffects.push(hook);
}

export function useInsertionEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('insertion', create, deps, slot);
}

export function useLayoutEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('layout', create, deps, slot);
}

export function useEffect(
	create: () => void | (() => void),
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	enqueueUniversalEffect('passive', create, deps, slot);
}

export function useMemo<T>(compute: () => T, deps?: readonly unknown[] | null, slot?: unknown): T {
	const attempt = currentAttempt();
	const resolved = resolveHookSlot(slot);
	const previous = attempt.hooks.get(resolved) as MemoHook<T> | undefined;
	const normalized = deps === undefined ? null : deps;
	if (previous?.kind === 'memo' && depsEqual(previous.deps, normalized)) return previous.value;
	const value = (compute as (...args: unknown[]) => T)(...(normalized ?? []));
	attempt.hooks.set(resolved, { kind: 'memo', value, deps: normalized });
	return value;
}

export function useCallback<T extends (...args: any[]) => any>(
	callback: T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): T {
	return useMemo(() => callback, deps, slot);
}

export function useRef<T>(initial: T, slot?: unknown): { current: T } {
	const attempt = currentAttempt();
	const resolved = resolveHookSlot(slot);
	let hook = attempt.hooks.get(resolved) as RefHook<T> | undefined;
	if (hook?.kind !== 'ref') {
		hook = { kind: 'ref', value: { current: initial } };
		attempt.hooks.set(resolved, hook);
	}
	return hook.value;
}

export function useContext<T>(context: Context<T>): T {
	const attempt = currentAttempt();
	return attempt.owner.bridge?.readContext(context) ?? context.defaultValue;
}

export function use<T>(usable: Context<T> | PromiseLike<T>): T {
	if ((usable as Context<T>)?.$$kind === Symbol.for('octane.context')) {
		return useContext(usable as Context<T>);
	}
	const thenable = usable as PromiseLike<T> & {
		status?: 'pending' | 'fulfilled' | 'rejected';
		value?: T;
		reason?: unknown;
	};
	if (thenable.status === 'fulfilled') return thenable.value as T;
	if (thenable.status === 'rejected') throw thenable.reason;
	if (thenable.status !== 'pending') {
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
	throw new UniversalSuspense(thenable);
}

export function useImperativeHandle<T>(
	ref: { current: T | null } | ((value: T | null) => void) | null,
	create: () => T,
	deps?: readonly unknown[] | null,
	slot?: unknown,
): void {
	useLayoutEffect(
		() => {
			const value = create();
			if (typeof ref === 'function') ref(value);
			else if (ref !== null) ref.current = value;
			return () => {
				if (typeof ref === 'function') ref(null);
				else if (ref !== null) ref.current = null;
			};
		},
		deps,
		slot,
	);
}

export function useEffectEvent<T extends (...args: any[]) => any>(fn: T, slot?: unknown): T {
	const ref = useRef(fn, slot);
	ref.current = fn;
	return useMemo(
		() => ((...args: any[]) => ref.current(...args)) as T,
		[],
		`${String(slot)}:event`,
	);
}

export function useDebugValue(): void {}

export function startTransition(fn: () => void | Promise<unknown>): void {
	void fn();
}

export function createPortal(): never {
	throw new Error('The active universal renderer does not declare the portal capability.');
}

export const Activity: unique symbol = Symbol.for('octane.universal.unsupported.Activity') as any;

function runEffectCreate(hook: EffectHook): void {
	const cleanup = (hook.create as (...args: unknown[]) => void | (() => void))(
		...(hook.deps ?? []),
	);
	hook.cleanup = typeof cleanup === 'function' ? cleanup : null;
	hook.mounted = true;
}

function runEffectCleanup(hook: EffectHook): void {
	const cleanup = hook.cleanup;
	hook.cleanup = null;
	hook.mounted = false;
	cleanup?.();
}

class UniversalRootImpl<Container, PublicInstance> implements UniversalRoot<any> {
	readonly renderer: string;
	private readonly rootRecord: LogicalRecord;
	private readonly owner: UniversalOwnerRecord;
	private nextId = 1;
	private version = 0;
	private pending: UniversalTransactionImpl<Container, PublicInstance> | null = null;
	private suspended: UniversalSuspendedAttemptImpl | null = null;
	private lastComponent: UniversalComponent<any> | null = null;
	private lastProps: any;
	private scheduled = false;
	private passiveScheduled = false;
	private readonly passiveTasks: (() => void)[] = [];

	constructor(
		private readonly container: Container,
		private readonly driver: UniversalHostDriver<Container, PublicInstance>,
		private readonly transport: UniversalCommitTransport<Container> | null,
	) {
		assertRendererId(driver.id, 'Universal driver id');
		this.renderer = driver.id;
		this.rootRecord = {
			id: 0,
			kind: 'range',
			key: null,
			type: null,
			props: {},
			ref: null,
			refCleanup: null,
			refAttached: false,
			parent: null,
			children: [],
		};
		this.owner = {
			root: this,
			renderer: driver.id,
			hooks: new Map(),
			effectOrder: [],
			disposed: false,
			bridge: null,
		};
	}

	setBridge(bridge: BoundaryOwner): void {
		if (this.owner.bridge !== null && this.owner.bridge !== bridge) {
			throw new Error('A universal root cannot be owned by more than one host boundary.');
		}
		this.owner.bridge = bridge;
	}

	clearBridge(bridge: BoundaryOwner): void {
		if (this.owner.bridge === bridge) this.owner.bridge = null;
	}

	schedule(): void {
		if (this.owner.disposed || this.lastComponent === null || this.scheduled) return;
		this.scheduled = true;
		const bridge = this.owner.bridge;
		if (bridge !== null) {
			bridge.invalidate();
			this.scheduled = false;
			return;
		}
		queueMicrotask(() => {
			this.scheduled = false;
			if (!this.owner.disposed && this.lastComponent !== null) {
				this.render(this.lastComponent, this.lastProps);
			}
		});
	}

	private suspend(thenable: PromiseLike<unknown>): UniversalSuspendedAttempt {
		const attempt = new UniversalSuspendedAttemptImpl(this, thenable);
		this.suspended = attempt;
		return attempt;
	}

	finishSuspension(attempt: UniversalSuspendedAttemptImpl, schedule: boolean): void {
		if (this.suspended !== attempt) return;
		this.suspended = null;
		if (schedule) this.schedule();
	}

	private flushPassiveTasks(): void {
		if (this.passiveTasks.length === 0) return;
		const tasks = this.passiveTasks.splice(0);
		runCommitTasks(tasks);
	}

	enqueuePassive(task: () => void): void {
		this.passiveTasks.push(task);
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		queueMicrotask(() => {
			this.passiveScheduled = false;
			this.flushPassiveTasks();
		});
	}

	flushPassivesBeforeRender(): void {
		this.flushPassiveTasks();
	}

	prepare(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		if (this.owner.disposed) throw new Error('Cannot render an unmounted universal root.');
		// Match Octane's DOM runtime: a previous commit's passive work becomes
		// observable before the next render attempt starts. This also prevents two
		// synchronous universal commits from collapsing the first commit's effects.
		this.flushPassivesBeforeRender();
		const metadata = getComponentMetadata(component);
		if (metadata.id !== this.renderer) {
			throw new Error(
				`Universal renderer mismatch: root ${JSON.stringify(this.renderer)} cannot render component ${JSON.stringify(metadata.id)}.`,
			);
		}
		this.pending?.abort();
		this.suspended?.abort();
		this.lastComponent = component;
		this.lastProps = props;
		const previousAttempt = CURRENT_ATTEMPT;
		const attempt: RenderAttempt = {
			owner: this.owner,
			hooks: new Map(this.owner.hooks),
			seenEffects: [],
			implicitSlot: 0,
		};
		CURRENT_ATTEMPT = attempt;
		let value: UniversalPlanValue;
		try {
			const context: UniversalRenderContext = {
				renderer: this.renderer,
				readContext: (context) => this.owner.bridge?.readContext(context) ?? context.defaultValue,
				insertionEffect: (create, deps) => enqueueUniversalEffect('insertion', create, deps),
				layoutEffect: (create, deps) => enqueueUniversalEffect('layout', create, deps),
				effect: (create, deps) => enqueueUniversalEffect('passive', create, deps),
			};
			value = component(props, context);
		} catch (error) {
			if (error instanceof UniversalSuspense) return this.suspend(error.thenable);
			throw error;
		} finally {
			CURRENT_ATTEMPT = previousAttempt;
		}
		if (value?.$$kind !== UNIVERSAL_VALUE) {
			throw new TypeError('A universal component must return universalValue(plan, values).');
		}
		const nodes = materializePlanValue(value, this.renderer);
		assertBlueprintCapabilities(nodes, this.renderer, this.driver.capabilities);
		const rootBlueprint: BlueprintRange = { kind: 'range', key: null, children: nodes };
		const transaction = this.createTransaction(rootBlueprint, attempt.hooks, attempt.seenEffects);
		this.pending = transaction;
		return transaction;
	}

	render(component: UniversalComponent<any>, props: any): UniversalPreparedAttempt {
		const attempt = this.prepare(component, props);
		if (attempt.status === 'prepared') attempt.commit();
		return attempt;
	}

	private createTransaction(
		blueprint: BlueprintRange,
		draftHooks: Map<unknown, UniversalHook>,
		seenEffects: EffectHook[],
	): UniversalTransactionImpl<Container, PublicInstance> {
		const used = new Set<LogicalRecord>([this.rootRecord]);
		const reconcileChildren = (
			oldChildren: readonly LogicalRecord[],
			blueprints: readonly BlueprintNode[],
		): DraftRecord[] => {
			const keyed = new Map<UniversalKey, LogicalRecord>();
			for (const old of oldChildren) if (old.key !== null) keyed.set(old.key, old);
			const claimed = new Set<LogicalRecord>();
			const nextKeys = new Set<UniversalKey>();
			let unkeyedCursor = 0;
			const output: DraftRecord[] = [];
			for (const child of blueprints) {
				let record: LogicalRecord | undefined;
				if (child.key !== null) {
					if (nextKeys.has(child.key)) {
						throw new Error(`Duplicate universal child key ${String(child.key)}.`);
					}
					nextKeys.add(child.key);
					const candidate = keyed.get(child.key);
					if (
						candidate !== undefined &&
						!claimed.has(candidate) &&
						sameRecordShape(candidate, child)
					) {
						record = candidate;
					}
				} else {
					while (unkeyedCursor < oldChildren.length) {
						const candidate = oldChildren[unkeyedCursor++];
						if (
							candidate.key === null &&
							!claimed.has(candidate) &&
							sameRecordShape(candidate, child)
						) {
							record = candidate;
							break;
						}
					}
				}
				const isNew = record === undefined;
				record ??= createLogicalRecord(this.nextId++, child);
				claimed.add(record);
				used.add(record);
				output.push({
					record,
					blueprint: child,
					children: reconcileChildren(record.children, child.children),
					isNew,
				});
			}
			return output;
		};

		const draftRoot: DraftRecord = {
			record: this.rootRecord,
			blueprint,
			children: reconcileChildren(this.rootRecord.children, blueprint.children),
			isNew: false,
		};
		const removedRoots: LogicalRecord[] = [];
		const findRemoved = (parent: LogicalRecord) => {
			for (const child of parent.children) {
				if (!used.has(child)) removedRoots.push(child);
				else findRemoved(child);
			}
		};
		findRemoved(this.rootRecord);

		const creates: UniversalHostCommand[] = [];
		const updates: UniversalHostCommand[] = [];
		walkDraft(draftRoot, (draft) => {
			if (draft.record.kind !== 'host') return;
			const blueprintHost = draft.blueprint as BlueprintHost;
			if (draft.isNew) {
				creates.push({
					op: 'create',
					id: draft.record.id,
					type: blueprintHost.type,
					props: Object.freeze({ ...blueprintHost.props }),
				});
			} else if (!shallowPropsEqual(draft.record.props, blueprintHost.props)) {
				updates.push({
					op: 'update',
					id: draft.record.id,
					props: Object.freeze({ ...blueprintHost.props }),
				});
			}
		});

		const removes: UniversalHostCommand[] = [];
		const placements: UniversalHostCommand[] = [];
		const planPlacements = (
			parentId: number | null,
			oldRecords: readonly LogicalRecord[],
			newDrafts: readonly DraftRecord[],
		) => {
			const oldPhysical = physicalRecords(oldRecords);
			const newPhysical = physicalDrafts(newDrafts);
			const desiredIds = new Set(newPhysical.map((entry) => entry.record.id));
			for (const old of oldPhysical) {
				if (!desiredIds.has(old.id)) removes.push({ op: 'remove', parent: parentId, id: old.id });
			}
			const current = oldPhysical
				.filter((entry) => desiredIds.has(entry.id))
				.map((entry) => entry.id);
			for (let index = 0; index < newPhysical.length; index++) {
				const draft = newPhysical[index];
				const id = draft.record.id;
				if (current[index] === id) continue;
				const currentIndex = current.indexOf(id);
				const before = current[index] ?? null;
				if (currentIndex === -1) {
					placements.push({ op: 'insert', parent: parentId, id, before });
				} else {
					current.splice(currentIndex, 1);
					placements.push({ op: 'move', parent: parentId, id, before });
				}
				current.splice(index, 0, id);
			}
		};
		walkDraftPostOrder(draftRoot, (draft) => {
			if (draft.record === this.rootRecord) {
				planPlacements(null, this.rootRecord.children, draft.children);
			} else if (draft.record.kind === 'host') {
				planPlacements(draft.record.id, draft.record.children, draft.children);
			}
		});

		const removedHosts: LogicalRecord[] = [];
		for (const removed of removedRoots) collectRemovedPostOrder(removed, removedHosts);
		const destroys: UniversalHostCommand[] = removedHosts.map((record) => ({
			op: 'destroy',
			id: record.id,
		}));
		const commands = Object.freeze([
			...creates,
			...updates,
			...removes,
			...placements,
			...destroys,
		]);
		const batch: UniversalHostBatch = Object.freeze({
			renderer: this.renderer,
			version: ++this.version,
			commands,
		});

		const refDetaches: {
			record: LogicalRecord;
			ref: unknown;
			cleanup: (() => void) | null;
		}[] = [];
		const refAttaches: DraftRecord[] = [];
		for (const removed of removedRoots) {
			walkLogical(removed, (record) => {
				if (record.kind === 'host' && record.refAttached) {
					refDetaches.push({ record, ref: record.ref, cleanup: record.refCleanup });
				}
			});
		}
		walkDraftPostOrder(draftRoot, (draft) => {
			if (draft.record.kind !== 'host') return;
			const nextRef = (draft.blueprint as BlueprintHost).ref;
			if (!draft.isNew && !Object.is(draft.record.ref, nextRef) && draft.record.refAttached) {
				refDetaches.push({
					record: draft.record,
					ref: draft.record.ref,
					cleanup: draft.record.refCleanup,
				});
			}
			if (
				nextRef != null &&
				(draft.isNew || !draft.record.refAttached || !Object.is(draft.record.ref, nextRef))
			) {
				refAttaches.push(draft);
			}
		});

		const previousEffectOrder = this.owner.effectOrder;
		const seenEffectSlots = new Set(seenEffects.map((effect) => effect.slot));
		const removedEffects: EffectHook[] = [];
		for (const hook of previousEffectOrder) {
			if (!seenEffectSlots.has(hook.slot)) {
				if (draftHooks.get(hook.slot) === hook) draftHooks.delete(hook.slot);
				removedEffects.push(hook);
			}
		}
		const effectChanges = seenEffects.map((next) => ({
			next,
			changed:
				next.previous === null ||
				next.previous.phase !== next.phase ||
				!depsEqual(next.previous.deps, next.deps) ||
				!next.previous.mounted,
		}));
		const removedEffectSet = new Set(removedEffects);
		const changedEffectByPrevious = new Map<EffectHook, EffectHook>();
		for (const { next, changed } of effectChanges) {
			if (changed && next.previous !== null && next.mounted) {
				changedEffectByPrevious.set(next.previous, next);
			}
		}
		const orderedEffectCleanups: { phase: EffectPhase; hook: EffectHook }[] = [];
		for (const previous of previousEffectOrder) {
			if (removedEffectSet.has(previous) && previous.mounted) {
				orderedEffectCleanups.push({ phase: previous.phase, hook: previous });
				continue;
			}
			const next = changedEffectByPrevious.get(previous);
			if (next !== undefined) {
				orderedEffectCleanups.push({ phase: previous.phase, hook: next });
			}
		}

		const applyLogicalTopology = () => {
			const apply = (draft: DraftRecord, parent: LogicalRecord | null) => {
				const record = draft.record;
				record.parent = parent;
				record.key = draft.blueprint.key;
				if (record.kind === 'host') {
					const host = draft.blueprint as BlueprintHost;
					record.type = host.type;
					record.props = host.props;
					record.ref = host.ref;
				}
				record.children = draft.children.map((child) => child.record);
				for (const child of draft.children) apply(child, record);
			};
			apply(draftRoot, null);
		};

		const transaction = new UniversalTransactionImpl(
			this,
			batch,
			() => {
				const apply = (value: UniversalHostBatch) => this.driver.commit(this.container, value);
				if (this.transport === null) apply(batch);
				else this.transport.commit(this.container, batch, apply);
				applyLogicalTopology();
				this.owner.hooks = draftHooks;
				this.owner.effectOrder = [...seenEffects];
			},
			() => {
				const tasks: (() => void)[] = [];
				for (const cleanup of orderedEffectCleanups) {
					if (cleanup.phase === 'insertion') {
						tasks.push(() => runEffectCleanup(cleanup.hook));
					}
				}
				for (const { next, changed } of effectChanges) {
					if (changed && next.phase === 'insertion') tasks.push(() => runEffectCreate(next));
				}
				for (const cleanup of orderedEffectCleanups) {
					if (cleanup.phase === 'layout') {
						tasks.push(() => runEffectCleanup(cleanup.hook));
					}
				}
				for (const { record, ref, cleanup } of refDetaches) {
					tasks.push(() => detachRef(record, ref, cleanup));
				}
				runCommitTasks(tasks);
			},
			() => {
				const tasks: (() => void)[] = [];
				for (const draft of refAttaches) {
					const record = draft.record;
					tasks.push(() =>
						attachRef(record, this.driver.getPublicInstance(this.container, record.id)),
					);
				}
				for (const { next, changed } of effectChanges) {
					if (changed && next.phase === 'layout') tasks.push(() => runEffectCreate(next));
				}
				runCommitTasks(tasks);
			},
			() => {
				const tasks: (() => void)[] = [];
				for (const cleanup of orderedEffectCleanups) {
					if (cleanup.phase === 'passive') {
						tasks.push(() => runEffectCleanup(cleanup.hook));
					}
				}
				if (this.owner.disposed) {
					runCommitTasks(tasks);
					return;
				}
				for (const { next, changed } of effectChanges) {
					if (!changed || next.phase !== 'passive') continue;
					if (this.owner.hooks.get(next.slot) !== next) continue;
					tasks.push(() => runEffectCreate(next));
				}
				runCommitTasks(tasks);
			},
		);
		return transaction;
	}

	finish(transaction: UniversalTransactionImpl<Container, PublicInstance>): void {
		if (this.pending === transaction) this.pending = null;
	}

	unmount(): void {
		if (this.owner.disposed) return;
		this.pending?.abort();
		this.suspended?.abort();
		const effects = [...this.owner.effectOrder];
		const children = [...this.rootRecord.children];
		const physical = physicalRecords(this.rootRecord.children);
		const removedHosts: LogicalRecord[] = [];
		for (const child of this.rootRecord.children) collectRemovedPostOrder(child, removedHosts);
		if (removedHosts.length > 0) {
			const batch: UniversalHostBatch = Object.freeze({
				renderer: this.renderer,
				version: ++this.version,
				commands: Object.freeze([
					...physical.map((record) => ({ op: 'remove' as const, parent: null, id: record.id })),
					...removedHosts.map((record) => ({ op: 'destroy' as const, id: record.id })),
				]),
			});
			const apply = (value: UniversalHostBatch) => this.driver.commit(this.container, value);
			if (this.transport === null) apply(batch);
			else this.transport.commit(this.container, batch, apply);
		}
		this.rootRecord.children = [];
		this.owner.hooks.clear();
		this.owner.effectOrder = [];
		this.owner.disposed = true;
		this.owner.bridge = null;
		this.lastComponent = null;
		// Pending passive bodies belong to the now-deleted tree and must not mount.
		// Already-mounted passive effects are queued as deferred unmount work.
		this.passiveTasks.length = 0;
		const tasks: (() => void)[] = [];
		const passiveTasks: (() => void)[] = [];
		for (const hook of effects) {
			if (!hook.mounted) continue;
			if (hook.phase === 'passive') passiveTasks.push(() => runEffectCleanup(hook));
			else tasks.push(() => runEffectCleanup(hook));
		}
		for (const child of children) {
			walkLogical(child, (record) => {
				if (record.refAttached) tasks.push(() => detachRef(record));
			});
		}
		if (passiveTasks.length > 0) {
			this.enqueuePassive(() => runCommitTasks(passiveTasks));
		}
		runCommitTasks(tasks);
	}
}

class UniversalTransactionImpl<Container, PublicInstance> implements UniversalTransaction {
	private state: 'prepared' | 'committed' | 'aborted' = 'prepared';
	private hostAccepted = false;
	private passiveScheduled = false;
	private passiveRan = false;

	constructor(
		private readonly root: UniversalRootImpl<Container, PublicInstance>,
		readonly batch: UniversalHostBatch,
		private readonly acceptHost: () => void,
		private readonly afterMutation: () => void,
		private readonly layout: () => void,
		private readonly passive: () => void,
	) {}

	get status(): 'prepared' | 'committed' | 'aborted' {
		return this.state;
	}

	commitMutation(): void {
		if (this.state !== 'prepared' || this.hostAccepted) return;
		this.acceptHost();
		this.hostAccepted = true;
		this.afterMutation();
	}

	commitLayout(): void {
		if (this.state !== 'prepared') return;
		if (!this.hostAccepted) this.commitMutation();
		if (this.state !== 'prepared') return;
		try {
			this.layout();
		} finally {
			this.state = 'committed';
			this.root.finish(this);
			this.schedulePassive();
		}
	}

	commitPassive(): void {
		if (this.state !== 'committed') return;
		this.schedulePassive();
		this.root.flushPassivesBeforeRender();
	}

	commit(): void {
		if (this.state !== 'prepared') return;
		let hasError = false;
		let firstError: unknown;
		try {
			this.commitMutation();
		} catch (error) {
			hasError = true;
			firstError = error;
		}
		// Driver rejection leaves the transaction wholly prepared. Once the host
		// accepted, however, finish every remaining commit callback so one thrown
		// insertion/layout-cleanup cannot strand refs or later layout effects.
		if (this.hostAccepted) {
			try {
				this.commitLayout();
			} catch (error) {
				if (!hasError) {
					hasError = true;
					firstError = error;
				}
			}
		}
		if (hasError) throw firstError;
	}

	private schedulePassive(): void {
		if (this.passiveScheduled) return;
		this.passiveScheduled = true;
		this.root.enqueuePassive(() => {
			if (this.passiveRan) return;
			this.passiveRan = true;
			this.passive();
		});
	}

	abort(): void {
		if (this.state !== 'prepared') return;
		if (this.hostAccepted) {
			throw new Error('A universal transaction cannot be aborted after its host batch committed.');
		}
		this.state = 'aborted';
		this.root.finish(this);
	}
}

export function createUniversalRoot<Container, PublicInstance>(
	container: Container,
	driver: UniversalHostDriver<Container, PublicInstance>,
	options: UniversalRootOptions<Container> = {},
): UniversalRoot {
	return new UniversalRootImpl(container, driver, options.transport ?? null);
}

interface HostBoundaryProps {
	root: UniversalRoot;
	component: UniversalComponent<any>;
	props?: any;
}

interface HostBoundaryState {
	root: UniversalRootImpl<any, any>;
	owner: BoundaryOwner;
	committed: boolean;
	pending: UniversalPreparedAttempt | null;
}

const boundaryStates = new WeakMap<Scope, HostBoundaryState>();
const BOUNDARY_INVALIDATE_SLOT = Symbol('octane.universal.boundary.invalidate');
const BOUNDARY_COMMIT_SLOT = Symbol('octane.universal.boundary.commit');
const BOUNDARY_LIFETIME_SLOT = Symbol('octane.universal.boundary.lifetime');

export function createUniversalHostBoundary(renderer: string): ((
	props: HostBoundaryProps,
	scope: Scope,
) => void) & {
	readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
} {
	assertRendererId(renderer, 'Host boundary renderer');
	const boundary = ((props: HostBoundaryProps, scope: Scope) => {
		if (props.root.renderer !== renderer) {
			throw new Error(
				`Universal boundary ${JSON.stringify(renderer)} received root ${JSON.stringify(props.root.renderer)}.`,
			);
		}
		let state = boundaryStates.get(scope);
		const [, invalidate] = useDomState(0, BOUNDARY_INVALIDATE_SLOT);
		if (state === undefined) {
			const owner: BoundaryOwner = {
				readContext: (context) => useDomContext(context),
				invalidate: () => invalidate((value) => value + 1),
			};
			state = {
				root: props.root as UniversalRootImpl<any, any>,
				owner,
				committed: false,
				pending: null,
			};
			boundaryStates.set(scope, state);
			state.root.setBridge(owner);
		} else if (state.root !== props.root) {
			throw new Error('Changing the root owned by a mounted universal boundary is not supported.');
		}
		let attempt: UniversalPreparedAttempt;
		try {
			attempt = state.root.prepare(props.component, props.props);
		} catch (error) {
			if (!state.committed) {
				boundaryStates.delete(scope);
				state.root.clearBridge(state.owner);
			}
			throw error;
		}
		state.pending = attempt;
		useDomLayoutEffect(
			() => {
				if (state!.pending !== attempt) return;
				try {
					if (attempt.status === 'prepared') attempt.commit();
					state!.committed = true;
					state!.pending = null;
				} catch (error) {
					boundaryStates.delete(scope);
					state!.pending = null;
					try {
						state!.root.unmount();
					} finally {
						state!.root.clearBridge(state!.owner);
					}
					throw error;
				}
			},
			[attempt],
			BOUNDARY_COMMIT_SLOT,
		);
		useDomLayoutEffect(
			() => () => {
				boundaryStates.delete(scope);
				state!.pending?.abort();
				state!.pending = null;
				try {
					state!.root.unmount();
				} finally {
					state!.root.clearBridge(state!.owner);
				}
			},
			[],
			BOUNDARY_LIFETIME_SLOT,
		);
		queueMicrotask(() => {
			if (state!.pending !== attempt) return;
			attempt.abort();
			state!.pending = null;
			if (!state!.committed) {
				boundaryStates.delete(scope);
				state!.root.clearBridge(state!.owner);
			}
		});
	}) as ((props: HostBoundaryProps, scope: Scope) => void) & {
		readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
	};
	Object.defineProperty(boundary, UNIVERSAL_BOUNDARY, {
		value: Object.freeze({
			id: `dom->${renderer}`,
			ownerRenderer: 'dom',
			childRenderer: renderer,
			childrenProp: 'component',
		}),
	});
	return boundary;
}

const OBJECT_DRIVER_STATE = Symbol('octane.object-driver.state');

export interface ObjectHostInstance {
	readonly id: number;
	readonly type: string;
	props: Readonly<Record<string, unknown>>;
	readonly children: ObjectHostInstance[];
}

interface ObjectDriverState {
	instances: Map<number, ObjectHostInstance>;
}

export interface ObjectHostContainer {
	readonly renderer: string;
	readonly children: ObjectHostInstance[];
	readonly commits: UniversalHostBatch[];
	/** Number of driver instances currently allocated, including detached ones. */
	readonly instanceCount: number;
	readonly [OBJECT_DRIVER_STATE]: ObjectDriverState;
}

export function createObjectContainer(renderer = 'object'): ObjectHostContainer {
	assertRendererId(renderer, 'Object container renderer');
	const state: ObjectDriverState = { instances: new Map() };
	return {
		renderer,
		children: [],
		commits: [],
		get instanceCount() {
			return state.instances.size;
		},
		[OBJECT_DRIVER_STATE]: state,
	};
}

function objectChildren(
	container: ObjectHostContainer,
	parent: number | null,
	instances: Map<number, ObjectHostInstance>,
): ObjectHostInstance[] {
	if (parent === null) return container.children;
	const instance = instances.get(parent);
	if (instance === undefined) throw new Error(`Object driver: unknown parent ${parent}.`);
	return instance.children;
}

export function createObjectDriver(
	renderer = 'object',
): UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> {
	assertRendererId(renderer, 'Object driver renderer');
	return {
		id: renderer,
		capabilities: new Set(['text']),
		commit(container, batch) {
			if (container.renderer !== renderer || batch.renderer !== renderer) {
				throw new Error(
					`Object driver renderer mismatch: driver ${JSON.stringify(renderer)}, container ${JSON.stringify(container.renderer)}, batch ${JSON.stringify(batch.renderer)}.`,
				);
			}
			const state = container[OBJECT_DRIVER_STATE];
			const simulated = new Map<
				number,
				{ type: string; props: Readonly<Record<string, unknown>>; children: number[] }
			>();
			for (const [id, instance] of state.instances) {
				simulated.set(id, {
					type: instance.type,
					props: instance.props,
					children: instance.children.map((child) => child.id),
				});
			}
			const rootChildren = container.children.map((child) => child.id);
			const simulatedChildren = (parent: number | null) => {
				if (parent === null) return rootChildren;
				const value = simulated.get(parent);
				if (value === undefined) throw new Error(`Object driver: unknown parent ${parent}.`);
				return value.children;
			};
			for (const command of batch.commands) {
				if (command.op === 'create') {
					if (simulated.has(command.id))
						throw new Error(`Object driver: duplicate id ${command.id}.`);
					simulated.set(command.id, { type: command.type, props: command.props, children: [] });
				} else if (command.op === 'update') {
					const value = simulated.get(command.id);
					if (value === undefined) throw new Error(`Object driver: unknown update ${command.id}.`);
					value.props = command.props;
				} else if (command.op === 'insert' || command.op === 'move') {
					if (!simulated.has(command.id))
						throw new Error(`Object driver: unknown child ${command.id}.`);
					for (const value of [
						rootChildren,
						...[...simulated.values()].map((entry) => entry.children),
					]) {
						const old = value.indexOf(command.id);
						if (old !== -1) value.splice(old, 1);
					}
					const children = simulatedChildren(command.parent);
					const before =
						command.before === null ? children.length : children.indexOf(command.before);
					if (before === -1) throw new Error(`Object driver: unknown before id ${command.before}.`);
					children.splice(before, 0, command.id);
				} else if (command.op === 'remove') {
					const children = simulatedChildren(command.parent);
					const index = children.indexOf(command.id);
					if (index === -1) throw new Error(`Object driver: child ${command.id} is not attached.`);
					children.splice(index, 1);
				} else {
					const instance = simulated.get(command.id);
					if (instance === undefined)
						throw new Error(`Object driver: unknown destroy ${command.id}.`);
					for (const value of [
						rootChildren,
						...[...simulated.values()].map((entry) => entry.children),
					]) {
						const attached = value.indexOf(command.id);
						if (attached !== -1) value.splice(attached, 1);
					}
					instance.children.length = 0;
					simulated.delete(command.id);
				}
			}

			for (const command of batch.commands) {
				if (command.op === 'create') {
					state.instances.set(command.id, {
						id: command.id,
						type: command.type,
						props: command.props,
						children: [],
					});
				} else if (command.op === 'update') {
					state.instances.get(command.id)!.props = command.props;
				} else if (command.op === 'insert' || command.op === 'move') {
					const instance = state.instances.get(command.id)!;
					for (const parent of [
						container.children,
						...[...state.instances.values()].map((entry) => entry.children),
					]) {
						const old = parent.indexOf(instance);
						if (old !== -1) parent.splice(old, 1);
					}
					const children = objectChildren(container, command.parent, state.instances);
					const before =
						command.before === null
							? children.length
							: children.indexOf(state.instances.get(command.before)!);
					children.splice(before, 0, instance);
				} else if (command.op === 'remove') {
					const children = objectChildren(container, command.parent, state.instances);
					children.splice(children.indexOf(state.instances.get(command.id)!), 1);
				} else {
					const instance = state.instances.get(command.id)!;
					for (const parent of [
						container.children,
						...[...state.instances.values()].map((entry) => entry.children),
					]) {
						const attached = parent.indexOf(instance);
						if (attached !== -1) parent.splice(attached, 1);
					}
					instance.children.length = 0;
					state.instances.delete(command.id);
				}
			}
			container.commits.push(batch);
		},
		getPublicInstance(container, id) {
			return container[OBJECT_DRIVER_STATE].instances.get(id) ?? null;
		},
	};
}

export { createContext } from './runtime.js';
