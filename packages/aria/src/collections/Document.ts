// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/collections/Document.ts).
//
// GOVERNING ADAPTATION (docs/aria-migration-plan.md §2a; docs/aria-phase-4-handoff.md):
// upstream renders the hidden collection tree through a React portal into a
// hand-written FAKE Document whose host-config mutations (createElement /
// appendChild / insertBefore / removeChild) maintain a mutable fake node tree.
// octane's compiled templates write REAL DOM, so a fake document can never
// receive its writes. Instead, the hidden structural copy renders via octane
// `createPortal` into a DETACHED, never-attached real container owned by this
// Document, and the store is driven by:
//
//   - REF REGISTRATION: each `<item>`/`<section>`-style placeholder element
//     (valid HTMLUnknownElements) carries a ref that calls
//     `Document.setElementProps(element, props, …)`, mapping the real element
//     to an `ElementNode` in a `WeakMap<Element, ElementNode>` and updating its
//     immutable CollectionNode copy-on-write (upstream's `setProps` cadence).
//   - REAL-DOM WALKING: snapshots rebuild by walking the detached container in
//     document order (the source of truth upstream's fake sibling links encode).
//     Unregistered wrapper elements are transparent (descended through);
//     `display: none` elements are excluded (upstream's Suspense-hide handling
//     via the fake `style.display` setter).
//   - MUTATION OBSERVER: upstream marks the store dirty synchronously inside
//     the fake host-config calls. Real-DOM moves (keyed reorders of cached
//     children) fire no refs, so a MutationObserver on the detached container
//     is the structural dirty signal. Its delivery is a microtask after commit;
//     `getCollection()` additionally drains `takeRecords()` so any render-time
//     read observes a consistent snapshot. Prop updates still mark dirty
//     synchronously through ref re-registration.
//
// Upstream semantics preserved: mutation batching with immutable BaseCollection
// snapshots, subscribe/getSnapshot for useSyncExternalStore (clone-to-notify,
// `inSubscription`/`queuedRender` bookkeeping ported verbatim), copy-on-write
// node cloning so untouched nodes keep identity across updates, generated
// `react-aria-N` keys, and the id-change error. The fake BaseNode sibling/index
// bookkeeping (insertBefore/appendChild/invalidateChildIndices) collapses away:
// the real DOM already stores order.
//
// SSR mirrors upstream's separate path: nodes are created during render, in
// order, into a lightweight parent/children tree (no DOM), and the collection
// is mutated IN PLACE (unfrozen) so the snapshot handed to the content render
// fills as registration proceeds. PHASE-8: SSR/hydration coverage is deferred;
// the path is ported structurally but not yet exercised by tests.
import type { Key, Node } from '@react-types/shared';
import { BaseCollection, CollectionNode, Mutable } from './BaseCollection';
import type { CollectionNodeClass } from './CollectionBuilder';

/**
 * A mutable element entry owning an immutable CollectionNode which is copied
 * on write. On the client it wraps a REAL placeholder element in the detached
 * container; during SSR it is a lightweight render-phase tree node (upstream's
 * fake ElementNode, minus the sibling/index bookkeeping the real DOM provides).
 */
export class ElementNode<T> {
	readonly type: string;
	ownerDocument: Document<T, any>;
	/** The real placeholder element this entry mirrors (client mode). */
	element: Element | null = null;
	/** Ordered children (SSR mode only — client order comes from the DOM). */
	ssrChildren: ElementNode<T>[] | null = null;
	node: CollectionNode<T> | null = null;
	isMutated = true;

	constructor(type: string, ownerDocument: Document<T, any>) {
		this.type = type;
		this.ownerDocument = ownerDocument;
	}

	/** SSR-only: children append in render order (octane SSR is single-pass ordered). */
	appendChild(child: ElementNode<T>): void {
		(this.ssrChildren ??= []).push(child);
	}

