import { normalizeClass } from './class-names.js';
import { domBindingClaims } from './dom-binding-claims.js';
import { sanitizeURL } from './sanitize-url.js';
import { STREAM_SCRIPT_ATTR, SUSPENSE_SCRIPT_ATTR } from './stream-protocol.js';
import { NATIVE_SIGNAL_SEED_ATTR } from './signals/native-read-seeds.js';
import { BINDING_HANDOFF } from './signals/control-handoff.js';
import type { BindingHandoff, BindingHandoffCapability } from './dom-binding-handoff.js';
import type { createBindingClassGroup } from './dom-binding-classes.js';
import type {
	__createBindingSignals,
	BindingSignalConnection,
	BindingPreparedValue,
} from './dom-binding-signals.js';
import { captureSignalOwner, currentSignalOwner } from './signals/owner-context.js';
import type { BindingControlPreview } from './signals/control-binding.js';
import {
	NATIVE_TRANSITION_CONSUMER,
	forwardNativeTransitionConsumer,
	type NativeTransitionNotify,
	type NativeTransitionPresentation,
} from './signals/read-protocol.js';
import type { __createBindingStyles, BindingStyleSnapshot } from './dom-binding-styles.js';
import type {
	__createBindingProjections,
	BindingProjectionConnection,
	BindingProjectionGroup,
} from './dom-binding-projections.js';
import type {
	__createBindingControls,
	BindingControlLease,
	BindingControlPrepared,
} from './dom-binding-controls.js';
import type {
	BindingMountTarget,
	BindingRange,
	CompiledBindingProgram,
} from './dom-binding-program.js';

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
	/** Restore owned inline style properties on cleanup if no external writer changed them. */
	restoreStyles?: boolean;
}

export interface BindingHandle {
	/** Publish current properties now, including inside an outer source batch. */
	refresh(): void;
	/** Release ownership; structural DOM is preserved unless removal is explicitly requested. */
	dispose(options?: { preserveDOM?: boolean }): void;
}

/**
 * Preserve normal rendering while leaving this attribute with its external owner.
 * The compiler recognizes this marker in an opted-in static view's attributes.
 */
export function unbound<T>(value: T): T {
	return value;
}

/**
 * Adopt a compiler-proven native view without loading a renderer.
 * Octane lowers this intrinsic in a compiled .tsrx/.tsx activation module.
 */
export function adoptBindings<Props>(
	_root: Element | BindingRange,
	_view: (props: Props) => unknown,
	_source: BindingSource<NoInfer<Props>>,
	_options?: BindingOptions,
): BindingHandle {
	throw new Error(
		'adoptBindings() requires an Octane-compiled .tsrx or .tsx call and a supported static view.',
	);
}

/** Construct a compiler-proven fragment at an application-owned insertion point. */
export function mountBindings<Props>(
	_target: BindingMountTarget,
	_view: (props: Props) => unknown,
	_source: BindingSource<NoInfer<Props>>,
	_options?: BindingOptions,
): BindingHandle {
	throw new Error('mountBindings() requires an Octane-compiled .tsrx or .tsx call.');
}

/** @internal Structural artifacts carry their own statically imported mounting entry. */
export function __mountBindings<Props>(
	target: BindingMountTarget,
	descriptor: CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	return descriptor.mount(target, descriptor, source, options);
}

/** @internal Element-only preorder; null children explicitly leave descendants opaque. */
export type BindingNode = readonly [
	parent: number,
	tag: string,
	namespace: 0 | 1,
	children: number | null,
	openChildren?: true | null,
	text?: 1,
];

/** @internal Names and numeric CSS units are resolved by the compiler. */
export type BindingOperation = readonly [
	node: number,
	kind:
		| 'attr'
		| 'boolean'
		| 'aria'
		| 'class'
		| 'classToken'
		| 'classGroup'
		| 'styleProperty'
		| 'styleAttribute'
		| 'styleObject'
		| 'control'
		| 'url'
		| 'text',
	name: string,
	unitlessOrGroup?: boolean | number,
];

/** @internal Whole styles carry canonical snapshots; scalar channels remain strings. */
export type BindingValue = string | null | BindingStyleSnapshot;

