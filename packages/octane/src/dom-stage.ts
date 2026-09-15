/**
 * DOM preparation for an optional ViewTransition commit. Only runtime receivers
 * are wrapped: every node stored by the renderer remains its original identity.
 * Existing nodes are never moved or mutated until commit, including retained
 * detached trees. Explicitly created trees may be assembled while detached so
 * compiler template walks continue to use ordinary native getters.
 */
// These expandos describe renderer ownership or already-installed event/form
// infrastructure, not the pending visible DOM. They must stay on the original
// node so dispatch and cleanup can find the same records before publication.
// Their writers own rollback/lifecycle semantics; adding a key here requires
// auditing that writer rather than opting visible state out of staging.
const EAGER_METADATA = /* @__PURE__ */ new Set([
	// reconcileDeoptChildren: renderer keys used while planning retained hosts.
	'$$deoptKey',
	// renderPortalState: fixed end marker on a newly created portal start marker.
	'$$portalEnd',
	// attr: listener identity ledger; actual native registrations are staged.
	'$$ceListeners',
	// setAutoFocus: one-time mount ownership; focusing uses the commit queue.
	'$$afSeen',
	// setFormAction: one-time submit driver installation, shared across renders.
	'$$formSubmitWired',
	// maybeEnqueueRestore: native input/change event sequence state.
	'$$checkableActivation',
	'$$selectPick',
	// handleFormSubmit/publishManualFormPending: native submit lifetime counter.
	'$$pendingSubmits',
]);

// These native values reflect attributes or form state. Geometry, scrolling,
// selection and resource readiness must continue to read the committed host.
const PROJECTED_PROPERTIES = /* @__PURE__ */ new Set([
	'id',
	'className',
	'slot',
	'title',
	'lang',
	'dir',
	'hidden',
	'inert',
	'tabIndex',
	'accessKey',
	'draggable',
	'contentEditable',
	'spellcheck',
	'translate',
	'role',
	'name',
	'type',
	'value',
	'defaultValue',
	'checked',
	'defaultChecked',
	'selected',
	'defaultSelected',
	'disabled',
	'multiple',
	'readOnly',
	'required',
	'autofocus',
	'placeholder',
	'min',
	'max',
	'step',
	'pattern',
	'minLength',
	'maxLength',
	'size',
	'rows',
	'cols',
	'accept',
	'action',
	'method',
	'enctype',
	'target',
	'noValidate',
	'href',
	'src',
	'srcset',
	'sizes',
	'alt',
	'width',
	'height',
	'loading',
	'decoding',
	'crossOrigin',
	'referrerPolicy',
	'htmlFor',
	'open',
	'controls',
	'muted',
	'loop',
]);

interface ChildList {
	first: Node | null;
	last: Node | null;
	length: number;
	snapshot: Node[] | null;
}
interface ChildLink {
	previous: Node | null;
	next: Node | null;
}
interface Projection {
	root: Node;
	copies: Map<Node, Node>;
	originals: Map<Node, Node>;
}

export class DOMStage {
	private views = new Map<Node, Node>();
	private children = new Map<Node, ChildList>();
	private links = new Map<Node, ChildLink>();
	private projections = new Map<Node, Projection>();
	private parents = new Map<Node, Node | null>();
	private values = new Map<Node, Map<PropertyKey, unknown>>();
	private states = new Map<Element, Element>();
	private styles = new Map<Element, CSSStyleDeclaration>();
	private documents = new Map<Document, Document>();
	private fresh = new Set<Node>();
	private actions: { action: () => void; guard: (() => boolean) | undefined }[] = [];
	private ended = false;

	constructor(private captureGuard?: () => (() => boolean) | undefined) {}

	/** Mark an actual creation/clone result, never an arbitrary detached node. */
	created<T extends Node>(node: T): T {
		this.fresh.add(node);
		// A template content fragment is not parented to its template. Mark just
		// those disconnected roots; ordinary descendants inherit freshness.
		const templates = (root: Node): void => {
			if (root.nodeType !== 1 && root.nodeType !== 11) return;
			const mark = (template: HTMLTemplateElement): void => {
				if (template.content === undefined) return;
				this.fresh.add(template.content);
				templates(template.content);
			};
			if (root.nodeType === 1 && (root as Element).localName === 'template')
				mark(root as HTMLTemplateElement);
			for (const template of (root as Element | DocumentFragment).querySelectorAll('template'))
				mark(template);
		};
		templates(node);
		return node;
	}