	/**
	 * Lazily gets a mutable instance of a Node. If the node has already
	 * been cloned during this update cycle, it just returns the existing one.
	 */
	getMutableNode(): Mutable<CollectionNode<T>> {
		if (!this.isMutated) {
			this.node = this.node!.clone();
			this.isMutated = true;
		}

		this.ownerDocument.markDirty(this);
		return this.node as Mutable<CollectionNode<T>>;
	}

	setProps<E extends Element>(
		obj: { [key: string]: any },
		ref: any,
		CollectionNodeClass: CollectionNodeClass<any>,
		rendered?: any,
		render?: (node: Node<T>) => any,
	): void {
		let node: Mutable<CollectionNode<T>>;
		let { value, textValue, id, ...props } = obj;
		if (this.node == null) {
			node = new CollectionNodeClass(id ?? `react-aria-${++this.ownerDocument.nodeId}`);
			this.node = node;
			this.ownerDocument.markDirty(this);
		} else {
			node = this.getMutableNode();
		}

		props.ref = ref;
		node.props = props;
		node.rendered = rendered;
		node.render = render;
		node.value = value;
		if (obj['aria-label']) {
			node['aria-label'] = obj['aria-label'];
		}
		node.textValue =
			textValue ||
			(typeof props.children === 'string' ? props.children : '') ||
			obj['aria-label'] ||
			'';
		if (id != null && id !== node.key) {
			throw new Error('Cannot change the id of an item');
		}

		if (props.colSpan != null) {
			node.colSpan = props.colSpan;
		}

		this.ownerDocument.queueUpdate();
	}
}

// Node-field assignment used by the walk: clone-on-write only when a computed
// structural field actually changed, so untouched nodes keep object identity
// across updates (the caching contract downstream renderers rely on).
interface WalkFields {
	index: number;
	level: number;
	parentKey: Key | null;
	prevKey: Key | null;
	nextKey: Key | null;
	hasChildNodes: boolean;
	firstChildKey: Key | null;
	lastChildKey: Key | null;
	colIndex: number | null;
}

function fieldsDiffer<T>(node: CollectionNode<T>, f: WalkFields): boolean {
	return (
		node.index !== f.index ||
		node.level !== f.level ||
		node.parentKey !== f.parentKey ||
		node.prevKey !== f.prevKey ||
		node.nextKey !== f.nextKey ||
		node.hasChildNodes !== f.hasChildNodes ||
		node.firstChildKey !== f.firstChildKey ||
		node.lastChildKey !== f.lastChildKey ||
		node.colIndex !== f.colIndex
	);
}

/**
 * The binding-owned Document store. It owns the detached real container the
 * hidden structural copy renders into, the Element → ElementNode registration
 * map, and an immutable Collection instance which is lazily copied on write
 * during updates.
 */
export class Document<T, C extends BaseCollection<T> = BaseCollection<T>> {
	ownerDocument: Document<T, C> = this;
	isSSR = false;
	nodeId = 0;
	/** SSR double-render guard, ported verbatim (props identity → created node). */
	nodesByProps: WeakMap<object, ElementNode<T>> = new WeakMap();

	private rootElement: Element | null = null;
	private observer: MutationObserver | null = null;
	private nodesByElement: WeakMap<Element, ElementNode<T>> = new WeakMap();
	private dirtyNodes: Set<ElementNode<T>> = new Set();
	private structureDirty = false;
	/** The first commit must freeze/commit the (possibly empty) initial collection. */
	private needsCommit = true;

	/** SSR-only render-phase tree root (client order comes from the real DOM). */
	private ssrChildren: ElementNode<T>[] = [];

	private collection: C;
	private subscriptions: Set<() => void> = new Set();
	private queuedRender = false;
	private inSubscription = false;

	constructor(collection: C) {
		this.collection = collection;
	}

