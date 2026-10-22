// Dependency-free universal children collector shared by the universal core
// runtime and one-shot first-screen renderers (e.g. Lynx main-renderer) that
// mirror the universal value protocol without importing the scheduler.
import type {
	UniversalKey,
	UniversalPlan,
	UniversalPlanNode,
	UniversalPlanValue,
	UniversalRenderable,
	UniversalListValue,
	UniversalChildrenValue,
	UniversalKeyedValue,
	UniversalComponentValue,
} from './universal-core.js';

// Typed as `symbol` (not `unique symbol`) on purpose: the value types declare
// their `$$kind` as the renderer module's own unique symbols, so a stricter
// local const would reject every comparison.
const UNIVERSAL_VALUE: symbol = Symbol.for('octane.universal.value');
const UNIVERSAL_LIST: symbol = Symbol.for('octane.universal.list');
const UNIVERSAL_CHILDREN: symbol = Symbol.for('octane.universal.children');
const UNIVERSAL_KEYED: symbol = Symbol.for('octane.universal.keyed');
const UNIVERSAL_COMPONENT_VALUE: symbol = Symbol.for('octane.universal.component-value');

function renderableKey(value: UniversalRenderable): UniversalKey | null {
	if ((value as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
		return (value as UniversalPlanValue).key;
	}
	if ((value as UniversalKeyedValue)?.$$kind === UNIVERSAL_KEYED) {
		return (value as UniversalKeyedValue).key;
	}
	if ((value as UniversalComponentValue)?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
		const component = value as UniversalComponentValue;
		return component.hasKey ? (component.key as UniversalKey) : null;
	}
	return null;
}

function normalizeUniversalKey(value: unknown): UniversalKey | null {
	if (value == null) return null;
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'symbol' ||
		typeof value === 'bigint'
	) {
		return value;
	}
	throw new TypeError(`Universal keys must be strings, numbers, symbols, or bigints.`);
}

export interface UniversalChildrenRuntime {
	universalKey(key: UniversalKey, value: UniversalRenderable): UniversalRenderable;
	universalPlan(renderer: string, root: UniversalPlanNode): UniversalPlan;
	universalValue(plan: UniversalPlan, values?: readonly unknown[]): UniversalRenderable;
	normalizeProps(value: unknown): { readonly key: unknown };
	checkRenderer(renderer: string): void;
}

interface UniversalChildEntry {
	readonly child: UniversalRenderable;
	readonly key: string;
}

// Injective key encoding over every UniversalKey segment type. Symbols get a
// stable per-process id — a Map, not a WeakMap: registered symbols can't be
// WeakMap keys and this stays PrimJS-safe for first-screen renderers.
const CHILD_KEY_SYMBOL_IDS = new Map<symbol, number>();

function encodeChildKeySegment(segment: unknown): string {
	if (typeof segment === 'string') return JSON.stringify(segment);
	if (typeof segment === 'bigint') return `${segment}n`;
	if (typeof segment === 'symbol') {
		let id = CHILD_KEY_SYMBOL_IDS.get(segment);
		if (id === undefined) CHILD_KEY_SYMBOL_IDS.set(segment, (id = CHILD_KEY_SYMBOL_IDS.size));
		return `@${id}`;
	}
	return String(segment);
}

function encodeChildKey(path: readonly unknown[]): string {
	return path.map(encodeChildKeySegment).join(',');
}

/** Renderer-supported child collection operations. They never render a component
 *  to discover its output. Returned entries retain their keys when mapped into
 *  wrapper hosts, and are materialized normally at their eventual placement. */