	view<T extends Node>(node: T): T {
		if (
			this.ended ||
			node === null ||
			typeof node !== 'object' ||
			typeof node.nodeType !== 'number' ||
			!('ownerDocument' in node)
		)
			return node;
		let view = this.views.get(node);
		if (view === undefined) {
			view = new Proxy(node, {
				get: (_, key) => this.get(node, key),
				set: (_, key, value) => {
					this.set(node, key, value);
					return true;
				},
			});
			this.views.set(node, view);
		}
		return view as T;
	}

	/** Lifecycle work is interleaved with host writes, especially before removal. */
	enqueue(action: () => void, durable = false): void {
		if (this.ended) throw new Error('Cannot append to a completed DOM commit.');
		this.actions.push({ action, guard: durable ? undefined : this.captureGuard?.() });
	}

	commit(): void {
		if (this.ended) return;
		this.ended = true;
		const actions = this.actions;
		this.release();
		let failed = false;
		let firstError: unknown;
		for (const { action, guard } of actions) {
			try {
				if (guard === undefined || guard()) action();
			} catch (error) {
				if (!failed) {
					failed = true;
					firstError = error;
				}
			}
		}
		if (failed) throw firstError;
	}

	private release(): void {
		this.actions = [];
		this.views.clear();
		this.children.clear();
		this.links.clear();
		this.projections.clear();
		this.parents.clear();
		this.values.clear();
		this.states.clear();
		this.styles.clear();
		this.documents.clear();
		this.fresh.clear();
	}

	private isFresh(node: Node): boolean {
		for (let current: Node | null = node; current !== null; current = current.parentNode) {
			if (this.fresh.has(current)) return true;
		}
		return false;
	}

	private childList(node: Node): ChildList {
		let list = this.children.get(node);
		if (list !== undefined) return list;
		list = { first: node.firstChild, last: node.lastChild, length: 0, snapshot: null };
		let previous: Node | null = null;
		for (let child = node.firstChild; child !== null; child = child.nextSibling) {
			this.links.set(child, { previous, next: child.nextSibling });
			previous = child;
			list.length++;
		}
		this.children.set(node, list);
		return list;
	}

	private childNodes(node: Node): Node[] {
		const list = this.children.get(node);
		if (list === undefined) return Array.from(node.childNodes);
		if (list.snapshot !== null) return list.snapshot;
		const result: Node[] = [];
		for (let child = list.first; child !== null; child = this.links.get(child)!.next)
			result.push(child);
		return (list.snapshot = result);
	}

	private child(node: Node, key: 'firstChild' | 'lastChild'): Node | null {
		const list = this.children.get(node);
		return list === undefined ? node[key] : key === 'firstChild' ? list.first : list.last;
	}

	private parent(node: Node): Node | null {
		return this.parents.has(node) ? this.parents.get(node)! : node.parentNode;
	}

	private siblings(node: Node, direction: number, elements: boolean): Node | null {
		const parent = this.parent(node);
		if (parent === null) return null;
		if (!this.children.has(parent)) {
			if (elements)
				return direction > 0
					? (node as Element).nextElementSibling
					: (node as Element).previousElementSibling;
			return direction > 0 ? node.nextSibling : node.previousSibling;
		}
		let current = node;
		while (true) {
			const link = this.links.get(current)!;
			const next = direction > 0 ? link.next : link.previous;
			if (next === null || !elements || next.nodeType === 1) return next;
			current = next;
		}
	}

	private root(node: Node, composed = false): Node {
		let parent: Node | null;
		while (
			(parent =
				this.parent(node) ??
				(composed && node.nodeType === 11 ? ((node as ShadowRoot).host ?? null) : null)) !== null
		)
			node = parent;
		return node;
	}

	private contains(node: Node, other: Node | null): boolean {
		while (other !== null) {
			if (other === node) return true;
			other = this.parent(other);
		}
		return false;
	}

	private collection<T extends Node>(
		nodes: T[],
	): T[] & { item(index: number): T | null; namedItem(name: string): T | null } {
		return Object.assign(nodes, {
			item: (index: number) => nodes[index] ?? null,
			namedItem: (name: string) =>
				nodes.find(
					(node) =>
						node.nodeType === 1 &&
						(this.get(node, 'id') === name || this.get(node, 'name') === name),
				) ?? null,
		});
	}