	/**
	 * The detached, never-attached real container the hidden structural copy
	 * portals into. Document order inside it is the collection's source of truth.
	 */
	getRootElement(): Element | null {
		if (this.rootElement === null && typeof document !== 'undefined') {
			this.rootElement = document.createElement('div');
			if (typeof MutationObserver !== 'undefined') {
				this.observer = new MutationObserver(() => {
					// Structural change with no ref re-fire (keyed reorder of cached
					// children, removal of an unmounted subtree). Batch like any
					// other mutation and notify subscribers.
					this.structureDirty = true;
					this.queueUpdate();
				});
				this.observer.observe(this.rootElement, {
					childList: true,
					subtree: true,
					// Suspense/Activity hides content via inline `style.display =
					// 'none'` (octane's hideActivityRange, same as React) — upstream
					// models exactly this with the fake `style.display` setter:
					// hidden elements remain in the Document but are removed from
					// the Collection. Observe `style` so those subtrees drop out of
					// the snapshot; the walk excludes `display: none` and nothing
					// else (the `hidden` attribute is NOT a hide signal in either
					// runtime, matching upstream).
					attributes: true,
					attributeFilter: ['style'],
				});
			}
		}
		return this.rootElement;
	}

	/** SSR-only: creates a render-phase tree node (upstream's `createElement`). */
	createElement(type: string): ElementNode<T> {
		return new ElementNode(type, this);
	}

	/** SSR-only: top-level nodes append in render order. */
	appendChild(child: ElementNode<T>): void {
		this.ssrChildren.push(child);
	}

	/**
	 * Ref-registration entry point (replaces upstream's fake-element `setProps`
	 * receiver): maps the real placeholder element to its ElementNode and
	 * applies the item's props to the immutable node copy-on-write.
	 */
	setElementProps(
		element: Element,
		props: { [key: string]: any },
		ref: any,
		CollectionNodeClass: CollectionNodeClass<any>,
		rendered?: any,
		render?: (node: Node<T>) => any,
	): void {
		let entry = this.nodesByElement.get(element);
		if (entry === undefined) {
			entry = new ElementNode(CollectionNodeClass.type, this);
			entry.element = element;
			this.nodesByElement.set(element, entry);
		}
		entry.setProps(props, ref, CollectionNodeClass, rendered, render);
	}

	markDirty(node: ElementNode<T>): void {
		this.dirtyNodes.add(node);
	}

	private hasDirty(): boolean {
		return this.dirtyNodes.size > 0 || this.structureDirty || this.needsCommit;
	}

	// Fold any not-yet-delivered MutationObserver records into the dirty state so
	// render-time reads are consistent with the committed DOM (the async callback
	// covers mutations nothing else reads synchronously).
	private drainMutations(): void {
		if (this.observer !== null && this.observer.takeRecords().length > 0) {
			this.structureDirty = true;
		}
	}

	/** Finalizes the collection update, updating all nodes and freezing the collection. */
	getCollection(): C {
		// If in a subscription update, return the existing collection.
		// octane's useSyncExternalStore will call getCollection again during
		// render, at which point all the updates will be complete.
		if (this.inSubscription) {
			return this.collection;
		}

		// Reset queuedRender to false when getCollection is called during render.
		this.queuedRender = false;

		this.updateCollection();
		return this.collection;
	}

	updateCollection(): void {
		this.drainMutations();
		if (!this.hasDirty()) {
			return;
		}

		// Rebuild membership from the current tree. In SSR the collection is
		// mutated IN PLACE (unfrozen, identity-stable) so the snapshot handed to
		// the content render fills as render-phase registration proceeds —
		// upstream's `nextCollection === collection` SSR aliasing. On the client
		// a clone is committed and frozen, and the old snapshot stays immutable.
		let next: C = this.isSSR ? this.collection : this.collection.clone();
		for (let key of [...next.getKeys()]) {
			next.removeNode(key);
		}

		let topLevel = this.logicalChildren(this.isSSR ? null : this.getRootElement(), null);
		this.walk(next, topLevel, null, 0);

		next.commit(
			topLevel[0]?.node?.key ?? null,
			topLevel[topLevel.length - 1]?.node?.key ?? null,
			this.isSSR,
		);

		this.collection = next;
		for (let entry of this.dirtyNodes) {
			entry.isMutated = false;
		}
		this.dirtyNodes.clear();
		this.structureDirty = false;
		this.needsCommit = false;
	}