/** @internal No application function is invoked to discover the DOM topology. */
export interface CompiledBindings<Props> {
	readonly id: string;
	/** Compiler-proven single native host, with no descendant ownership. */
	readonly handoff?: 'host';
	/** Targets carry compiler-issued addresses when unbound siblings may change. */
	readonly addressed?: true;
	readonly nodes: readonly BindingNode[];
	readonly bindings: readonly BindingOperation[];
	readonly createClassGroup?: typeof createBindingClassGroup;
	readonly connectSignal?: typeof __createBindingSignals;
	readonly signalIndices?: readonly number[];
	readonly connectStyle?: typeof __createBindingStyles;
	readonly styleIndices?: readonly number[];
	readonly connectProjection?: typeof __createBindingProjections;
	readonly projectionGroups?: readonly BindingProjectionGroup[];
	readonly createControls?: typeof __createBindingControls;
	project(props: Props): readonly unknown[];
}

const claims = /* @__PURE__ */ new WeakMap<Element, Set<string>>();
const namespaces = ['http://www.w3.org/1999/xhtml', 'http://www.w3.org/2000/svg'];

function channel(binding: BindingOperation): string {
	return binding[1] === 'styleProperty'
		? `style:${binding[2]}`
		: binding[1] === 'classToken'
			? `class:${binding[2]}`
			: binding[1] === 'classGroup'
				? `classGroup:${binding[2]}:${binding[3]}`
				: binding[2];
}

function conflicts(channels: Set<string>, binding: BindingOperation, name: string): boolean {
	if (channels.has(name)) return true;
	if (binding[1] === 'styleProperty' && channels.has('style')) return true;
	if (name === 'style')
		for (const claimed of channels) if (claimed.startsWith('style:')) return true;
	if (binding[1] === 'classToken') {
		if (channels.has('class')) return true;
		for (const claimed of channels) if (claimed.startsWith('classGroup:')) return true;
	}
	if (binding[1] === 'classGroup') {
		if (channels.has('class')) return true;
		for (const claimed of channels) if (claimed.startsWith('class:')) return true;
	}
	if (name === 'class') {
		for (const claimed of channels)
			if (claimed.startsWith('class:') || claimed.startsWith('classGroup:')) return true;
	}
	return false;
}

/** @internal Shared channel ownership for compiled scalar and structural presentation. */
export function __claimBinding(node: Element, binding: BindingOperation): string {
	if (binding[1] === 'classToken' && !/^\S+$/.test(binding[2]))
		throw new TypeError('A DOM class token binding requires one nonempty class token.');
	const name = channel(binding);
	let channels = claims.get(node);
	if (channels !== undefined && conflicts(channels, binding, name))
		throw new Error('This DOM property already has a binding. Dispose it before rebinding.');
	if (channels === undefined) claims.set(node, (channels = new Set()));
	channels.add(name);
	return name;
}

/** @internal Release only a channel already claimed by the calling lifetime. */
export function __releaseBinding(node: Element, name: string): void {
	const channels = claims.get(node)!;
	channels.delete(name);
	if (channels.size === 0) claims.delete(node);
	const published = domBindingClaims.get(node);
	if (published) {
		published.delete(name);
		if (published.size === 0) domBindingClaims.delete(node);
	}
}

function resolveNodes(root: Element, descriptor: CompiledBindings<unknown>): Element[] {
	if (
		root?.nodeType !== 1 ||
		root.getAttribute('data-octane-bindings') !== descriptor.id ||
		descriptor.nodes.length === 0
	) {
		throw new Error('DOM bindings require the matching compiler-stamped root.');
	}
	if (descriptor.addressed) return resolveAddressedNodes(root, descriptor);
	const nodes: Element[] = [];
	const childIndices: number[] = [];
	for (let i = 0; i < descriptor.nodes.length; i++) {
		const [parent, tag, namespace, children, , text] = descriptor.nodes[i]!;
		const node =
			i === 0
				? parent === -1
					? root
					: undefined
				: parent >= 0 && parent < i && descriptor.nodes[parent]![3] !== null
					? nodes[parent]?.children[childIndices[parent]++]
					: undefined;
		if (
			node === undefined ||
			descriptor.nodes[i]![4] === true ||
			node.localName !== tag ||
			node.namespaceURI !== namespaces[namespace] ||
			(text
				? node.childNodes.length > 1 || (node.firstChild !== null && node.firstChild.nodeType !== 3)
				: children !== null &&
					(node.childNodes.length !== children || node.children.length !== children))
		) {
			throw new Error('DOM bindings cannot adopt a mismatched static element topology.');
		}
		nodes.push(node);
		childIndices.push(0);
	}
	for (let i = 0; i < nodes.length; i++) {
		if (childIndices[i] !== (descriptor.nodes[i]![3] ?? 0)) {
			throw new Error('DOM bindings cannot adopt an incomplete static element topology.');
		}
	}
	return nodes;
}