	private inertDocument(node: Node): Document {
		const owner = node.nodeType === 9 ? (node as Document) : node.ownerDocument!;
		let inert = this.documents.get(owner);
		if (inert === undefined) {
			inert = owner.implementation.createHTMLDocument('');
			this.documents.set(owner, inert);
		}
		return inert;
	}

	/** Native reflection/coercion runs in a document with no custom registry. */
	private state(node: Element): Element {
		let state = this.states.get(node);
		if (state !== undefined) return state;
		const doc = this.inertDocument(node);
		// Importing a native input preserves its dirty value/checked flags. Custom
		// elements are reconstructed without invoking their constructor or clone.
		if (
			node.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
			(node.localName === 'input' ||
				node.localName === 'textarea' ||
				node.localName === 'option') &&
			!node.hasAttribute('is')
		) {
			state = doc.importNode(node, false);
			if (node.localName !== 'input') state.textContent = node.textContent;
			if (node.localName === 'option')
				(state as HTMLOptionElement).selected = (node as HTMLOptionElement).selected;
		} else {
			state = doc.createElementNS(
				node.namespaceURI,
				node.prefix ? `${node.prefix}:${node.localName}` : node.localName,
			);
			for (const attr of Array.from(node.attributes))
				state.setAttributeNS(attr.namespaceURI, attr.name, attr.value);
		}
		if (node.localName === 'video' || node.localName === 'audio')
			(state as HTMLMediaElement).muted = (node as HTMLMediaElement).muted;
		this.states.set(node, state);
		return state;
	}

	/** Cold selector/form reads use an inert projection and map results back. */
	private projection(node: Node, ancestors = false): Projection & { node: Node } {
		const originalRoot = ancestors ? this.root(node) : node;
		const cached = this.projections.get(originalRoot);
		if (cached !== undefined) return { ...cached, node: cached.copies.get(node)! };
		const doc = this.inertDocument(node);
		const originals = new Map<Node, Node>();
		const copies = new Map<Node, Node>();
		let target: Node | undefined;
		const project = (original: Node): Node => {
			let copy: Node;
			switch (original.nodeType) {
				case 1: {
					const state = this.state(original as Element);
					copy = doc.importNode(state, false);
					break;
				}
				case 3:
					copy = doc.createTextNode(this.get(original, 'nodeValue') as string);
					break;
				case 8:
					copy = doc.createComment(this.get(original, 'nodeValue') as string);
					break;
				case 9: {
					// A fragment loses native form=id association in Chromium. Keep
					// document-root projections connected to their own inert document.
					const document = doc.implementation.createHTMLDocument('');
					document.replaceChildren();
					copy = document;
					break;
				}
				default:
					copy = doc.createDocumentFragment();
					break;
			}
			originals.set(copy, original);
			copies.set(original, copy);
			if (original === node) target = copy;
			const isTemplate =
				original.nodeType === 1 &&
				(original as Element).localName === 'template' &&
				'content' in original;
			const sourceParent = isTemplate ? (original as HTMLTemplateElement).content : original;
			const copyParent = isTemplate ? (copy as HTMLTemplateElement).content : copy;
			for (const child of this.childNodes(sourceParent)) {
				if (child.nodeType !== 10) copyParent.appendChild(project(child));
			}
			if (original.nodeType === 1 && (original as Element).localName === 'option')
				(copy as HTMLOptionElement).selected = (
					this.state(original as Element) as HTMLOptionElement
				).selected;
			const values = this.values.get(original);
			if (values !== undefined && copy.nodeType === 1) {
				for (const key of ['value', 'checked', 'selected', 'selectedIndex']) {
					if (values.has(key)) Reflect.set(copy, key, values.get(key));
				}
			}
			return copy;
		};
		project(originalRoot);
		const projection = { root: originalRoot, originals, copies };
		this.projections.set(originalRoot, projection);
		return { ...projection, node: target! };
	}

	private textContent(node: Node): string | null {
		if (node.nodeType === 9 || node.nodeType === 10) return null;
		if (node.nodeType === 3 || node.nodeType === 8) return this.get(node, 'nodeValue') as string;
		let text = '';
		for (const child of this.childNodes(node)) {
			if (child.nodeType !== 8) text += this.textContent(child) ?? '';
		}
		return text;
	}