	// The logical (registered) children of a container: registered elements in
	// document order; unregistered wrapper elements are transparent and descended
	// through; `display: none` subtrees are excluded (Suspense-hide parity).
	private logicalChildren(
		container: Element | null,
		ssrParent: ElementNode<T> | null,
	): ElementNode<T>[] {
		if (this.isSSR) {
			return ssrParent === null ? this.ssrChildren : (ssrParent.ssrChildren ?? []);
		}

		let out: ElementNode<T>[] = [];
		if (container === null) {
			return out;
		}
		for (
			let child = container.firstElementChild;
			child !== null;
			child = child.nextElementSibling
		) {
			if ((child as HTMLElement).style?.display === 'none') {
				continue;
			}
			let entry = this.nodesByElement.get(child);
			if (entry !== undefined && entry.node !== null) {
				out.push(entry);
			} else {
				out.push(...this.logicalChildren(child, null));
			}
		}
		return out;
	}

	private walk(
		collection: C,
		entries: ElementNode<T>[],
		parent: ElementNode<T> | null,
		level: number,
	): void {
		let prev: ElementNode<T> | null = null;
		for (let i = 0; i < entries.length; i++) {
			let entry = entries[i];
			let children = this.logicalChildren(entry.element, entry);
			let node = entry.node!;

			// colIndex forward propagation, per upstream `updateNode`: a sibling
			// following a colSpan/colIndex-bearing node gets an explicit colIndex.
			let colIndex = node.colIndex;
			let prevNode = prev?.node ?? null;
			if (prevNode !== null && (prevNode.colSpan != null || prevNode.colIndex != null)) {
				colIndex = (prevNode.colIndex ?? prevNode.index) + (prevNode.colSpan ?? 1);
			}

			let fields: WalkFields = {
				index: i,
				level,
				parentKey: parent?.node?.key ?? null,
				prevKey: prev?.node?.key ?? null,
				nextKey: entries[i + 1]?.node?.key ?? null,
				hasChildNodes: children.length > 0,
				firstChildKey: children[0]?.node?.key ?? null,
				lastChildKey: children[children.length - 1]?.node?.key ?? null,
				colIndex,
			};

			if (entry.isMutated || fieldsDiffer(node, fields)) {
				let mutable = entry.getMutableNode();
				mutable.index = fields.index;
				mutable.level = fields.level;
				mutable.parentKey = fields.parentKey;
				mutable.prevKey = fields.prevKey;
				mutable.nextKey = fields.nextKey;
				mutable.hasChildNodes = fields.hasChildNodes;
				mutable.firstChildKey = fields.firstChildKey;
				mutable.lastChildKey = fields.lastChildKey;
				mutable.colIndex = fields.colIndex;
			}

			collection.addNode(entry.node!);

			// Upstream level rule: only an `item` parent increases depth.
			this.walk(collection, children, entry, level + (node.type === 'item' ? 1 : 0));
			prev = entry;
		}
	}

	queueUpdate(): void {
		this.drainMutations();
		if (!this.hasDirty() || this.queuedRender) {
			return;
		}

		// Only trigger subscriptions once during an update, when the first item changes.
		// useSyncExternalStore will call getCollection immediately, to check whether the
		// snapshot changed. If so, a render is queued after the current commit finishes.
		// We track whether getCollection is called in a subscription, and once it is
		// called during render, we reset queuedRender back to false.
		this.queuedRender = true;
		this.inSubscription = true;

		// Clone the collection to ensure the subscriber sees a changed snapshot and
		// queues a render. getCollection will be called again during that render, at
		// which point all the updates are complete and the rebuilt collection returns.
		if (!this.isSSR) {
			this.collection = this.collection.clone();
		}

		for (let fn of this.subscriptions) {
			fn();
		}

		this.inSubscription = false;
	}

	subscribe(fn: () => void): () => boolean {
		this.subscriptions.add(fn);
		return (): boolean => this.subscriptions.delete(fn);
	}

	resetAfterSSR(): void {
		if (this.isSSR) {
			this.isSSR = false;
			this.ssrChildren = [];
			this.nodeId = 0;
			this.needsCommit = true;
		}
	}
}
