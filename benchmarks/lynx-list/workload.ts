import type {
	UniversalHostBatch,
	UniversalHostCommand,
} from '../../packages/octane/src/universal-core.js';
import {
	createLynxHostContainer,
	disposeLynxHostContainer,
	getLynxListDiagnostics,
	prepareLynxHostBatch,
} from '../../packages/lynx/src/core/host-driver.js';
import type {
	LynxElementPAPI,
	LynxListComponentAtIndex,
	LynxListComponentAtIndexes,
	LynxListEnqueueComponent,
} from '../../packages/lynx/src/core/papi.js';

export const LOGICAL_ITEM_COUNT = 1_000;
export const VISIBLE_WINDOW_SIZE = 12;

interface FakeNode {
	readonly sign: number;
	readonly type: string;
	parent: FakeNode | null;
	readonly children: FakeNode[];
	readonly attributes: Map<string, unknown>;
	readonly events: Map<string, string>;
	text: string;
}

interface FakeListCallbacks {
	readonly componentAtIndex: LynxListComponentAtIndex<FakeNode>;
	readonly componentAtIndexes: LynxListComponentAtIndexes<FakeNode>;
	readonly enqueueComponent: LynxListEnqueueComponent<FakeNode>;
}

interface ItemIds {
	readonly item: number;
	readonly text: number;
	readonly raw: number;
}

function idsAt(index: number): ItemIds {
	return { item: index * 3 + 2, text: index * 3 + 3, raw: index * 3 + 4 };
}

function batch(version: number, commands: readonly UniversalHostCommand[]): UniversalHostBatch {
	return { renderer: 'lynx', version, commands };
}

function listMountCommands(itemCount: number): UniversalHostCommand[] {
	const commands: UniversalHostCommand[] = [
		{ op: 'create', id: 1, type: 'list', props: { id: 'allocation-bench' } },
	];
	for (let index = 0; index < itemCount; index++) {
		const ids = idsAt(index);
		commands.push(
			{
				op: 'create',
				id: ids.item,
				type: 'list-item',
				props: { 'item-key': `item-${index}`, 'reuse-identifier': 'bench-row' },
			},
			{ op: 'create', id: ids.text, type: 'text', props: {} },
			{ op: 'create', id: ids.raw, type: '#text', props: { value: `Row ${index}` } },
			{ op: 'insert', parent: ids.text, id: ids.raw, before: null },
			{ op: 'insert', parent: ids.item, id: ids.text, before: null },
			{ op: 'insert', parent: 1, id: ids.item, before: null },
		);
	}
	commands.push({ op: 'insert', parent: null, id: 1, before: null });
	return commands;
}

function listUnmountCommands(itemCount: number): UniversalHostCommand[] {
	const commands: UniversalHostCommand[] = [];
	for (let index = 0; index < itemCount; index++) {
		const ids = idsAt(index);
		commands.push(
			{ op: 'remove', parent: ids.text, id: ids.raw },
			{ op: 'destroy', id: ids.raw },
			{ op: 'remove', parent: ids.item, id: ids.text },
			{ op: 'destroy', id: ids.text },
			{ op: 'remove', parent: 1, id: ids.item },
			{ op: 'destroy', id: ids.item },
		);
	}
	commands.push({ op: 'remove', parent: null, id: 1 }, { op: 'destroy', id: 1 });
	return commands;
}

class FakeLynxPAPI {
	readonly papi: LynxElementPAPI<FakeNode>;
	private nextSign = 1;
	private flushes = 0;
	private readonly nodes = new Map<number, FakeNode>();
	private readonly callbacks = new Map<FakeNode, FakeListCallbacks>();