	get(node: Node, key: PropertyKey): unknown {
		if (this.ended) {
			const value = Reflect.get(node, key, node);
			return typeof value === 'function' ? value.bind(node) : value;
		}
		const values = this.values.get(node);
		if ((node.nodeType === 3 || node.nodeType === 8) && (key === 'data' || key === 'textContent'))
			key = 'nodeValue';
		if (values?.has(key)) return values.get(key);
		if (key === 'length' && (node.nodeType === 3 || node.nodeType === 8))
			return (this.get(node, 'nodeValue') as string).length;
		switch (key) {
			case 'parentNode':
				return this.parent(node);
			case 'parentElement': {
				const parent = this.parent(node);
				return parent?.nodeType === 1 ? parent : null;
			}
			case 'firstChild':
			case 'lastChild':
				return this.child(node, key);
			case 'nextSibling':
				return this.siblings(node, 1, false);
			case 'previousSibling':
				return this.siblings(node, -1, false);
			case 'nextElementSibling':
				return this.siblings(node, 1, true);
			case 'previousElementSibling':
				return this.siblings(node, -1, true);
			case 'firstElementChild':
				return this.childNodes(node).find((child) => child.nodeType === 1) ?? null;
			case 'lastElementChild':
				return (
					this.childNodes(node)
						.filter((child) => child.nodeType === 1)
						.at(-1) ?? null
				);
			case 'childNodes':
				return this.collection(this.childNodes(node).slice());
			case 'children':
				return this.collection(this.childNodes(node).filter((child) => child.nodeType === 1));
			case 'childElementCount':
				return this.childNodes(node).filter((child) => child.nodeType === 1).length;
			case 'isConnected':
				return this.root(node, true).nodeType === 9;
			case 'textContent':
				return this.textContent(node);
			case 'innerHTML':
			case 'outerHTML':
				return Reflect.get(this.projection(node).node, key);
			case 'style':
				return this.style(node as Element);
			case 'classList':
				return this.classList(node as Element);
			case 'attributes':
				return this.state(node as Element).attributes;
			case 'options':
			case 'selectedOptions':
			case 'elements': {
				const projected = this.projection(node, key === 'elements');
				const options = Reflect.get(projected.node, key) as HTMLOptionsCollection;
				return this.collection(Array.from(options, (option) => projected.originals.get(option)!));
			}
			case 'selectedIndex':
				return Reflect.get(this.projection(node).node, key);
			case 'form': {
				const projected = this.projection(node, true);
				const form = Reflect.get(projected.node, key) as HTMLFormElement | null;
				return form === null ? null : (projected.originals.get(form) ?? null);
			}
		}
		const value = Reflect.get(node, key, node);
		if (typeof value === 'function') return (...args: unknown[]) => this.call(node, key, args);
		if (
			node.nodeType === 1 &&
			typeof key === 'string' &&
			(PROJECTED_PROPERTIES.has(key) || key.startsWith('aria')) &&
			key in this.state(node as Element) &&
			(value === null || typeof value !== 'object')
		) {
			if (
				key === 'value' &&
				((node as Element).localName === 'select' || (node as Element).localName === 'option')
			)
				return Reflect.get(this.projection(node).node, key);
			return Reflect.get(this.state(node as Element), key);
		}
		return value;
	}

	private value(node: Node, key: PropertyKey, value: unknown): void {
		let values = this.values.get(node);
		if (values === undefined) this.values.set(node, (values = new Map()));
		values.set(key, value);
	}

