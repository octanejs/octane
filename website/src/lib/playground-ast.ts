export interface AstRange {
	from: number;
	to: number;
}

type AstValueKind = 'object' | 'array' | 'primitive' | 'reference';

export interface PlaygroundAstNode {
	key: string | null;
	kind: AstValueKind;
	type: string | null;
	value: string | null;
	path: string;
	range: AstRange | null;
	depth: number;
	parent: PlaygroundAstNode | null;
	children: PlaygroundAstNode[];
}

export interface PreparedPlaygroundAst {
	root: PlaygroundAstNode;
	rangeNodes: PlaygroundAstNode[];
}

const primitiveText = (value: unknown): string => {
	if (value === undefined) return 'undefined';
	if (typeof value === 'bigint') return `${value}n`;
	if (typeof value === 'symbol' || typeof value === 'function') return String(value);
	return JSON.stringify(value) ?? String(value);
};

const childPath = (path: string, key: string, array: boolean): string =>
	array ? `${path}[${key}]` : `${path}.${key}`;

/**
 * Convert the parser's object graph into a cycle-safe tree for display. Every
 * enumerable field remains visible; shared/cyclic values become an explicit
 * reference to their first path instead of being silently dropped. Range
 * nodes are indexed once so cursor tracking never traverses non-AST metadata.
 */
export function preparePlaygroundAst(value: unknown): PreparedPlaygroundAst {
	// Parser metadata contains back-references into the syntax tree. Discover
	// canonical paths without descending into metadata first, so a node's real
	// structural field always owns its expanded representation even when an
	// earlier sibling's metadata.path points to it.
	const canonicalPaths = new WeakMap<object, string>();
	const discoverCanonicalPaths = (current: unknown, path: string) => {
		if (!current || typeof current !== 'object' || canonicalPaths.has(current)) return;
		canonicalPaths.set(current, path);
		for (const [key, child] of Object.entries(current)) {
			if (key === 'metadata') continue;
			discoverCanonicalPaths(child, childPath(path, key, Array.isArray(current)));
		}
	};
	discoverCanonicalPaths(value, '$');

	const seen = new WeakMap<object, string>();
	const rangeNodes: PlaygroundAstNode[] = [];

	const visit = (
		current: unknown,
		key: string | null,
		path: string,
		parent: PlaygroundAstNode | null,
		depth: number,
	): PlaygroundAstNode => {
		if (current === null || typeof current !== 'object') {
			return {
				key,
				kind: 'primitive',
				type: current === null ? 'null' : typeof current,
				value: primitiveText(current),
				path,
				range: null,
				depth,
				parent,
				children: [],
			};
		}

		const canonicalPath = canonicalPaths.get(current);
		const firstPath = canonicalPath !== path ? (canonicalPath ?? seen.get(current)) : undefined;
		if (firstPath !== undefined) {
			return {
				key,
				kind: 'reference',
				type: null,
				value: `Reference → ${firstPath}`,
				path,
				range: null,
				depth,
				parent,
				children: [],
			};
		}
		seen.set(current, path);

		const record = current as Record<string, unknown>;
		// Immutable compiler ASTs retain authored start/end origins. Static
		// template IR exposes its authored ranges explicitly as srcStart/srcEnd.
		const from = typeof record.srcStart === 'number' ? record.srcStart : record.start;
		const to = typeof record.srcEnd === 'number' ? record.srcEnd : record.end;
		const range =
			typeof from === 'number' &&
			Number.isFinite(from) &&
			typeof to === 'number' &&
			Number.isFinite(to) &&
			from < to
				? { from, to }
				: null;
		const node: PlaygroundAstNode = {
			key,
			kind: Array.isArray(current) ? 'array' : 'object',
			type: typeof record.type === 'string' ? record.type : null,
			value: null,
			path,
			range,
			depth,
			parent,
			children: [],
		};
		if (range) rangeNodes.push(node);
		for (const [childKey, child] of Object.entries(current)) {
			node.children.push(
				visit(
					child,
					Array.isArray(current) ? null : childKey,
					childPath(path, childKey, Array.isArray(current)),
					node,
					depth + 1,
				),
			);
		}
		return node;
	};

	return { root: visit(value, null, '$', null, 0), rangeNodes };
}