function resolveAddressedNodes(root: Element, descriptor: CompiledBindings<unknown>): Element[] {
	const nodes: Element[] = [];
	const prefix = `${descriptor.id}:`;
	let current: Element | null = root;
	while (current !== null) {
		// Other compiled roots and explicitly opaque targets retain their own
		// descendants. Resolve this view's addresses only once, during adoption.
		let descend = current === root || !current.hasAttribute('data-octane-bindings');
		if (descend) {
			const marker = current.getAttribute('data-octane-binding-node');
			if (marker?.startsWith(prefix)) {
				const index = Number(marker.slice(prefix.length));
				if (
					!Number.isSafeInteger(index) ||
					index < 0 ||
					index >= descriptor.nodes.length ||
					marker !== `${prefix}${index}` ||
					nodes[index] !== undefined
				) {
					throw new Error('DOM bindings require unique compiler-issued target addresses.');
				}
				nodes[index] = current;
				if (descriptor.nodes[index]![3] === null) descend = false;
			}
		}
		if (descend && current.firstElementChild !== null) {
			current = current.firstElementChild;
			continue;
		}
		while (current !== root && current.nextElementSibling === null)
			current = current.parentElement!;
		if (current === root) break;
		current = current.nextElementSibling;
	}
	const childCounts = new Array<number>(descriptor.nodes.length).fill(0);
	for (let i = 0; i < descriptor.nodes.length; i++) {
		const [parent, tag, namespace, children, openChildren, text] = descriptor.nodes[i]!;
		const node = nodes[i];
		if (
			node === undefined ||
			node.localName !== tag ||
			node.namespaceURI !== namespaces[namespace] ||
			(i === 0
				? parent !== -1 || node !== root
				: parent < 0 ||
					parent >= i ||
					descriptor.nodes[parent]![3] === null ||
					node.parentElement !== nodes[parent] ||
					(descriptor.nodes[parent]![4] !== true &&
						nodes[parent]!.children[childCounts[parent]!] !== node)) ||
			(openChildren && children === null) ||
			(text
				? node.childNodes.length > 1 || (node.firstChild !== null && node.firstChild.nodeType !== 3)
				: children !== null &&
					!openChildren &&
					(node.childNodes.length !== children || node.children.length !== children))
		) {
			throw new Error('DOM bindings cannot adopt a mismatched addressed element topology.');
		}
		if (parent !== -1) childCounts[parent]++;
	}
	for (let i = 0; i < descriptor.nodes.length; i++) {
		if (childCounts[i] !== (descriptor.nodes[i]![3] ?? 0)) {
			throw new Error('DOM bindings cannot adopt an incomplete addressed element topology.');
		}
	}
	return nodes;
}