	set(node: Node, key: PropertyKey, value: unknown): void {
		if (
			this.ended ||
			typeof key === 'symbol' ||
			(typeof key === 'string' && (key.startsWith('__oct') || EAGER_METADATA.has(key)))
		) {
			Reflect.set(node, key, value, node);
			return;
		}
		const radioWrite =
			node.nodeType === 1 &&
			(node as Element).localName === 'input' &&
			(key === 'checked' || key === 'defaultChecked') &&
			(this.state(node as Element) as HTMLInputElement).type === 'radio';
		if (!radioWrite) this.projections.clear();
		if (
			(node.nodeType === 3 || node.nodeType === 8) &&
			(key === 'data' || key === 'textContent' || key === 'nodeValue')
		) {
			key = 'nodeValue';
			value = value === null || value === undefined ? '' : String(value);
		}
		if (
			(key === 'innerHTML' || key === 'textContent') &&
			this.isFresh(node) &&
			!this.children.has(node) &&
			!(
				(node as Element).localName === 'template' &&
				this.children.has((node as HTMLTemplateElement).content)
			)
		) {
			Reflect.set(node, key, value, node);
			this.states.delete(node as Element);
			this.created(node);
			return;
		}
		if (key === 'textContent' && node.nodeType !== 3 && node.nodeType !== 8) {
			const text = value === null || value === undefined ? '' : String(value);
			const children = text === '' ? [] : [this.created(node.ownerDocument!.createTextNode(text))];
			this.replaceChildren(node, children);
			return;
		}
		if (key === 'innerHTML') {
			const element = node as Element;
			const shell = this.inertDocument(node).createElementNS(
				element.namespaceURI,
				element.prefix ? `${element.prefix}:${element.localName}` : element.localName,
			);
			shell.innerHTML = value as string;
			const isTemplate = element.localName === 'template' && 'content' in element;
			const parsed = isTemplate ? (shell as HTMLTemplateElement).content : shell;
			const children = Array.from(parsed.childNodes, (child) =>
				this.created(node.ownerDocument!.importNode(child, true)),
			);
			this.replaceChildren(isTemplate ? (element as HTMLTemplateElement).content : node, children);
			return;
		}
		if (key === 'style') {
			this.style(node as Element).cssText = value as string;
			return;
		}
		if (key === 'scrollTop' || key === 'scrollLeft') {
			this.write(node, () => {
				Reflect.set(node, key, value, node);
			});
			return;
		}
		if (node.nodeType === 1 && this.setFormProperty(node as Element, key, value)) return;
		if (this.isFresh(node)) {
			Reflect.set(node, key, value, node);
			this.states.delete(node as Element);
			return;
		}
		if (node.nodeType === 1 && typeof key === 'string') {
			const state = this.state(node as Element);
			if (key in state && !key.startsWith('on') && !key.startsWith('_') && !key.startsWith('$')) {
				Reflect.set(state, key, value);
				// Native getters normalize values and reflect attributes. Keep their
				// result rather than the uncoerced assignment in projected reads.
				if (
					key === 'selected' ||
					key === 'selectedIndex' ||
					(!PROJECTED_PROPERTIES.has(key) && !key.startsWith('aria'))
				)
					this.value(node, key, Reflect.get(state, key));
			} else this.value(node, key, value);
		} else this.value(node, key, value);
		this.enqueue(() => {
			Reflect.set(node, key, value, node);
		});
	}

	private setFormProperty(node: Element, key: PropertyKey, value: unknown): boolean {
		if (
			node.localName === 'input' &&
			(key === 'checked' || key === 'defaultChecked') &&
			(this.state(node) as HTMLInputElement).type === 'radio'
		) {
			// A native radio write also changes its cousins. Preserve those changes
			// for later binding comparisons, including each input's dirty flags.
			const projected = this.projection(node, true);
			const target = projected.node as HTMLInputElement;
			Reflect.set(target, key, value);
			for (const [copy, original] of projected.originals) {
				if (copy.nodeType !== 1 || (copy as Element).localName !== 'input') continue;
				const input = copy as HTMLInputElement;
				if (
					input !== target &&
					(input.type !== 'radio' || input.name !== target.name || input.form !== target.form)
				)
					continue;
				this.states.set(original as Element, this.inertDocument(original).importNode(input, false));
				this.values.get(original)?.delete('checked');
			}
			this.projections.clear();
			this.projections.set(projected.root, projected);
			this.enqueue(() => {
				Reflect.set(node, key, value, node);
			});
			return true;
		}
		if (node.localName === 'textarea' && key === 'defaultValue') {
			const state = this.state(node) as HTMLTextAreaElement;
			state.defaultValue = value as string;
			this.replaceChildren(
				node,
				state.defaultValue === ''
					? []
					: [this.created(node.ownerDocument.createTextNode(state.defaultValue))],
			);
			return true;
		}
		let select: Node | null = node;
		if (node.localName === 'option' && key === 'selected') {
			while (select !== null && (select as Element).localName !== 'select')
				select = this.parent(select);
		} else if (node.localName !== 'select' || (key !== 'value' && key !== 'selectedIndex'))
			return false;
		if (select === null) return false;
		const projected = this.projection(select);
		let target = projected.node;
		if (node !== select)
			for (const [copy, original] of projected.originals) {
				if (original === node) {
					target = copy;
					break;
				}
			}
		Reflect.set(target, key, value);
		for (const option of Array.from((projected.node as HTMLSelectElement).options)) {
			const original = projected.originals.get(option)! as HTMLOptionElement;
			(this.state(original) as HTMLOptionElement).selected = option.selected;
			this.value(original, 'selected', option.selected);
		}
		this.enqueue(() => {
			Reflect.set(node, key, value, node);
		});
		return true;
	}

