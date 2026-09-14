import { normalizeClass } from './class-names.js';

/** A synchronous, immutable view of an existing application-owned source. */
export interface BindingSource<Props> {
	/** Return the current snapshot, never a promise or other thenable. */
	getSnapshot(): Props;
	/** Notify after publication; return cleanup even when notifying during subscription. */
	subscribe(notify: () => void): () => void;
}

export interface BindingOptions {
	/** The application owns the lifetime of these externally rendered nodes. */
	signal?: AbortSignal;
}

export interface BindingHandle {
	/** Publish current properties now, including inside an outer source batch. */
	refresh(): void;
	/** Release subscriptions and property ownership without removing DOM. */
	dispose(): void;
}

/**
 * Preserve normal rendering while leaving this attribute with its external owner.
 * The compiler recognizes this marker in an opted-in static view's attributes.
 */
export function unbound<T>(value: T): T {
	return value;
}

/**
 * Adopt a compiler-proven static native view without loading a renderer.
 * Octane lowers this intrinsic in a compiled .tsrx/.tsx activation module.
 */
export function adoptBindings<Props>(
	_root: Element,
	_view: (props: Props) => unknown,
	_source: BindingSource<NoInfer<Props>>,
	_options?: BindingOptions,
): BindingHandle {
	throw new Error(
		'adoptBindings() requires an Octane-compiled .tsrx or .tsx call and a supported static view.',
	);
}

/** @internal Compiler ABI: element-only preorder, with HTML=0 and SVG=1. */
export type BindingNode = readonly [
	parent: number,
	tag: string,
	namespace: 0 | 1,
	children: number,
];

/** @internal Names and numeric CSS units are resolved by the compiler. */
export type BindingOperation = readonly [
	node: number,
	kind: 'attr' | 'boolean' | 'aria' | 'class' | 'styleProperty',
	name: string,
	unitless?: boolean,
];

/** @internal No application function is invoked to discover the DOM topology. */
export interface CompiledBindings<Props> {
	readonly id: string;
	readonly nodes: readonly BindingNode[];
	readonly bindings: readonly BindingOperation[];
	project(props: Props): readonly unknown[];
}

const claims = /* @__PURE__ */ new WeakMap<Element, Set<string>>();
const namespaces = ['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg'];

function channel(binding: BindingOperation): string {
	return binding[1] === 'styleProperty' ? `style:${binding[2]}` : binding[2];
}

function resolveNodes(root: Element, descriptor: CompiledBindings<unknown>): Element[] {
	if (
		root?.nodeType !== 1 ||
		root.getAttribute('data-octane-bindings') !== descriptor.id ||
		descriptor.nodes.length === 0
	) {
		throw new Error('DOM bindings require the matching compiler-stamped root.');
	}
	const nodes: Element[] = [];
	const childIndices: number[] = [];
	for (let i = 0; i < descriptor.nodes.length; i++) {
		const [parent, tag, namespace, children] = descriptor.nodes[i]!;
		const node =
			i === 0
				? parent === -1
					? root
					: undefined
				: parent >= 0 && parent < i
					? nodes[parent]?.children[childIndices[parent]++]
					: undefined;
		if (
			node === undefined ||
			node.localName !== tag ||
			node.namespaceURI !== namespaces[namespace] ||
			node.childNodes.length !== children ||
			node.children.length !== children
		) {
			throw new Error('DOM bindings cannot adopt a mismatched static element topology.');
		}
		nodes.push(node);
		childIndices.push(0);
	}
	for (let i = 0; i < nodes.length; i++) {
		if (childIndices[i] !== descriptor.nodes[i]![3]) {
			throw new Error('DOM bindings cannot adopt an incomplete static element topology.');
		}
	}
	return nodes;
}

function normalize(binding: BindingOperation, value: unknown): string | null {
	const type = typeof value;
	switch (binding[1]) {
		case 'class':
			return value == null || value === false ? null : normalizeClass(value);
		case 'boolean':
			return !value || type === 'function' || type === 'symbol' ? null : '';
		case 'styleProperty': {
			if (value == null || type === 'boolean') return null;
			return type === 'number' && value !== 0 && !binding[3]
				? value + 'px'
				: type === 'string'
					? (value as string).trim()
					: '' + (value as any);
		}
		default:
			return value == null ||
				type === 'function' ||
				type === 'symbol' ||
				(binding[1] === 'attr' && type === 'boolean')
				? null
				: String(value);
	}
}

