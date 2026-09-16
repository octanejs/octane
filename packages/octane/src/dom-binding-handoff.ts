/** Renderer-independent capability carried by an adopted, compiler-proven view. */
export const BINDING_HANDOFF = /* @__PURE__ */ Symbol.for('octane.binding-handoff');

export interface BindingHandoff {
	readonly id: string;
	readonly root: Node;
	readonly anchor: Node;
	active(): boolean;
	retire(publish?: () => void): void;
	owner?: object;
}

export interface BindingHandoffCapability {
	[BINDING_HANDOFF](): BindingHandoff;
}

const events = /* @__PURE__ */ new WeakMap<Node, Map<string, number>>();
const delivered = /* @__PURE__ */ new WeakMap<Event, Map<Node, number>>();

/** @internal Reuse the adapter's native listener lifetime; no renderer dependency. */
export function registerBindingEvent(node: Node, type: string): () => void {
	let counts = events.get(node);
	if (counts === undefined) events.set(node, (counts = new Map()));
	counts.set(type, (counts.get(type) ?? 0) + 1);
	return () => {
		const count = counts!.get(type)! - 1;
		if (count === 0) counts!.delete(type);
		else counts!.set(type, count);
		if (counts!.size === 0) events.delete(node);
	};
}

/** @internal Called only by a host explicitly acquiring bindingLeases. */
export function claimBindingHandoff(lease: BindingHandoff, owner: object): void {
	if (!lease.active() || lease.owner !== undefined)
		throw new Error('A DOM binding hydration lease must be active and have only one root owner.');
	lease.owner = owner;
}

/** @internal Releasing a pending claim does not dispose the early presentation. */
export function releaseBindingHandoff(lease: BindingHandoff): void {
	lease.owner = undefined;
}

/** @internal Native adapters work before the host imports its renderer. */
export function hasBindingHandoffEvent(event: Event): boolean {
	for (const node of event.composedPath()) {
		if (events.get(node as Node)?.has(event.type)) return true;
	}
	return false;
}

/** @internal A synchronous takeover must not redeliver the original native command. */
export function markBindingEvent(event: Event, node: Node, capture: boolean): void {
	let nodes = delivered.get(event);
	if (nodes === undefined) {
		delivered.set(event, (nodes = new Map()));
		const cleanup = () => {
			if (delivered.get(event) === nodes) delivered.delete(event);
		};
		// Trusted native dispatch can checkpoint microtasks between listeners.
		if (event.isTrusted) setTimeout(cleanup, 0);
		else queueMicrotask(cleanup);
	}
	nodes.set(node, (nodes.get(node) ?? 0) | (capture ? 2 : 1));
}

/** @internal Consume only this node/phase, preserving unrelated ancestor handlers. */
export function consumeBindingEvent(event: Event, node: Node, capture: boolean): boolean {
	const nodes = delivered.get(event);
	const flags = nodes?.get(node) ?? 0;
	const bit = capture ? 2 : 1;
	if ((flags & bit) === 0) return false;
	if ((flags & ~bit) === 0) nodes!.delete(node);
	else nodes!.set(node, flags & ~bit);
	return true;
}

/** @internal The renderer's outermost native capture observer starts each dispatch. */
export function beginBindingEvent(event: Event): void {
	delivered.delete(event);
}