	private style(node: Element): CSSStyleDeclaration {
		let style = this.styles.get(node);
		if (style !== undefined) return style;
		const actual = (node as HTMLElement).style;
		style = new Proxy(actual, {
			get: (_, key) => {
				const state = (this.state(node) as HTMLElement).style;
				if (key === 'setProperty' || key === 'removeProperty')
					return (...args: unknown[]) => {
						const result = Reflect.apply(Reflect.get(state, key), state, args);
						this.write(node, () => {
							Reflect.apply(Reflect.get(actual, key), actual, args);
						});
						return result;
					};
				const value = Reflect.get(state, key, state);
				return typeof value === 'function' ? value.bind(state) : value;
			},
			set: (_, key, value) => {
				Reflect.set((this.state(node) as HTMLElement).style, key, value);
				this.write(node, () => {
					Reflect.set(actual, key, value);
				});
				return true;
			},
		});
		this.styles.set(node, style);
		return style;
	}

	private classList(node: Element): DOMTokenList {
		return new Proxy(node.classList, {
			get: (_, key) => {
				const list = this.state(node).classList;
				const value = Reflect.get(list, key, list);
				if (key === 'add' || key === 'remove' || key === 'toggle' || key === 'replace')
					return (...args: unknown[]) => {
						const result = Reflect.apply(value, list, args);
						this.write(node, () => {
							Reflect.apply(Reflect.get(node.classList, key), node.classList, args);
						});
						return result;
					};
				return typeof value === 'function' ? value.bind(list) : value;
			},
			set: (_, key, value) => {
				Reflect.set(this.state(node).classList, key, value);
				this.write(node, () => {
					Reflect.set(node.classList, key, value);
				});
				return true;
			},
		});
	}

	private write(node: Node, action: () => void): void {
		this.projections.clear();
		if (this.isFresh(node)) action();
		else this.enqueue(action);
	}

	private remove(parent: Node, child: Node): void {
		const list = this.childList(parent);
		if (this.parent(child) !== parent)
			throw new DOMException('The node is not a child of this parent.', 'NotFoundError');
		const link = this.links.get(child)!;
		if (link.previous === null) list.first = link.next;
		else this.links.get(link.previous)!.next = link.next;
		if (link.next === null) list.last = link.previous;
		else this.links.get(link.next)!.previous = link.previous;
		list.length--;
		list.snapshot = null;
		this.links.delete(child);
		this.parents.set(child, null);
		this.projections.clear();
	}

	private insert(parent: Node, child: Node, anchor: Node | null, move = false): void {
		if (child === anchor) return;
		if (anchor !== null && this.parent(anchor) !== parent)
			throw new DOMException('The anchor is not a child of this parent.', 'NotFoundError');
		if (this.contains(child, parent))
			throw new DOMException('The insertion would create a cycle.', 'HierarchyRequestError');
		if (child.nodeType === 11) {
			for (const item of this.childNodes(child).slice()) this.insert(parent, item, anchor);
			return;
		}
		const oldParent = this.parent(child);
		const eager =
			this.isFresh(parent) &&
			this.isFresh(child) &&
			!this.parents.has(child) &&
			!this.children.has(parent) &&
			(oldParent === null || !this.children.has(oldParent)) &&
			(anchor === null || anchor.parentNode === parent);
		if (eager) {
			parent.insertBefore(child, anchor);
			this.projections.clear();
			return;
		}
		if (oldParent !== null) this.remove(oldParent, child);
		const list = this.childList(parent);
		const previous = anchor === null ? list.last : this.links.get(anchor)!.previous;
		this.links.set(child, { previous, next: anchor });
		if (previous === null) list.first = child;
		else this.links.get(previous)!.next = child;
		if (anchor === null) list.last = child;
		else this.links.get(anchor)!.previous = child;
		list.length++;
		list.snapshot = null;
		this.parents.set(child, parent);
		this.projections.clear();
		this.enqueue(() => {
			if (move)
				(parent as Element & { moveBefore(child: Node, anchor: Node | null): void }).moveBefore(
					child,
					anchor,
				);
			else parent.insertBefore(child, anchor);
		});
	}