function write(node: Element, binding: BindingOperation, value: string | null): void {
	const name = binding[2];
	if (binding[1] === 'styleProperty') {
		const style = (node as HTMLElement | SVGElement).style;
		if (value === null) {
			style.removeProperty(name);
		} else {
			const tail = value.trimEnd();
			const important = tail.endsWith('!important');
			const text = important ? tail.slice(0, -10).trimEnd() : value;
			const priority = important ? 'important' : '';
			if (style.getPropertyValue(name) !== text || style.getPropertyPriority(name) !== priority)
				style.setProperty(name, text, priority);
		}
	} else if (value === null) {
		if (node.hasAttribute(name)) node.removeAttribute(name);
	} else if (node.getAttribute(name) !== value) {
		// Native boolean/type attributes reflect synchronously to their properties.
		node.setAttribute(name, value);
	}
}

/** @internal Target of compiler-lowered adoptBindings calls. */
export function __adoptBindings<Props>(
	root: Element,
	descriptor: CompiledBindings<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function')
		throw new TypeError('DOM bindings require synchronous getSnapshot() and subscribe() methods.');
	const nodes = resolveNodes(root, descriptor);
	const bindings = descriptor.bindings;
	const owned: Array<readonly [Element, string]> = [];
	const previous: Array<string | null | undefined> = [];
	let disposed = false;
	let busy = true;
	let dirty = false;
	let unsubscribe: (() => void) | undefined;
	const signal = options?.signal;
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		signal?.removeEventListener('abort', dispose);
		for (const [node, name] of owned) {
			const channels = claims.get(node)!;
			channels.delete(name);
			if (channels.size === 0) claims.delete(node);
		}
		owned.length = nodes.length = previous.length = 0;
		const stop = unsubscribe;
		unsubscribe = undefined;
		stop?.();
	};
	const refresh = (): void => {
		if (disposed) return;
		dirty = true;
		if (busy) return;
		busy = true;
		try {
			while (dirty && !disposed) {
				dirty = false;
				const snapshot = source.getSnapshot();
				if (dirty || disposed) continue;
				if (
					snapshot !== null &&
					(typeof snapshot === 'object' || typeof snapshot === 'function') &&
					typeof (snapshot as { then?: unknown }).then === 'function' &&
					!dirty &&
					!disposed
				)
					throw new TypeError('DOM bindings require a synchronous snapshot, not a thenable.');
				if (dirty || disposed) continue;
				const values = descriptor.project(snapshot);
				if (dirty || disposed) continue;
				if (!Array.isArray(values) || values.length !== bindings.length)
					throw new TypeError(
						'A DOM binding projection must return its synchronous scalar values.',
					);
				const next = values.map((value, index) => normalize(bindings[index]!, value));
				// A getter/coercion may synchronously notify or end the owner lifetime.
				// Never publish an obsolete prepared snapshot or mutate after disposal.
				if (dirty || disposed) continue;
				for (let i = 0; i < bindings.length && !dirty && !disposed; i++) {
					if (next[i] === previous[i]) continue;
					write(nodes[bindings[i]![0]]!, bindings[i]!, next[i]!);
					previous[i] = next[i]!;
				}
			}
		} catch (error) {
			try {
				dispose();
			} catch {
				// Preserve the projection failure if application cleanup also throws.
			}
			throw error;
		} finally {
			busy = false;
		}
	};
	const handle = { refresh, dispose };
	if (signal?.aborted) {
		dispose();
		return handle;
	}
	try {
		// Claim all channels before invoking source callbacks or mutating any node.
		for (const binding of bindings) {
			const node = nodes[binding[0]];
			if (node === undefined) throw new TypeError('A DOM binding targets an unknown element.');
			const name = channel(binding);
			let channels = claims.get(node);
			if (channels?.has(name))
				throw new Error('This DOM property already has a binding. Dispose it before rebinding.');
			if (channels === undefined) claims.set(node, (channels = new Set()));
			channels.add(name);
			owned.push([node, name]);
		}
		signal?.addEventListener('abort', dispose, { once: true });
		const stop = source.subscribe(refresh);
		if (typeof stop !== 'function')
			throw new TypeError('A DOM binding subscription must return a cleanup function.');
		if (disposed) stop();
		else unsubscribe = stop;
		busy = false;
		refresh();
		return handle;
	} catch (error) {
		try {
			dispose();
		} catch {
			// Initialization failure remains primary over application cleanup errors.
		}
		throw error;
	}
}