	constructor() {
		this.papi = {
			list: Object.freeze({
				create: (
					_parentComponentUniqueId: number,
					componentAtIndex: LynxListComponentAtIndex<FakeNode>,
					enqueueComponent: LynxListEnqueueComponent<FakeNode>,
					componentAtIndexes: LynxListComponentAtIndexes<FakeNode>,
				) => {
					const node = this.createNode('list');
					this.callbacks.set(node, {
						componentAtIndex,
						componentAtIndexes,
						enqueueComponent,
					});
					return node;
				},
				updateCallbacks: (
					node: FakeNode,
					componentAtIndex: LynxListComponentAtIndex<FakeNode>,
					enqueueComponent: LynxListEnqueueComponent<FakeNode>,
					componentAtIndexes: LynxListComponentAtIndexes<FakeNode>,
				) => {
					this.callbacks.set(node, {
						componentAtIndex,
						componentAtIndexes,
						enqueueComponent,
					});
				},
				updateComponents: (node: FakeNode, components: readonly string[]) => {
					node.attributes.set('list-components', [...components]);
				},
			}),
			createPage: () => this.createNode('page'),
			createElement: (type, _parentComponentUniqueId, text) => this.createNode(type, text),
			getUniqueId: (node) => node.sign,
			isChild: (parent, child) => child.parent === parent,
			insertBefore: (parent, child, before) => {
				this.detach(child);
				const index = before === null ? parent.children.length : parent.children.indexOf(before);
				if (index < 0) throw new Error('fake PAPI insertBefore target is not a child.');
				parent.children.splice(index, 0, child);
				child.parent = parent;
			},
			remove: (parent, child) => {
				const index = parent.children.indexOf(child);
				if (index < 0 || child.parent !== parent) {
					throw new Error('fake PAPI remove target is not a child.');
				}
				parent.children.splice(index, 1);
				child.parent = null;
			},
			replace: (replacement, previous) => {
				const parent = previous.parent;
				if (parent === null) throw new Error('fake PAPI cannot replace a detached node.');
				const index = parent.children.indexOf(previous);
				if (index < 0) throw new Error('fake PAPI replace target is not a child.');
				this.detach(replacement);
				parent.children[index] = replacement;
				replacement.parent = parent;
				previous.parent = null;
			},
			setClasses: (node, value) => node.attributes.set('class', value),
			setInlineStyles: (node, value) => node.attributes.set('style', value),
			setCssId: (node, id, entryName) => {
				node.attributes.set('css-id', id);
				if (entryName !== undefined) node.attributes.set('css-entry-name', entryName);
			},
			setAttribute: (node, name, value) => {
				if (value === null || value === undefined) node.attributes.delete(name);
				else node.attributes.set(name, value);
				if (name === 'text') node.text = value == null ? '' : String(value);
			},
			setRefSelector: (node, value) => node.attributes.set('lynx-ref', value),
			setDataset: (node, value) => node.attributes.set('dataset', value),
			setEvent: (node, kind, name, listener) => {
				const key = `${kind}:${name}`;
				if (listener === undefined) node.events.delete(key);
				else node.events.set(key, listener);
			},
			setId: (node, id) => {
				if (id === null) node.attributes.delete('id');
				else node.attributes.set('id', id);
			},
			flush: () => {
				this.flushes += 1;
			},
		};
	}

	get flushCount(): number {
		return this.flushes;
	}

	getListNode(): FakeNode {
		if (this.callbacks.size !== 1) {
			throw new Error(`expected one fake native list, received ${this.callbacks.size}.`);
		}
		return this.callbacks.keys().next().value as FakeNode;
	}

	enter(list: FakeNode, index: number): number {
		const callbacks = this.callbacks.get(list);
		if (callbacks === undefined) throw new Error('fake native list callbacks are missing.');
		return callbacks.componentAtIndex(list, list.sign, index, index, true);
	}

	leave(list: FakeNode, sign: number): void {
		const callbacks = this.callbacks.get(list);
		if (callbacks === undefined) throw new Error('fake native list callbacks are missing.');
		callbacks.enqueueComponent(list, list.sign, sign);
	}

	textForSign(sign: number): string {
		const node = this.nodes.get(sign);
		if (node === undefined) throw new Error(`fake native node ${sign} does not exist.`);
		return this.textContent(node);
	}

	createdNodeCount(type: string): number {
		let count = 0;
		for (const node of this.nodes.values()) if (node.type === type) count += 1;
		return count;
	}

	reachableNodeCount(root: FakeNode, type: string): number {
		let count = root.type === type ? 1 : 0;
		for (const child of root.children) count += this.reachableNodeCount(child, type);
		return count;
	}

	private createNode(type: string, text = ''): FakeNode {
		const node: FakeNode = {
			sign: this.nextSign++,
			type,
			parent: null,
			children: [],
			attributes: new Map(),
			events: new Map(),
			text,
		};
		this.nodes.set(node.sign, node);
		return node;
	}

	private detach(node: FakeNode): void {
		const parent = node.parent;
		if (parent === null) return;
		const index = parent.children.indexOf(node);
		if (index >= 0) parent.children.splice(index, 1);
		node.parent = null;
	}

	private textContent(node: FakeNode): string {
		if (node.type === '#text' || node.type === 'raw-text') return node.text;
		let text = '';
		for (const child of node.children) text += this.textContent(child);
		return text;
	}
}

export interface LynxListAllocationResult {
	readonly logicalItems: number;
	readonly visibleWindow: number;
	readonly physicalCells: number;
	readonly createdCells: number;
	readonly reusedCells: number;
	readonly attachedCells: number;
	readonly pooledCells: number;
	readonly nativeCellAllocations: number;
	readonly semanticChecksum: number;
	readonly expectedChecksum: number;
	readonly flushes: number;
	readonly remainingCellsAfterTeardown: number;
	readonly lateCallbackSign: number;
	readonly failures: readonly string[];
}