	private replaceChildren(node: Node, children: Node[]): void {
		const list = this.childList(node);
		for (let child = list.first; child !== null;) {
			const next = this.links.get(child)!.next;
			this.parents.set(child, null);
			this.links.delete(child);
			child = next;
		}
		list.first = list.last = null;
		list.length = 0;
		list.snapshot = null;
		this.projections.clear();
		// Even a fresh parent may have earlier queued insertions of retained
		// children. Keep the clear ordered after them in the publication log.
		this.enqueue(() => {
			node.textContent = '';
		});
		for (const child of children) this.insert(node, child, null);
	}

	/** Clear a shared-parent range once while retaining both live anchors. */
	clearBetween(start: Node, end: Node): void {
		const parent = this.parent(start);
		if (parent === null || this.parent(end) !== parent)
			throw new DOMException('Range anchors have different parents.', 'NotFoundError');
		this.childList(parent);
		let child = this.siblings(start, 1, false);
		while (child !== null && child !== end) child = this.siblings(child, 1, false);
		if (child !== end)
			throw new DOMException('The end anchor precedes the start.', 'NotFoundError');
		child = this.siblings(start, 1, false);
		while (child !== null && child !== end) {
			const next = this.siblings(child, 1, false);
			this.remove(parent, child);
			child = next;
		}
		this.enqueue(() => {
			if (start.parentNode !== parent || end.parentNode !== parent) return;
			const range = parent.ownerDocument!.createRange();
			range.setStartAfter(start);
			range.setEndBefore(end);
			range.deleteContents();
		});
	}

	private nodes(node: Node, args: unknown[]): Node[] {
		return args.map((value) =>
			typeof value === 'object' && value !== null && 'nodeType' in value
				? (value as Node)
				: this.created(node.ownerDocument!.createTextNode(String(value))),
		);
	}