export function createUniversalChildren(runtime: UniversalChildrenRuntime) {
	const { universalKey, universalPlan, universalValue, normalizeProps, checkRenderer } = runtime;
	// Keys assigned by Children.toArray/map, so re-normalizing a returned entry
	// keeps the key instead of re-walking a wrapper plan.
	const NORMALIZED_CHILD_KEYS = new WeakMap<object, string>();

	/** Normalize deferred JSX without mounting components or consuming their context.
	 *  Structural owners (blocks, providers, boundaries and loops) remain renderables;
	 *  only transparent child groups, plan ranges, slots and JS arrays are flattened. */
	function universalChildEntries(children: UniversalRenderable): UniversalChildEntry[] {
		const out: UniversalChildEntry[] = [];
		const collectionKey = (child: UniversalRenderable): UniversalKey | null => {
			const key = renderableKey(child);
			if (key !== null) return key;
			if ((child as UniversalPlanValue)?.$$kind !== UNIVERSAL_VALUE) return null;
			const { plan, values } = child as UniversalPlanValue;
			let node = plan.root;
			if (node.kind === 'slot') return collectionKey(values[node.slot] as UniversalRenderable);
			if (node.kind !== 'host' && node.kind !== 'component') return null;
			if (node.kind === 'component' && node.keySlot !== undefined)
				return normalizeUniversalKey(values[node.keySlot]);
			return normalizeUniversalKey(
				node.propsSlot === undefined
					? node.kind === 'host'
						? node.props?.['key']
						: null
					: normalizeProps(values[node.propsSlot]).key,
			);
		};
		const visit = (child: UniversalRenderable, path: readonly unknown[]): void => {
			if (child == null || typeof child === 'boolean') return;
			if (typeof child === 'object') {
				const normalizedKey = NORMALIZED_CHILD_KEYS.get(child);
				if (normalizedKey !== undefined) {
					out.push({ child, key: normalizedKey });
					return;
				}
			}
			if (Array.isArray(child)) {
				(child as readonly UniversalRenderable[]).forEach((item, index) => {
					const key = collectionKey(item);
					visit(item, [...path, key === null ? 'index' : 'key', key ?? index]);
				});
				return;
			}
			if ((child as UniversalChildrenValue)?.$$kind === UNIVERSAL_CHILDREN) {
				const children = child as UniversalChildrenValue;
				checkRenderer(children.renderer);
				visit(children.render(), path);
				return;
			}
			if ((child as UniversalListValue)?.$$kind === UNIVERSAL_LIST) {
				const list = child as UniversalListValue;
				visit(list.values.length === 0 ? (list.empty as UniversalRenderable) : list.values, path);
				return;
			}
			if ((child as UniversalPlanValue)?.$$kind === UNIVERSAL_VALUE) {
				const value = child as UniversalPlanValue;
				checkRenderer(value.plan.renderer);
				if (value.key !== null) {
					out.push({ child, key: encodeChildKey([...path, 'key', value.key]) });
					return;
				}
				const visitNode = (node: UniversalPlanNode, nodePath: readonly unknown[]): void => {
					if (node.kind === 'range') {
						node.children.forEach((item, index) => visitNode(item, [...nodePath, index]));
					} else if (node.kind === 'slot') {
						visit(value.values[node.slot] as UniversalRenderable, nodePath);
					} else if (node.kind === 'text') {
						visit(
							(node.slot === undefined
								? node.value
								: value.values[node.slot]) as UniversalRenderable,
							nodePath,
						);
					} else {
						const key =
							node.kind === 'component'
								? node.keySlot === undefined
									? node.propsSlot === undefined
										? null
										: normalizeProps(value.values[node.propsSlot]).key
									: value.values[node.keySlot]
								: node.kind === 'host'
									? node.propsSlot === undefined
										? (node.props?.['key'] ?? null)
										: normalizeProps(value.values[node.propsSlot]).key
									: null;
						const item = universalValue(universalPlan(value.plan.renderer, node), value.values);
						out.push({
							child: item,
							key: encodeChildKey(
								key == null
									? nodePath
									: [...(node === value.plan.root ? path : nodePath.slice(0, -1)), 'key', key],
							),
						});
					}
				};
				visitNode(value.plan.root, path);
				return;
			}
			const key = renderableKey(child);
			out.push({ child, key: encodeChildKey(key === null ? path : [...path, 'key', key]) });
		};
		visit(children, []);
		return out;
	}

	/** Wrap a normalized child so its collection key survives into its eventual placement. */
	function normalizedChild(key: string, child: UniversalRenderable): UniversalRenderable {
		const value = universalKey(key, child);
		if (typeof value === 'object' && value !== null) NORMALIZED_CHILD_KEYS.set(value, key);
		return value;
	}

	return {
		toArray(children: UniversalRenderable): UniversalRenderable[] {
			return universalChildEntries(children).map(({ child, key }) =>
				typeof child === 'object' && child !== null ? normalizedChild(key, child) : child,
			);
		},
		map(
			children: UniversalRenderable,
			fn: (child: UniversalRenderable, index: number) => UniversalRenderable,
		): UniversalRenderable[] | null | undefined {
			if (children == null) return children;
			const out: UniversalRenderable[] = [];
			universalChildEntries(children).forEach(({ child, key }, index) => {
				const mapped = fn(child, index);
				if (mapped == null || typeof mapped === 'boolean') return;
				if (Array.isArray(mapped)) {
					for (const entry of universalChildEntries(mapped as UniversalRenderable)) {
						out.push(normalizedChild(encodeChildKey([key, entry.key]), entry.child));
					}
				} else {
					out.push(normalizedChild(key, mapped));
				}
			});
			return out;
		},
	};
}

/**
 * Marks a component binding whose authored JSX children must remain inspectable
 * element descriptors. The DOM compiler consumes the call; universal children are
 * already inspectable through `Children`, so the marker is a no-op here.
 */
export function descriptorChildren<T>(component: T): T {
	return component;
}