function normalize(binding: BindingOperation, value: unknown): BindingValue {
	const type = typeof value;
	switch (binding[1]) {
		case 'text':
			if (value == null || value === false) return '';
			if (type !== 'string' && type !== 'number' && type !== 'bigint' && type !== 'boolean')
				throw new TypeError('DOM binding text must be a synchronous scalar.');
			return String(value);
		case 'styleObject':
			return value as BindingValue;
		case 'class':
			return value == null || value === false ? null : normalizeClass(value);
		case 'classGroup':
			return value == null || value === false ? '' : normalizeClass(value);
		case 'styleAttribute':
			if (value == null || value === false || value === '') return null;
			if (type !== 'string')
				throw new TypeError('A whole-style DOM binding requires serialized CSS text or null.');
			return value as string;
		case 'classToken':
			return value ? '' : null;
		case 'url':
			return value == null || type === 'boolean' || type === 'function' || type === 'symbol'
				? null
				: sanitizeURL(String(value));
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
	if (binding[1] === 'text') {
		const text = node.firstChild;
		if (text === null) node.appendChild(node.ownerDocument.createTextNode(value!));
		else if (text.nodeValue !== value) text.nodeValue = value;
	} else if (binding[1] === 'classToken') {
		node.classList.toggle(name, value !== null);
	} else if (binding[1] === 'url') {
		if (value === '' && !(name === 'href' && node.localName === 'a')) value = null;
		if (name === 'xlink:href') {
			if (value === null) node.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
			else if (node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') !== value)
				node.setAttributeNS('http://www.w3.org/1999/xlink', name, value);
		} else if (value === null) {
			if (node.hasAttribute(name)) node.removeAttribute(name);
		} else if (node.getAttribute(name) !== value) node.setAttribute(name, value);
	} else if (binding[1] === 'styleProperty') {
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

export { normalize as __normalizeBinding, write as __writeBinding };

/** @internal Optional native style restoration; the default scalar path does not allocate it. */
export function __createBindingStyleRestoration(
	node: Element,
	binding: BindingOperation,
): {
	write(value: string | null): void;
	dispose(preservePresentation?: boolean): void;
} {
	if (binding[1] === 'styleAttribute') {
		let baseline: string | null | undefined;
		let expected: string | null | undefined;
		let disposed = false;
		return {
			write(value) {
				if (disposed) return;
				if (baseline === undefined) baseline = node.getAttribute('style');
				expected = value;
				write(node, binding, value);
			},
			dispose(preservePresentation) {
				if (disposed) return;
				disposed = true;
				if (
					!preservePresentation &&
					baseline !== undefined &&
					node.getAttribute('style') === expected
				)
					write(node, binding, baseline);
			},
		};
	}
	const style = (node as HTMLElement | SVGElement).style;
	const name = binding[2];
	let baseline: readonly [string, string] | undefined;
	let expected: readonly [string, string] | undefined;
	let probe: HTMLElement | undefined;
	let disposed = false;
	return {
		write(value) {
			if (disposed) return;
			baseline ??= [style.getPropertyValue(name), style.getPropertyPriority(name)];
			// Canonicalize before the live write, so even a synchronous native
			// attribute reaction can dispose without guessing which value we wrote.
			probe ??= node.ownerDocument.createElement('i');
			probe.style.cssText = '';
			probe.style.setProperty(name, style.getPropertyValue(name), style.getPropertyPriority(name));
			write(probe, binding, value);
			expected = [probe.style.getPropertyValue(name), probe.style.getPropertyPriority(name)];
			write(node, binding, value);
		},
		dispose(preservePresentation) {
			if (disposed) return;
			disposed = true;
			if (
				!preservePresentation &&
				baseline &&
				expected &&
				style.getPropertyValue(name) === expected[0] &&
				style.getPropertyPriority(name) === expected[1]
			) {
				if (baseline[0] === '') style.removeProperty(name);
				else style.setProperty(name, baseline[0], baseline[1]);
			}
		},
	};
}

/** @internal Fixed-layout adopter and compatibility dispatch for earlier compiler output. */
export function __adoptBindings<Props>(
	root: Element | BindingRange,
	descriptor: CompiledBindings<Props> | CompiledBindingProgram<Props>,
	source: BindingSource<Props>,
	options?: BindingOptions,
): BindingHandle {
	// Only structural programs carry a root. Scalar artifacts also expose their
	// selected adopter, so dispatching by that method would recurse into itself.
	if ('root' in descriptor) return descriptor.adopt(root, descriptor, source, options);
	if (!source || typeof source.getSnapshot !== 'function' || typeof source.subscribe !== 'function')
		throw new TypeError('DOM bindings require synchronous getSnapshot() and subscribe() methods.');
	const nodes = resolveNodes(root as Element, descriptor);
	const bindings = descriptor.bindings;
	const owned: Array<readonly [Element, string]> = [];
	const previous: Array<BindingValue | undefined> = [];
	let groups: Map<number, ReturnType<typeof createBindingClassGroup>> | undefined;
	let styles: Map<number, ReturnType<typeof __createBindingStyleRestoration>> | undefined;
	const signalFactory = descriptor.connectSignal?.();
	const styleFactory = descriptor.connectStyle?.();
	const projectionFactory = descriptor.connectProjection?.();
	const projections = projectionFactory
		? new Map<number, BindingProjectionConnection>()
		: undefined;
	const controlFactory = descriptor.createControls?.();
	const controls = controlFactory ? new Map<number, BindingControlLease>() : undefined;
	const signalConnections =
		signalFactory || styleFactory ? new Map<number, BindingSignalConnection>() : undefined;
	const signalUpdates =
		signalFactory || styleFactory || projectionFactory || controlFactory
			? new Set<number>()
			: undefined;
	let disposed = false;
	let busy = true;
	let dirty = false;
	let revision = 0;
	let unsubscribe: (() => void) | undefined;
	let publicationRetries: Set<() => void> | undefined;
	let published: (() => void) | undefined;
	const signal = options?.signal;
	const dispose = (
		_disposal?: { preserveDOM?: boolean } | Event,
		publish?: () => void,
		preservePresentation = false,
	): void => {
		if (disposed) {
			publish?.();
			return;
		}
		disposed = true;
		publicationRetries?.clear();
		signal?.removeEventListener('abort', dispose);
		let failed = false;
		let failure: unknown;
		// Mark the early writer inactive before successor publication. Arbitrary
		// signal/source cleanup below must observe the accepted renderer owner.
		try {
			publish?.();
		} catch (error) {
			failed = true;
			failure = error;
		}
		for (const connection of signalConnections?.values() ?? []) {
			try {
				connection.dispose(preservePresentation);
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		for (const connection of projections ? new Set(projections.values()) : []) {
			try {
				connection.dispose(preservePresentation);
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		projections?.clear();
		for (const control of controls?.values() ?? []) {
			try {
				control.dispose();
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}
		controls?.clear();
		signalConnections?.clear();
		signalUpdates?.clear();
		for (let i = 0; i < owned.length; i++) {
			const [node, name] = owned[i]!;
			try {
				groups?.get(i)?.dispose(preservePresentation);
				styles?.get(i)?.dispose(preservePresentation);
				// A declared token adopts its server contribution, not a permanent
				// baseline. Keep its claim until removal so reentrant adoption cannot
				// acquire a token that this lifetime is still cleaning up.
				if (!preservePresentation && bindings[i]![1] === 'classToken' && previous[i] === '')
					node.classList.remove(bindings[i]![2]);
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
			__releaseBinding(node, name);
		}
		owned.length = nodes.length = previous.length = 0;
		groups?.clear();
		styles?.clear();
		const stop = unsubscribe;
		unsubscribe = undefined;
		try {
			stop?.();
		} catch (error) {
			if (!failed) throw error;
		}
		if (failed) throw failure;
	};
	const prepareProjection = projections
		? (
				index: number,
				next: BindingValue[],
				indices: number[] | undefined,
			): BindingProjectionGroup | undefined => {
				const projection = projections.get(index);
				if (!projection) return;
				if (index === projection.group[0]![0]) {
					const values = projection.get();
					for (const [fieldIndex] of projection.group) {
						next[fieldIndex] = values[fieldIndex]!;
						if (indices && !indices.includes(fieldIndex)) indices.push(fieldIndex);
					}
				}
				return projection.group;
			}
		: undefined;
	const writePrepared = (
		next: BindingValue[],
		indices: number[] | undefined,
		preparedControls: Map<number, BindingControlPrepared> | undefined,
		preparedGroups: Map<number, { commit(): void }> | undefined,
	): void => {
		for (
			let position = 0;
			position < (indices?.length ?? bindings.length) && !dirty && !disposed;
			position++
		) {
			const i = indices ? indices[position]! : position;
			if (bindings[i]![1] === 'control') {
				preparedControls!.get(i)!.commit();
				continue;
			}
			if (next[i] === previous[i]) continue;
			const binding = bindings[i]!;
			if (binding[1] === 'classToken') previous[i] = next[i]!;
			if (binding[1] === 'styleObject') {
				const projection = projections?.get(i);
				if (projection) projection.writeStyle(i, next[i]!);
				else signalConnections!.get(i)!.write!(next[i]);
			} else if (binding[1] === 'classGroup') preparedGroups!.get(i)!.commit();
			else if (
				(binding[1] === 'styleProperty' || binding[1] === 'styleAttribute') &&
				options?.restoreStyles
			) {
				styles ??= new Map();
				let style = styles.get(i);
				if (!style)
					styles.set(i, (style = __createBindingStyleRestoration(nodes[binding[0]]!, binding)));
				style.write(next[i] as string | null);
			} else write(nodes[binding[0]]!, binding, next[i] as string | null);
			if (!disposed) {
				previous[i] = next[i]!;
				// Only fixed scalar channels participate in this legacy handoff.
				// New grouped/style/control channels keep the native lease protocol.
				if (
					binding[1] === 'attr' ||
					binding[1] === 'boolean' ||
					binding[1] === 'aria' ||
					binding[1] === 'class' ||
					binding[1] === 'styleProperty' ||
					binding[1] === 'text'
				) {
					const [node, name] = owned[i]!;
					let published = next[i] as string | null;
					if (binding[1] === 'styleProperty') {
						const style = (node as HTMLElement | SVGElement).style;
						const value = style.getPropertyValue(binding[2]);
						published =
							value === ''
								? null
								: value + (style.getPropertyPriority(binding[2]) ? ' !important' : '');
					}
					let claims = domBindingClaims.get(node);
					if (claims === undefined) domBindingClaims.set(node, (claims = new Map()));
					claims.set(name, published);
				}
			}
		}
	};
	const drain = (preview = false): void | NativeTransitionPresentation => {
		if (disposed) return;
		if (busy) return preview ? { validate: () => false, commit() {}, discard() {} } : undefined;
		const version = revision;
		const previousDirty = dirty;
		const previousUpdates = preview && signalUpdates ? [...signalUpdates] : undefined;
		const preparedSignals =
			preview && signalConnections ? new Map(signalConnections) : signalConnections;
		const preparedProjections = preview && projections ? new Map(projections) : projections;
		const receipts: BindingPreparedValue[] | undefined = preview ? [] : undefined;
		const controlReceipts: BindingControlPreview[] | undefined = preview ? [] : undefined;
		let accepted = false;
		let retired = false;
		const discard = preview
			? (): void => {
					if (accepted || retired) return;
					retired = true;
					for (const receipt of receipts!) receipt.discard();
					for (const control of controlReceipts!) control.discard();
					for (const [index, connection] of preparedSignals ?? [])
						if (connection !== signalConnections?.get(index)) connection.dispose(true);
					for (const [index, connection] of preparedProjections ?? [])
						if (connection !== projections?.get(index)) connection.dispose(true);
				}
			: undefined;
		if (preview) dirty = true;
		busy = true;
		try {
			while ((dirty || signalUpdates?.size) && !disposed) {
				let next: BindingValue[];
				let indices: number[] | undefined;
				const preparedControls = controls ? new Map<number, BindingControlPrepared>() : undefined;
				if (dirty) {
					dirty = false;
					signalUpdates?.clear();
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
					let resolved = values;
					if (projectionFactory && descriptor.projectionGroups) {
						for (const group of descriptor.projectionGroups) {
							if (disposed || dirty) break;
							const first = group[0]![0];
							let connection = preparedProjections!.get(first);
							if (!connection) {
								connection = projectionFactory.connect(
									group,
									bindings,
									nodes,
									forwardNativeTransitionConsumer(refresh, () => {
										if (!disposed) {
											revision++;
											signalUpdates!.add(first);
											drain();
										}
									}),
									options?.restoreStyles,
								);
								for (const [index] of group) preparedProjections!.set(index, connection);
							}
							const receipt = preview ? connection.preview(values[first]) : undefined;
							if (receipt) receipts!.push(receipt);
							const projected = receipt ? receipt.value : connection.read(values[first]);
							if (resolved === values) resolved = [...values];
							for (const [index] of group) (resolved as unknown[])[index] = projected[index];
						}
					}
					if (styleFactory && descriptor.styleIndices) {
						for (const index of descriptor.styleIndices) {
							if (disposed || dirty) break;
							let connection = preparedSignals!.get(index);
							if (!connection) {
								connection = styleFactory.connect(
									nodes[bindings[index]![0]]!,
									forwardNativeTransitionConsumer(refresh, () => {
										if (!disposed) {
											revision++;
											signalUpdates!.add(index);
											drain();
										}
									}),
									options?.restoreStyles,
								);
								preparedSignals!.set(index, connection);
							}
							if (resolved === values) resolved = [...values];
							const receipt = preview ? connection.preview(values[index]) : undefined;
							if (receipt) receipts!.push(receipt);
							(resolved as unknown[])[index] = receipt
								? receipt.value
								: connection.read(values[index]);
						}
					}
					if (signalFactory && descriptor.signalIndices) {
						for (const index of descriptor.signalIndices) {
							if (disposed || dirty) break;
							let connection = preparedSignals!.get(index);
							if (!connection && signalFactory.isSignal(values[index])) {
								connection = signalFactory.connect(
									forwardNativeTransitionConsumer(refresh, () => {
										if (!disposed) {
											revision++;
											signalUpdates!.add(index);
											drain();
										}
									}),
								);
								preparedSignals!.set(index, connection);
							}
							if (connection) {
								if (resolved === values) resolved = [...values];
								const receipt = preview ? connection.preview(values[index]) : undefined;
								if (receipt) receipts!.push(receipt);
								(resolved as unknown[])[index] = receipt
									? receipt.value
									: connection.read(values[index]);
							}
						}
					}
					next = resolved.map((value, index) => {
						const control = controls?.get(index);
						if (control) {
							const prepared = preview ? control.preview(value) : control.prepare(value);
							controlReceipts?.push(prepared as BindingControlPreview);
							preparedControls!.set(index, prepared);
							return null;
						}
						return normalize(bindings[index]!, value);
					});
				} else {
					indices = [...signalUpdates!];
					signalUpdates!.clear();
					next = [];
					for (const index of indices) {
						if (prepareProjection?.(index, next, indices)) continue;
						const control = controls?.get(index);
						if (control) preparedControls!.set(index, control.prepareCurrent());
						else next[index] = normalize(bindings[index]!, signalConnections!.get(index)!.get());
					}
				}
				// Invalidation during another channel's coercion settles only connected
				// values, without fetching or projecting the application source again.
				while (!preview && signalUpdates?.size && !dirty && !disposed) {
					const pending = [...signalUpdates];
					signalUpdates.clear();
					for (const index of pending) {
						if (prepareProjection?.(index, next, indices)) continue;
						const control = controls?.get(index);
						if (control) preparedControls!.set(index, control.prepareCurrent());
						else next[index] = normalize(bindings[index]!, signalConnections!.get(index)!.get());
						if (indices && !indices.includes(index)) indices.push(index);
					}
				}
				const preparedGroups =
					groups &&
					new Map(
						[...groups]
							.filter(([index]) => !indices || indices.includes(index))
							.map(([index, group]) => [
								index,
								group.prepare((next[index] as string | null) ?? ''),
							]),
					);
				// Early edits publish only after every channel has prepared successfully.
				// Settle their derived channels before committing any native writes.
				if (preparedControls && !preview) {
					while (!dirty && !disposed) {
						for (const control of preparedControls.values()) {
							control.publish();
							if (dirty || disposed) break;
						}
						if (!signalUpdates?.size || dirty || disposed) break;
						const pending = [...signalUpdates];
						signalUpdates.clear();
						for (const index of pending) {
							const projection = prepareProjection?.(index, next, indices);
							if (projection) {
								for (const [fieldIndex] of projection) {
									const group = groups?.get(fieldIndex);
									if (group)
										preparedGroups!.set(
											fieldIndex,
											group.prepare((next[fieldIndex] as string | null) ?? ''),
										);
								}
								continue;
							}
							const control = controls?.get(index);
							if (control) preparedControls.set(index, control.prepareCurrent());
							else {
								next[index] = normalize(bindings[index]!, signalConnections!.get(index)!.get());
								const group = groups?.get(index);
								if (group)
									preparedGroups!.set(index, group.prepare((next[index] as string | null) ?? ''));
							}
							if (indices && !indices.includes(index)) indices.push(index);
						}
					}
				}
				// A getter/coercion may synchronously notify or end the owner lifetime.
				// Never publish an obsolete prepared snapshot or mutate after disposal.
				if (preview)
					return {
						validate: () =>
							!retired &&
							!disposed &&
							revision === version &&
							receipts!.every((receipt) => receipt.validate()) &&
							controlReceipts!.every((control) => control.validate()),
						discard: discard!,
						commit() {
							if (disposed || retired || accepted) return;
							accepted = true;
							busy = true;
							try {
								for (const [index, connection] of preparedSignals ?? [])
									signalConnections!.set(index, connection);
								for (const [index, connection] of preparedProjections ?? [])
									projections!.set(index, connection);
								for (const receipt of receipts!) receipt.commit();
								for (const control of preparedControls?.values() ?? []) control.publish();
								writePrepared(next, indices, preparedControls, preparedGroups);
							} finally {
								busy = false;
								published?.();
							}
						},
					};
				if (dirty || disposed) continue;
				writePrepared(next, indices, preparedControls, preparedGroups);
			}
		} catch (error) {
			if (preview) {
				discard!();
				throw error;
			}
			try {
				dispose();
			} catch {
				// Preserve the projection failure if application cleanup also throws.
			}
			throw error;
		} finally {
			if (preview) {
				dirty ||= previousDirty;
				for (const index of previousUpdates ?? []) signalUpdates!.add(index);
			}
			busy = false;
			if (!preview) published?.();
		}
	};
	const refresh: NativeTransitionNotify = (): void => {
		if (disposed) return;
		revision++;
		dirty = true;
		drain();
	};
	const owner = currentSignalOwner();
	const run = owner === null ? <T>(callback: () => T): T => callback() : captureSignalOwner(owner);
	refresh[NATIVE_TRANSITION_CONSUMER] = {
		active: () => !disposed,
		prepare: () => run(() => drain(true)),
	};
	const handle: BindingHandle & Partial<BindingHandoffCapability> = { refresh, dispose };
	if (descriptor.handoff === 'host') {
		published = () => {
			if (!publicationRetries?.size) return;
			const pending = [...publicationRetries];
			publicationRetries.clear();
			for (const retry of pending)
				queueMicrotask(() => {
					if (!disposed) retry();
				});
		};
		const host = root as Element;
		const document = host.ownerDocument;
		const ancestry: Array<readonly [Node, ParentNode | null]> = [];
		for (let node: Node | null = host; node !== null; node = node.parentNode)
			ancestry.push([node, node.parentNode]);
		// Renderer seed/reveal sidecars are consumed before native hydration.
		// Authored siblings still identify the exact host site across that cleanup.
		const sibling = (node: Node, previous: boolean): Node | null => {
			let next = previous ? node.previousSibling : node.nextSibling;
			while (
				next?.nodeType === 1 &&
				(next as Element).localName === 'script' &&
				((next as Element).hasAttribute(NATIVE_SIGNAL_SEED_ATTR) ||
					(next as Element).hasAttribute(SUSPENSE_SCRIPT_ATTR) ||
					(next as Element).hasAttribute(STREAM_SCRIPT_ATTR))
			)
				next = previous ? next.previousSibling : next.nextSibling;
			return next;
		};
		const previousSibling = sibling(host, true);
		const nextSibling = sibling(host, false);
		let handoff: BindingHandoff | undefined;
		handle[BINDING_HANDOFF] = () => {
			if (handoff !== undefined) return handoff;
			return (handoff = {
				id: descriptor.id,
				root: host,
				anchor: host,
				host: new Set(
					bindings.map((binding) =>
						binding[1] === 'styleProperty'
							? 'style:' + binding[2]
							: binding[1].startsWith('style')
								? 'style'
								: binding[2],
					),
				),
				revision: () => (busy ? -1 : revision),
				afterPublication: (callback) => {
					(publicationRetries ??= new Set()).add(callback);
					return () => publicationRetries!.delete(callback);
				},
				valid: () =>
					host.parentNode !== null &&
					host.ownerDocument === document &&
					ancestry.every(([node, parent]) => node.parentNode === parent) &&
					sibling(host, true) === previousSibling &&
					sibling(host, false) === nextSibling &&
					host.getAttribute('data-octane-bindings') === descriptor.id,
				active: () => !disposed,
				retire: (publish) => dispose(undefined, publish, true),
			});
		};
	}
	if (signal?.aborted) {
		dispose();
		return handle;
	}
	try {
		// Claim all channels before invoking source callbacks or mutating any node.
		for (let index = 0; index < bindings.length; index++) {
			const binding = bindings[index]!;
			const node = nodes[binding[0]];
			if (node === undefined) throw new TypeError('A DOM binding targets an unknown element.');
			owned.push([node, __claimBinding(node, binding)]);
			if (binding[1] === 'control') {
				controls!.set(
					index,
					controlFactory!.claim(
						node,
						binding[2] as 'value' | 'checked',
						forwardNativeTransitionConsumer(refresh, () => {
							if (!disposed) {
								revision++;
								signalUpdates!.add(index);
								drain();
							}
						}),
					),
				);
			}
			if (binding[1] === 'classGroup') {
				groups ??= new Map();
				groups.set(index, descriptor.createClassGroup!(node, binding[2], binding[3] as number));
			}
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