	private call(node: Node, key: PropertyKey, args: unknown[]): unknown {
		switch (key) {
			case 'hasChildNodes':
				return this.childNodes(node).length > 0;
			case 'contains':
				return this.contains(node, args[0] as Node | null);
			case 'getRootNode':
				return this.root(node, (args[0] as GetRootNodeOptions | undefined)?.composed);
			case 'compareDocumentPosition': {
				const other = args[0] as Node;
				if (node === other) return 0;
				if (this.contains(node, other)) return 20;
				if (this.contains(other, node)) return 10;
				if (this.root(node) !== this.root(other)) return node.compareDocumentPosition(other) | 1;
				const path = (current: Node): Node[] => {
					const result = [current];
					let parent: Node | null;
					while ((parent = this.parent(current)) !== null) result.unshift((current = parent));
					return result;
				};
				const a = path(node),
					b = path(other);
				let index = 0;
				while (a[index] === b[index]) index++;
				const children = this.childNodes(a[index - 1]!);
				return children.indexOf(a[index]!) < children.indexOf(b[index]!) ? 4 : 2;
			}
			case 'appendChild':
				this.insert(node, args[0] as Node, null);
				return args[0];
			case 'insertBefore':
				this.insert(node, args[0] as Node, args[1] as Node | null);
				return args[0];
			case 'moveBefore':
				this.insert(node, args[0] as Node, args[1] as Node | null, true);
				return;
			case 'removeChild': {
				const child = args[0] as Node;
				if (this.isFresh(node) && this.isFresh(child) && !this.children.has(node)) {
					node.removeChild(child);
					this.projections.clear();
				} else {
					this.remove(node, child);
					this.enqueue(() => {
						// A preceding deletion cleanup can remove or relocate its host.
						// Match the eager unmount's live-parent check after callbacks.
						if (child.parentNode === node) node.removeChild(child);
					});
				}
				return child;
			}
			case 'replaceChild': {
				const child = args[0] as Node,
					old = args[1] as Node;
				if (child !== old) {
					this.insert(node, child, old);
					this.call(node, 'removeChild', [old]);
				}
				return old;
			}
			case 'replaceChildren':
				this.replaceChildren(node, this.nodes(node, args));
				return;
			case 'append':
				for (const child of this.nodes(node, args)) this.insert(node, child, null);
				return;
			case 'prepend': {
				const anchor = this.childNodes(node)[0] ?? null;
				for (const child of this.nodes(node, args)) this.insert(node, child, anchor);
				return;
			}
			case 'remove': {
				const parent = this.parent(node);
				if (parent !== null) this.call(parent, 'removeChild', [node]);
				return;
			}
			case 'before':
			case 'after':
			case 'replaceWith': {
				const parent = this.parent(node);
				if (parent === null) return;
				const anchor = key === 'after' ? this.siblings(node, 1, false) : node;
				for (const child of this.nodes(node, args)) this.insert(parent, child, anchor);
				if (key === 'replaceWith') this.call(parent, 'removeChild', [node]);
				return;
			}
			case 'getAttribute':
			case 'getAttributeNS':
			case 'getAttributeNames':
			case 'hasAttribute':
			case 'hasAttributeNS':
			case 'hasAttributes': {
				// Every staged attribute, property, style and class write creates the
				// twin, so an element without one still has its committed attributes.
				const state = this.states.get(node as Element) ?? node;
				return Reflect.apply(Reflect.get(state, key), state, args);
			}
			case 'setAttribute':
			case 'setAttributeNS':
			case 'removeAttribute':
			case 'removeAttributeNS':
			case 'toggleAttribute': {
				const state = this.state(node as Element);
				const result = Reflect.apply(Reflect.get(state, key), state, args);
				this.write(node, () => {
					Reflect.apply(Reflect.get(node, key), node, args);
				});
				return result;
			}
			case 'getElementsByTagName':
			case 'getElementsByTagNameNS':
			case 'getElementsByClassName':
			case 'getElementsByName':
			case 'getElementById': {
				const result: Element[] = [];
				const name = String(args[key === 'getElementsByTagNameNS' ? 1 : 0]);
				const tokens = name.trim().split(/\s+/);
				const visit = (parent: Node): void => {
					for (const child of this.childNodes(parent)) {
						if (child.nodeType !== 1) continue;
						const element = child as Element;
						let match: boolean;
						if (key === 'getElementsByClassName')
							match =
								name.trim() !== '' &&
								tokens.every((token) => this.state(element).classList.contains(token));
						else if (key === 'getElementsByName')
							match = this.state(element).getAttribute('name') === name;
						else if (key === 'getElementById')
							match = name !== '' && this.get(element, 'id') === name;
						else if (key === 'getElementsByTagNameNS')
							match =
								(args[0] === '*' || (args[0] || null) === element.namespaceURI) &&
								(name === '*' || name === element.localName);
						else
							match =
								name === '*' ||
								(element.namespaceURI === 'http://www.w3.org/1999/xhtml'
									? name.toLowerCase() === element.localName
									: name === element.tagName);
						if (match) result.push(element);
						visit(element);
					}
				};
				visit(node);
				return key === 'getElementById' ? (result[0] ?? null) : this.collection(result);
			}
			case 'querySelector':
			case 'querySelectorAll':
			case 'matches':
			case 'closest': {
				const projected = this.projection(node, key === 'matches' || key === 'closest');
				const result = Reflect.apply(Reflect.get(projected.node, key), projected.node, args);
				if (key === 'matches') return result;
				if (key === 'querySelectorAll')
					return this.collection(
						Array.from(result as NodeList, (item) => projected.originals.get(item)!),
					);
				return result === null ? null : (projected.originals.get(result as Node) ?? null);
			}
			case 'addEventListener':
			case 'removeEventListener':
			case 'focus':
			case 'blur':
			case 'setSelectionRange':
			case 'setRangeText':
			case 'scrollTo':
			case 'scrollBy':
			case 'scrollIntoView':
				this.write(node, () => {
					Reflect.apply(Reflect.get(node, key), node, args);
				});
				return;
			case 'createElement':
			case 'createElementNS':
			case 'createTextNode':
			case 'createComment':
			case 'createDocumentFragment':
			case 'importNode':
			case 'cloneNode':
				return this.created(Reflect.apply(Reflect.get(node, key), node, args) as Node);
		}
		return Reflect.apply(Reflect.get(node, key), node, args);
	}
}