export function runLynxListAllocationWorkload(): LynxListAllocationResult {
	const environment = new FakeLynxPAPI();
	const container = createLynxHostContainer(environment.papi, { root: 1 });
	const failures: string[] = [];
	const check = (condition: boolean, message: string): void => {
		if (!condition) failures.push(message);
	};

	prepareLynxHostBatch(container, batch(1, listMountCommands(LOGICAL_ITEM_COUNT))).apply();
	const list = environment.getListNode();
	const activeSigns: number[] = [];
	const initialSigns = new Set<number>();
	let semanticChecksum = 0;

	const verifyCell = (index: number, sign: number): void => {
		const text = environment.textForSign(sign);
		const expected = `Row ${index}`;
		check(
			text === expected,
			`item ${index} rendered ${JSON.stringify(text)}, expected ${expected}.`,
		);
		if (text === expected) semanticChecksum += index;
	};

	for (let index = 0; index < VISIBLE_WINDOW_SIZE; index++) {
		const sign = environment.enter(list, index);
		activeSigns.push(sign);
		initialSigns.add(sign);
		verifyCell(index, sign);
	}
	check(
		initialSigns.size === VISIBLE_WINDOW_SIZE,
		`visible window used ${initialSigns.size} distinct cells instead of ${VISIBLE_WINDOW_SIZE}.`,
	);

	for (let index = VISIBLE_WINDOW_SIZE; index < LOGICAL_ITEM_COUNT; index++) {
		const releasedSign = activeSigns.shift();
		if (releasedSign === undefined) throw new Error('active native list window became empty.');
		environment.leave(list, releasedSign);
		const sign = environment.enter(list, index);
		check(sign === releasedSign, `item ${index} did not reuse the released native cell identity.`);
		check(
			initialSigns.has(sign),
			`item ${index} allocated native cell ${sign} outside the window.`,
		);
		activeSigns.push(sign);
		verifyCell(index, sign);
	}

	const steadyState = getLynxListDiagnostics(container, 1);
	if (steadyState === null) throw new Error('list diagnostics disappeared before teardown.');
	check(
		steadyState.logicalItems === LOGICAL_ITEM_COUNT,
		'logical item count changed during scroll.',
	);
	check(
		steadyState.physicalCells <= VISIBLE_WINDOW_SIZE,
		`physical cell count ${steadyState.physicalCells} exceeded the visible window.`,
	);
	check(
		steadyState.attachedCells === VISIBLE_WINDOW_SIZE,
		`attached cell count ${steadyState.attachedCells} did not match the visible window.`,
	);

	for (const sign of activeSigns) environment.leave(list, sign);
	const pooled = getLynxListDiagnostics(container, 1);
	if (pooled === null) throw new Error('list diagnostics disappeared before logical unmount.');
	check(pooled.attachedCells === 0, `${pooled.attachedCells} list cells remained attached.`);
	check(
		pooled.pooledCells === pooled.physicalCells,
		`${pooled.pooledCells}/${pooled.physicalCells} cells entered the reuse pool.`,
	);
	check(
		pooled.createdCells === environment.createdNodeCount('list-item'),
		'host diagnostics and fake PAPI disagreed on physical cell allocation.',
	);
	const expectedChecksum = (LOGICAL_ITEM_COUNT * (LOGICAL_ITEM_COUNT - 1)) / 2;
	check(
		semanticChecksum === expectedChecksum,
		`semantic checksum ${semanticChecksum} did not match ${expectedChecksum}.`,
	);

	prepareLynxHostBatch(container, batch(2, listUnmountCommands(LOGICAL_ITEM_COUNT))).apply();
	const lateCallbackSign = environment.enter(list, 0);
	const remainingCellsAfterTeardown = environment.reachableNodeCount(container.page, 'list-item');
	const cleanup = disposeLynxHostContainer(container);
	check(getLynxListDiagnostics(container, 1) === null, 'list diagnostics survived teardown.');
	check(
		container.instanceCount === 0,
		`${container.instanceCount} logical hosts survived teardown.`,
	);
	check(
		remainingCellsAfterTeardown === 0,
		'a physical list cell remained reachable after teardown.',
	);
	check(lateCallbackSign === -1, `late native callback returned active sign ${lateCallbackSign}.`);
	check(cleanup.complete, 'root-scoped host cleanup did not complete.');
	check(cleanup.errors.length === 0, `host cleanup reported ${cleanup.errors.length} error(s).`);

	return Object.freeze({
		logicalItems: LOGICAL_ITEM_COUNT,
		visibleWindow: VISIBLE_WINDOW_SIZE,
		physicalCells: steadyState.physicalCells,
		createdCells: pooled.createdCells,
		reusedCells: pooled.reusedCells,
		attachedCells: steadyState.attachedCells,
		pooledCells: pooled.pooledCells,
		nativeCellAllocations: environment.createdNodeCount('list-item'),
		semanticChecksum,
		expectedChecksum,
		flushes: environment.flushCount,
		remainingCellsAfterTeardown,
		lateCallbackSign,
		failures: Object.freeze(failures),
	});
}

export interface EagerListAllocationResult {
	readonly logicalItems: number;
	readonly physicalCells: number;
	readonly semanticChecksum: number;
}

/** Deterministic one-native-cell-per-item reference, not a timing comparison. */
export function runEagerListAllocationReference(): EagerListAllocationResult {
	const cells = Array.from({ length: LOGICAL_ITEM_COUNT }, (_, index) => ({
		key: `item-${index}`,
		text: `Row ${index}`,
		index,
	}));
	return Object.freeze({
		logicalItems: cells.length,
		physicalCells: cells.length,
		semanticChecksum: cells.reduce((total, cell) => total + cell.index, 0),
	});
}