/** Select the narrowest AST node whose half-open range contains `offset`. */
export function findDeepestAstNode(
	prepared: PreparedPlaygroundAst,
	offset: number,
): PlaygroundAstNode | null {
	let best: PlaygroundAstNode | null = null;
	let bestWidth = Number.POSITIVE_INFINITY;
	for (const node of prepared.rangeNodes) {
		const range = node.range!;
		if (offset < range.from || offset >= range.to) continue;
		const width = range.to - range.from;
		if (width < bestWidth || (width === bestWidth && node.depth > (best?.depth ?? -1))) {
			best = node;
			bestWidth = width;
		}
	}
	return best;
}

export interface AstPreviewController {
	setAst(ast: unknown, filename: string, options?: { label?: string; notice?: string }): void;
	setUnavailable(message: string, filename: string): void;
	reveal(offset: number, scroll: boolean): void;
	clear(): void;
	destroy(): void;
}

interface AstPreviewOptions {
	onNodeRange(range: AstRange | null, scroll: boolean): void;
}

/**
 * Mount the interactive AST tree. Branches render lazily when opened, while
 * the prepared object graph keeps enough ancestry to reveal a cursor-selected
 * node without rebuilding the tree.
 */
export function createAstPreview(
	host: HTMLElement,
	options: AstPreviewOptions,
): AstPreviewController {
	const doc = host.ownerDocument;
	let prepared: PreparedPlaygroundAst | null = null;
	let filename = '';
	let label = 'AST';
	let unavailable = '';
	let destroyed = false;
	let activeNodes: PlaygroundAstNode[] = [];
	const elements = new Map<PlaygroundAstNode, HTMLLIElement>();
	let renderedBranches = new WeakSet<PlaygroundAstNode>();

	const shell = doc.createElement('div');
	shell.className = 'pg-ast-shell';
	const status = doc.createElement('div');
	status.className = 'pg-ast-status';
	status.setAttribute('aria-live', 'polite');
	const scrollHost = doc.createElement('div');
	scrollHost.className = 'pg-ast-scroll';
	const notice = doc.createElement('div');
	notice.className = 'pg-ast-notice';
	notice.textContent = 'Compiler AST; its internal shape may change.';
	shell.append(status, scrollHost, notice);
	host.replaceChildren(shell);

	const setActiveNodes = (node: PlaygroundAstNode | null, scroll: boolean) => {
		for (const active of activeNodes) {
			const element = elements.get(active);
			if (element) {
				delete element.dataset.astPath;
				delete element.dataset.astLeaf;
			}
		}
		activeNodes = [];
		if (!node) {
			status.textContent = `${label} · ${filename}`;
			return;
		}

		const path: PlaygroundAstNode[] = [];
		for (let current: PlaygroundAstNode | null = node; current; current = current.parent) {
			path.push(current);
		}
		path.reverse();
		// Always open ancestor <details> so the leaf node exists in the DOM and
		// can receive highlight markers. Lazy rendering means collapsed ancestors
		// haven't rendered their children yet.
		for (const current of path.slice(0, -1)) {
			const li = elements.get(current);
			const details = li?.firstElementChild;
			if (details instanceof doc.defaultView!.HTMLDetailsElement) {
				details.open = true;
				details.dispatchEvent(new doc.defaultView!.Event('ast-open'));
			}
		}
		for (const current of path) {
			const element = elements.get(current);
			if (element) element.dataset.astPath = 'true';
		}
		const leaf = elements.get(node);
		if (leaf) {
			leaf.dataset.astLeaf = 'true';
			if (scroll) leaf.scrollIntoView({ block: 'center' });
		}
		activeNodes = path;
		const range = node.range;
		status.textContent = `${label} · ${node.type ?? node.path} · [${range?.from ?? '–'}, ${range?.to ?? '–'})`;
	};

	const renderNode = (node: PlaygroundAstNode): HTMLLIElement => {
		const li = doc.createElement('li');
		li.className = 'pg-ast-node';
		li.dataset.astPathName = node.path;
		elements.set(node, li);

		if (node.kind === 'primitive' || node.kind === 'reference') {
			const value = doc.createElement('span');
			value.className = `pg-ast-value pg-ast-${node.kind === 'reference' ? 'reference' : node.type}`;
			if (node.key) {
				const key = doc.createElement('span');
				key.className = 'pg-ast-key';
				key.textContent = `${node.key}: `;
				value.append(key);
			}
			value.append(node.value ?? '');
			li.append(value);
			return li;
		}

		const details = doc.createElement('details');
		const summary = doc.createElement('summary');
		if (node.key) {
			const key = doc.createElement('span');
			key.className = 'pg-ast-key';
			key.textContent = `${node.key}: `;
			summary.append(key);
		}
		const label = doc.createElement('span');
		label.className = node.type ? 'pg-ast-type' : 'pg-ast-delimiter';
		summary.append(label);
		const updateLabel = () => {
			label.textContent =
				node.kind === 'array'
					? details.open
						? '['
						: `[…] (${node.children.length})`
					: `${node.type ? `${node.type} ` : ''}{${details.open ? '' : '…'}}`;
		};
		updateLabel();
		const range = node.range;
		if (range) {
			const coordinates = doc.createElement('span');
			coordinates.className = 'pg-ast-range';
			coordinates.textContent = ` [${range.from}, ${range.to})`;
			summary.append(coordinates);
			const activate = (scroll: boolean) => {
				setActiveNodes(node, false);
				options.onNodeRange(range, scroll);
			};
			summary.addEventListener('mouseenter', () => activate(false));
			summary.addEventListener('focus', () => activate(false));
			summary.addEventListener('click', () => activate(true));
			summary.addEventListener('mouseleave', () => options.onNodeRange(null, false));
			summary.addEventListener('blur', () => options.onNodeRange(null, false));
		}
		details.append(summary);

		const renderChildren = () => {
			if (renderedBranches.has(node)) return;
			renderedBranches.add(node);
			const list = doc.createElement('ul');
			for (const child of node.children) list.append(renderNode(child));
			const closing = doc.createElement('span');
			closing.className = 'pg-ast-closing';
			closing.textContent = node.kind === 'array' ? ']' : '}';
			details.append(list, closing);
		};
		details.addEventListener('toggle', () => {
			updateLabel();
			if (details.open) renderChildren();
		});
		details.addEventListener('ast-open', renderChildren);
		if (node.depth === 0) {
			details.open = true;
			updateLabel();
			renderChildren();
		}
		li.append(details);
		return li;
	};

	const renderAst = () => {
		if (destroyed) return;
		elements.clear();
		renderedBranches = new WeakSet<PlaygroundAstNode>();
		activeNodes = [];
		status.textContent = `${label} · ${filename}`;
		if (unavailable) {
			scrollHost.textContent = unavailable;
			return;
		}
		if (!prepared) {
			scrollHost.textContent = 'AST appears after a successful compile.';
			return;
		}
		const list = doc.createElement('ul');
		list.className = 'pg-ast-tree';
		list.append(renderNode(prepared.root));
		scrollHost.replaceChildren(list);
	};

	renderAst();
	return {
		setAst(ast, nextFilename, nextOptions) {
			filename = nextFilename;
			label = nextOptions?.label ?? 'AST';
			notice.textContent = nextOptions?.notice ?? 'Compiler AST; its internal shape may change.';
			unavailable = '';
			prepared = preparePlaygroundAst(ast);
			renderAst();
		},
		setUnavailable(message, nextFilename) {
			filename = nextFilename;
			unavailable = message;
			prepared = null;
			options.onNodeRange(null, false);
			renderAst();
		},
		reveal(offset, scroll) {
			const node = prepared ? findDeepestAstNode(prepared, offset) : null;
			setActiveNodes(node, scroll);
			options.onNodeRange(node?.range ?? null, false);
		},
		clear() {
			setActiveNodes(null, false);
		},
		destroy() {
			destroyed = true;
			host.replaceChildren();
		},
	};
}
