import type {
	UniversalHostBatch,
	UniversalHostCommand,
	UniversalHostTemplateProgram,
	UniversalPortalTargetHandle,
} from 'octane/universal/native';
import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	captureLynxFirstTree,
	createLynxHostContainer,
	createLynxHostDriver,
	disposeLynxHostContainer,
	disposeLynxFirstTree,
	getLynxHostEventListener,
	prepareLynxHostBatch,
	resolveLynxHostNativeEvent,
} from '../src/core/host-driver.js';
import {
	LYNX_FIRST_TREE_MISMATCH,
	releaseLynxFirstTree,
	resolveLynxFirstTreeEvent,
} from '../src/core/first-screen.js';
import { LYNX_CSS_SCOPE_PROP } from '../src/core/host-props.js';
import {
	createLynxElementPAPI,
	type LynxElementEventListener,
	type LynxElementPAPI,
} from '../src/core/papi.js';
import { encodeLynxPortalTargetId } from '../src/core/portal.js';
import {
	createLynxMainThreadWorkletRegistry,
	registerMainThreadWorklet,
	type LynxActivatedMainThreadWorklet,
	type LynxMainThreadRefCell,
	type LynxMainThreadRefDescriptor,
	type LynxMainThreadWorkletRegistry,
} from '../src/core/worklets.js';

interface FakeNode {
	readonly uid: number;
	readonly type: string;
	parent: FakeNode | null;
	readonly children: FakeNode[];
	readonly attributes: Record<string, unknown>;
	classes: string;
	inlineStyle: string;
	readonly dataset: Record<string, unknown>;
	cssScope: { id: number; entryName?: string } | null;
	readonly events: Map<string, Exclude<LynxElementEventListener, undefined>>;
	selector: string;
	id: string | null;
	text: string;
}

type FaultMethod =
	| 'flush'
	| 'getParent'
	| 'insertBefore'
	| 'remove'
	| 'replace'
	| 'setAttribute'
	| 'setEvent'
	| 'setRefSelector';

interface FakePAPI extends LynxElementPAPI<FakeNode> {
	readonly calls: string[];
	readonly flushCount: number;
	failNext(method: FaultMethod, timing: 'before' | 'after', error: Error): void;
	resetCalls(): void;
}

function createFakePAPI(): FakePAPI {
	let nextUid = 1;
	let flushCount = 0;
	let fault: { method: FaultMethod; timing: 'before' | 'after'; error: Error } | null = null;
	const calls: string[] = [];
	const createNode = (type: string, text = ''): FakeNode => ({
		uid: nextUid++,
		type,
		parent: null,
		children: [],
		attributes: {},
		classes: '',
		inlineStyle: '',
		dataset: {},
		cssScope: null,
		events: new Map(),
		selector: '',
		id: null,
		text,
	});
	const run = <Result>(method: FaultMethod, mutation: () => Result): Result => {
		calls.push(method);
		if (fault?.method === method && fault.timing === 'before') {
			const error = fault.error;
			fault = null;
			throw error;
		}
		const result = mutation();
		if (fault?.method === method && fault.timing === 'after') {
			const error = fault.error;
			fault = null;
			throw error;
		}
		return result;
	};
	const detach = (node: FakeNode): void => {
		if (node.parent === null) return;
		const index = node.parent.children.indexOf(node);
		if (index === -1) throw new Error('Fake PAPI topology is inconsistent.');
		node.parent.children.splice(index, 1);
		node.parent = null;
	};
	const papi: FakePAPI = {
		calls,
		get flushCount() {
			return flushCount;
		},
		createPage() {
			calls.push('createPage');
			return createNode('page');
		},
		createElement(type, _parentComponentUniqueId, text) {
			calls.push(`create:${type}`);
			return createNode(type === '#text' ? 'raw-text' : type, text);
		},
		getUniqueId(node) {
			calls.push('getUniqueId');
			return node.uid;
		},
		getParent(node) {
			return run('getParent', () => node.parent);
		},
		isEqual(first, second) {
			return first === second;
		},
		isChild(parent, child) {
			calls.push('isChild');
			return child.parent === parent;
		},
		insertBefore(parent, child, before) {
			run('insertBefore', () => {
				detach(child);
				const index = before === null ? parent.children.length : parent.children.indexOf(before);
				if (index === -1) throw new Error('Fake PAPI before node is not a child.');
				parent.children.splice(index, 0, child);
				child.parent = parent;
			});
		},
		remove(parent, child) {
			run('remove', () => {
				if (child.parent !== parent) throw new Error('Fake PAPI child is not attached.');
				detach(child);
			});
		},
		replace(replacement, previous) {
			run('replace', () => {
				const parent = previous.parent;
				if (parent === null) throw new Error('Fake PAPI previous node is detached.');
				const index = parent.children.indexOf(previous);
				detach(replacement);
				parent.children[index] = replacement;
				replacement.parent = parent;
				previous.parent = null;
			});
		},
		setAttribute(node, name, value) {
			run('setAttribute', () => {
				if (name === 'text') {
					node.text = String(value);
				} else if (value === null) {
					delete node.attributes[name];
				} else {
					node.attributes[name] = value;
				}
			});
		},
		setClasses(node, value) {
			calls.push('setClasses');
			node.classes = value;
		},
		setInlineStyles(node, value) {
			calls.push('setInlineStyles');
			node.inlineStyle =
				typeof value === 'string'
					? value
					: Object.entries(value)
							.map(([name, entry]) => `${name}:${entry}`)
							.join(';');
		},
		setCssId(node, id, entryName) {
			calls.push('setCssId');
			node.cssScope = { id, ...(entryName === undefined ? null : { entryName }) };
		},
		setDataset(node, value) {
			calls.push('setDataset');
			for (const name of Object.keys(node.dataset)) delete node.dataset[name];
			Object.assign(node.dataset, value);
		},
		setEvent(node, kind, name, listener) {
			run('setEvent', () => {
				const key = `${kind}:${name}`;
				if (listener === undefined) node.events.delete(key);
				else node.events.set(key, listener);
			});
		},
		setRefSelector(node, value) {
			run('setRefSelector', () => {
				node.selector = value;
			});
		},
		setId(node, id) {
			calls.push('setId');
			node.id = id;
		},
		flush() {
			run('flush', () => {
				flushCount += 1;
			});
		},
		failNext(method, timing, error) {
			fault = { method, timing, error };
		},
		resetCalls() {
			calls.length = 0;
		},
	};
	return papi;
}

function batch(
	version: number,
	commands: readonly UniversalHostCommand[],
	renderer = 'lynx',
): UniversalHostBatch {
	return { renderer, version, commands };
}

function portalTarget(
	target: number,
	generation = 1,
	transportRoot = 1,
	universalRoot = 71,
): UniversalPortalTargetHandle {
	return Object.freeze({
		$$kind: 'octane.universal.portal-target',
		renderer: 'lynx',
		root: universalRoot,
		id: encodeLynxPortalTargetId({ root: transportRoot, id: target, generation }),
	});
}

for (const id of ['counter.tsrx:tap', 'scene.tsrx:swipe', 'card.tsrx:tap']) {
	registerMainThreadWorklet(id, undefined, () => undefined);
}
registerMainThreadWorklet('alias.tsrx:tap', undefined, function () {
	const values = this._c?.values as readonly unknown[] | undefined;
	return values?.[0] === values?.[1];
});

interface ObservedWorkletRegistry extends LynxMainThreadWorkletRegistry {
	readonly refValues: ReadonlyMap<string, unknown>;
}

function createObservedWorkletRegistry(): ObservedWorkletRegistry {
	const registry = createLynxMainThreadWorkletRegistry();
	const refValues = new Map<string, unknown>();
	return Object.freeze({
		...registry,
		refValues,
		retainRef<T>(
			descriptor: LynxMainThreadRefDescriptor,
			initialValue: T,
		): LynxMainThreadRefCell<T> {
			const cell = registry.retainRef(descriptor, initialValue);
			refValues.set(descriptor._wvid, initialValue);
			return cell;
		},
		updateRef<T>(descriptor: LynxMainThreadRefDescriptor, value: T): void {
			registry.updateRef(descriptor, value);
			refValues.set(descriptor._wvid, value);
		},
	});
}

function createHost(root = 1, worklets?: LynxMainThreadWorkletRegistry) {
	const papi = createFakePAPI();
	const container = createLynxHostContainer(papi, { root, worklets });
	const driver = createLynxHostDriver<FakeNode>();
	papi.resetCalls();
	return { container, driver, page: container.page, papi };
}

describe('Lynx Element PAPI host driver', () => {
	it('mounts and flushes through the pinned public testing environment', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const worklets = createObservedWorkletRegistry();
			const setIds: Array<string | null> = [];
			const workletCalls: unknown[] = [];
			(globalThis as unknown as { runWorklet: (context: unknown) => void }).runWorklet = (
				context,
			) => {
				workletCalls.push(context);
				worklets.runWorklet(context as never);
			};
			const testingSetId = globalThis.__SetID;
			globalThis.__SetID = (node, id) => {
				setIds.push(id);
				// @lynx-js/testing-environment@0.3.0 assigns the value to a DOM
				// string property. Contain that model mismatch here while asserting
				// that the production adapter preserves the public null contract.
				testingSetId(node, id ?? '');
			};
			const papi = createLynxElementPAPI(globalThis);
			const container = createLynxHostContainer(papi, { root: 1, worklets });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{
						op: 'create',
						id: 1,
						type: 'view',
						props: {
							id: 'counter',
							'main-thread:bindtap': { _wkltId: 'counter.tsrx:tap' },
						},
					},
					{ op: 'create', id: 2, type: 'text', props: {} },
					{ op: 'create', id: 3, type: '#text', props: { value: 'Count: 0' } },
					{ op: 'insert', parent: null, id: 1, before: null },
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: 2, id: 3, before: null },
				]),
			).apply();

			const page = container.page as unknown as Element;
			expect(page.querySelector('#counter')?.textContent).toBe('Count: 0');
			page
				.querySelector('#counter')!
				.dispatchEvent(new dom.window.Event('bindEvent:tap', { bubbles: true }));
			expect(workletCalls).toEqual([{ _wkltId: 'counter.tsrx:tap', _owlt: expect.any(Number) }]);
			prepareLynxHostBatch(container, batch(2, [{ op: 'update', id: 1, props: {} }])).apply();
			expect(setIds).toEqual(['counter', null]);
			page
				.querySelector('view')!
				.dispatchEvent(new dom.window.Event('bindEvent:tap', { bubbles: true }));
			expect(workletCalls).toHaveLength(1);
			expect(page.querySelector('#counter')).toBeNull();
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
			expect(page.children).toHaveLength(0);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('adopts an entry-owned page without creating a second page', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		papi.resetCalls();
		const container = createLynxHostContainer(papi, { root: 1, page });

		expect(container.page).toBe(page);
		expect(papi.calls).toEqual(['getUniqueId']);
	});

	it('transfers a compatible first tree without allocating or restructuring native nodes', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const worklets = createObservedWorkletRegistry();
		const mainThreadProps = {
			'main-thread:catchswipe': {
				_wkltId: 'scene.tsrx:swipe',
				_c: {
					axis: 'x',
					onBackground: { _jsFnId: 'scene.tsrx:background', _c: { label: 'saved' } },
				},
			},
			'main-thread:ref': { _wvid: 'scene:button' },
		};
		const adoptedMainThreadProps = {
			...mainThreadProps,
			'main-thread:catchswipe': {
				...mainThreadProps['main-thread:catchswipe'],
				_c: {
					...mainThreadProps['main-thread:catchswipe']._c,
					onBackground: {
						...mainThreadProps['main-thread:catchswipe']._c.onBackground,
						_execId: 'exec:scene:background',
					},
				},
			},
		};
		const source = createLynxHostContainer(papi, { root: 7, page, worklets });
		prepareLynxHostBatch(
			source,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: { id: 'button', ...mainThreadProps },
				},
				{ op: 'create', id: 2, type: 'text', props: { class: ['label', 'active'] } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]),
		).apply();
		const sourceRoot = page.children[0]!;
		const sourceChild = sourceRoot.children[0]!;
		const placeholderToken = sourceRoot.events.get('bindEvent:tap')!;
		const preparedBeforeCapture = prepareLynxHostBatch(
			source,
			batch(2, [{ op: 'update', id: 1, props: { id: 'too-late' } }]),
		);
		const firstTree = captureLynxFirstTree(source, { plan: 'scene:compatible' });

		expect(JSON.parse(JSON.stringify(firstTree.snapshot))).toEqual(firstTree.snapshot);
		expect(firstTree.snapshot).toMatchObject({
			format: 1,
			renderer: 'lynx',
			root: 7,
			version: 1,
			plan: 'scene:compatible',
			roots: [1],
		});
		const capturedClass = firstTree.snapshot.nodes.find((node) => node.id === 2)?.props.class;
		expect(firstTree.snapshot.nodes.find((node) => node.id === 1)?.props).toMatchObject(
			mainThreadProps,
		);
		expect(capturedClass).toEqual(['label', 'active']);
		expect(Object.isFrozen(capturedClass)).toBe(true);
		expect(() => (capturedClass as string[]).push('mutated')).toThrow();
		expect(resolveLynxFirstTreeEvent(firstTree, placeholderToken)).toEqual({
			host: 1,
			generation: 1,
			type: 'bindtap',
			listener: 101,
			priority: 'discrete',
		});
		expect(() => prepareLynxHostBatch(source, batch(2, []))).toThrow(/captured first-tree root/);
		expect(() => preparedBeforeCapture.apply()).toThrow(/captured first-tree root/);
		preparedBeforeCapture.abort();

		const target = createLynxHostContainer(papi, { root: 7, page, worklets });
		const driver = createLynxHostDriver<FakeNode>();
		papi.resetCalls();
		const prepared = prepareLynxHostBatch(
			target,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: { id: 'button', ...adoptedMainThreadProps },
				},
				{ op: 'create', id: 2, type: 'text', props: { class: ['label', 'active'] } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 202, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]),
			{ firstTree },
		);

		expect(prepared.firstTreeAction).toBe('adopt');
		expect(prepared.handleDelta.map((entry) => entry.op)).toEqual(['create', 'create']);
		prepared.apply();

		expect(page.children).toEqual([sourceRoot]);
		expect(sourceRoot.children).toEqual([sourceChild]);
		expect(sourceRoot.events.get('catchEvent:swipe')).toMatchObject({
			type: 'worklet',
			value: {
				_c: { onBackground: { _execId: 'exec:scene:background' } },
			},
		});
		expect(worklets.refValues.get('scene:button')).toBe(sourceRoot);
		expect(source.disposed).toBe(true);
		expect(target.instanceCount).toBe(2);
		expect(driver.getPublicInstance(target, 1)).toMatchObject({
			root: 7,
			id: 1,
			generation: 1,
		});
		expect(papi.calls.some((call) => call.startsWith('create:'))).toBe(false);
		expect(papi.calls).not.toContain('insertBefore');
		expect(papi.calls).not.toContain('remove');
		const adoptedToken = sourceRoot.events.get('bindEvent:tap')!;
		expect(adoptedToken).not.toBe(placeholderToken);
		expect(resolveLynxHostNativeEvent(target, adoptedToken)).toEqual({
			listener: 202,
			priority: 'discrete',
		});
		expect(disposeLynxFirstTree(firstTree).complete).toBe(true);
		expect(target.disposed).toBe(false);
		releaseLynxFirstTree(firstTree);
		expect(resolveLynxFirstTreeEvent(firstTree, placeholderToken)).toBeNull();
	});

	it('adopts an already-painted host template without replacing its nodes or event behavior', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const shape = Object.freeze([
			Object.freeze({ type: 'view', parent: -1 }),
			Object.freeze({ type: 'text', parent: 0 }),
			Object.freeze({ type: '#text', parent: 1 }),
		]);
		const command = (listener: number): UniversalHostCommand => ({
			op: 'mount-template',
			parent: null,
			before: null,
			shape,
			nodes: [
				{
					id: 1,
					props: { id: 'painted' },
					events: [{ type: 'bindtap', listener: { id: listener, priority: 'discrete' } }],
				},
				{ id: 2, props: { class: 'label' } },
				{ id: 3, props: { value: 'Ready' } },
			],
		});
		const source = createLynxHostContainer(papi, { root: 26, page });
		prepareLynxHostBatch(source, batch(1, [command(601)])).apply();
		const painted = page.children[0]!;
		const paintedLabel = painted.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		const target = createLynxHostContainer(papi, { root: 26, page });

		papi.resetCalls();
		const prepared = prepareLynxHostBatch(target, batch(1, [command(602)]), { firstTree });
		expect(prepared.firstTreeAction).toBe('adopt');
		prepared.apply();

		expect(page.children).toEqual([painted]);
		expect(painted.children).toEqual([paintedLabel]);
		expect(paintedLabel.children[0]).toMatchObject({ type: 'raw-text', text: 'Ready' });
		expect(papi.calls.some((call) => call.startsWith('create:'))).toBe(false);
		expect(papi.calls).not.toContain('insertBefore');
		expect(resolveLynxHostNativeEvent(target, painted.events.get('bindEvent:tap')!)).toEqual({
			listener: 602,
			priority: 'discrete',
		});
	});

	it('preserves capture aliases through compatible first-tree adoption', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const worklets = createLynxMainThreadWorkletRegistry();
		const sourceShared = { value: 1 };
		const source = createLynxHostContainer(papi, { root: 31, page, worklets });
		prepareLynxHostBatch(
			source,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: {
						'main-thread:bindtap': {
							_wkltId: 'alias.tsrx:tap',
							_c: { values: [sourceShared, sourceShared] },
						},
					},
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const painted = page.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		const captured = firstTree.snapshot.nodes[0]!.props['main-thread:bindtap'] as {
			readonly _c: { readonly values: readonly unknown[] };
		};
		expect(captured._c.values[0]).toBe(captured._c.values[1]);

		const targetShared = { value: 1 };
		const target = createLynxHostContainer(papi, { root: 31, page, worklets });
		const prepared = prepareLynxHostBatch(
			target,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: {
						'main-thread:bindtap': {
							_wkltId: 'alias.tsrx:tap',
							_c: { values: [targetShared, targetShared] },
						},
					},
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
			{ firstTree },
		);

		expect(prepared.firstTreeAction).toBe('adopt');
		prepared.apply();
		expect(page.children[0]).toBe(painted);
		const active = (
			painted.events.get('bindEvent:tap') as {
				readonly value: LynxActivatedMainThreadWorklet;
			}
		).value;
		expect(worklets.runWorklet(active)).toBe(true);
		expect(disposeLynxHostContainer(target).complete).toBe(true);
		expect(disposeLynxFirstTree(firstTree).complete).toBe(true);
		releaseLynxFirstTree(firstTree);
	});

	it('repairs a first tree when capture alias topology changes', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const worklets = createLynxMainThreadWorkletRegistry();
		const sourceShared = { value: 1 };
		const source = createLynxHostContainer(papi, { root: 32, page, worklets });
		prepareLynxHostBatch(
			source,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: {
						'main-thread:bindtap': {
							_wkltId: 'alias.tsrx:tap',
							_c: { values: [sourceShared, sourceShared] },
						},
					},
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const painted = page.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		const target = createLynxHostContainer(papi, { root: 32, page, worklets });
		const prepared = prepareLynxHostBatch(
			target,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: {
						'main-thread:bindtap': {
							_wkltId: 'alias.tsrx:tap',
							_c: { values: [{ value: 1 }, { value: 1 }] },
						},
					},
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
			{ firstTree },
		);

		expect(prepared.firstTreeAction).toBe('repair');
		prepared.apply();
		const replacement = page.children[0]!;
		expect(replacement).not.toBe(painted);
		const active = (
			replacement.events.get('bindEvent:tap') as {
				readonly value: LynxActivatedMainThreadWorklet;
			}
		).value;
		expect(worklets.runWorklet(active)).toBe(false);
		expect(disposeLynxHostContainer(target).complete).toBe(true);
		expect(disposeLynxFirstTree(firstTree).complete).toBe(true);
		releaseLynxFirstTree(firstTree);
	});

	it.each([
		['setRefSelector', 'before'],
		['setRefSelector', 'after'],
		['setEvent', 'before'],
		['setEvent', 'after'],
	] as const)(
		'cleans every transferred placeholder event when adoption %s fails %s mutation',
		(method, timing) => {
			const papi = createFakePAPI();
			const page = papi.createPage('entry', 0);
			const source = createLynxHostContainer(papi, { root: 7, page });
			const sourceBatch = batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'parent' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'child' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'event', id: 2, type: 'bindtap', listener: { id: 102, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]);
			prepareLynxHostBatch(source, sourceBatch).apply();
			const sourceRoot = page.children[0]!;
			const sourceChild = sourceRoot.children[0]!;
			const firstTree = captureLynxFirstTree(source);
			const target = createLynxHostContainer(papi, { root: 7, page });
			const targetBatch = batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'parent' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'child' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 201, priority: 'discrete' } },
				{ op: 'event', id: 2, type: 'bindtap', listener: { id: 202, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]);
			const prepared = prepareLynxHostBatch(target, targetBatch, { firstTree });
			const failure = new Error(`${method} failed ${timing} mutation`);
			papi.failNext(method, timing, failure);

			expect(() => prepared.apply()).toThrow(failure);
			expect(prepared.mutationStarted).toBe(true);
			expect(source.disposed).toBe(true);
			expect(disposeLynxFirstTree(firstTree).complete).toBe(true);

			const cleanup = disposeLynxHostContainer(target);
			expect(cleanup.complete).toBe(true);
			expect(cleanup.errors).toEqual([]);
			expect(page.children).toEqual([]);
			expect(sourceRoot.events.size).toBe(0);
			expect(sourceChild.events.size).toBe(0);
			expect(target.disposed).toBe(true);
			releaseLynxFirstTree(firstTree);
		},
	);

	it('repairs a captured first tree whose page root was physically detached', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const source = createLynxHostContainer(papi, { root: 5, page });
		const commands = batch(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'root' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		prepareLynxHostBatch(source, commands).apply();
		const painted = page.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		papi.remove(page, painted);
		const target = createLynxHostContainer(papi, { root: 5, page });
		const mismatches: Error[] = [];

		const prepared = prepareLynxHostBatch(target, commands, {
			firstTree,
			onMismatch(error) {
				mismatches.push(error);
			},
		});

		expect(prepared.firstTreeAction).toBe('repair');
		expect(mismatches).toEqual([
			expect.objectContaining({
				code: LYNX_FIRST_TREE_MISMATCH,
				path: 'snapshot.nodes[1].parent',
			}),
		]);
		prepared.apply();
		expect(source.disposed).toBe(true);
		expect(page.children).toHaveLength(1);
		expect(page.children[0]).not.toBe(painted);
		expect(page.children[0]!.id).toBe('root');
	});

	it('repairs a captured first tree whose page root was reparented under an external host', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const source = createLynxHostContainer(papi, { root: 5, page });
		const commands = batch(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'root' } },
			{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		prepareLynxHostBatch(source, commands).apply();
		const painted = page.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		const external = papi.createElement('view', page.uid, '');
		papi.insertBefore(page, external, null);
		papi.insertBefore(external, painted, null);
		const target = createLynxHostContainer(papi, { root: 5, page });
		const mismatches: Error[] = [];

		const prepared = prepareLynxHostBatch(target, commands, {
			firstTree,
			onMismatch(error) {
				mismatches.push(error);
			},
		});

		expect(prepared.firstTreeAction).toBe('repair');
		expect(mismatches).toEqual([
			expect.objectContaining({
				code: LYNX_FIRST_TREE_MISMATCH,
				path: 'snapshot.nodes[1].parent',
			}),
		]);
		prepared.apply();
		expect(source.disposed).toBe(true);
		expect(external.children).toEqual([]);
		expect(painted.parent).toBeNull();
		expect(painted.events.size).toBe(0);
		expect(page.children).toHaveLength(2);
		expect(page.children[0]).toBe(external);
		expect(page.children[1]).not.toBe(painted);
		expect(page.children[1]!.id).toBe('root');
	});

	it('repairs a captured first tree whose child was physically reparented', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const source = createLynxHostContainer(papi, { root: 5, page });
		const commands = batch(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'root' } },
			{ op: 'create', id: 2, type: 'view', props: { id: 'first' } },
			{ op: 'create', id: 3, type: 'view', props: { id: 'second' } },
			{ op: 'insert', parent: null, id: 1, before: null },
			{ op: 'insert', parent: 1, id: 2, before: null },
			{ op: 'insert', parent: 1, id: 3, before: null },
		]);
		prepareLynxHostBatch(source, commands).apply();
		const painted = page.children[0]!;
		const firstChild = painted.children[0]!;
		const secondChild = painted.children[1]!;
		const firstTree = captureLynxFirstTree(source);
		papi.insertBefore(secondChild, firstChild, null);
		const target = createLynxHostContainer(papi, { root: 5, page });
		const mismatches: Error[] = [];

		const prepared = prepareLynxHostBatch(target, commands, {
			firstTree,
			onMismatch(error) {
				mismatches.push(error);
			},
		});

		expect(prepared.firstTreeAction).toBe('repair');
		expect(mismatches).toEqual([
			expect.objectContaining({
				code: LYNX_FIRST_TREE_MISMATCH,
				path: 'snapshot.nodes[2].parent',
			}),
		]);
		prepared.apply();
		expect(source.disposed).toBe(true);
		expect(page.children).toHaveLength(1);
		expect(page.children[0]).not.toBe(painted);
		expect(page.children[0]!.children.map((node) => node.id)).toEqual(['first', 'second']);
	});

	it('repairs a captured first tree whose child was reparented under an external host', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const source = createLynxHostContainer(papi, { root: 5, page });
		const commands = batch(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'root' } },
			{ op: 'create', id: 2, type: 'view', props: { id: 'child' } },
			{ op: 'event', id: 2, type: 'bindtap', listener: { id: 102, priority: 'discrete' } },
			{ op: 'insert', parent: null, id: 1, before: null },
			{ op: 'insert', parent: 1, id: 2, before: null },
		]);
		prepareLynxHostBatch(source, commands).apply();
		const painted = page.children[0]!;
		const paintedChild = painted.children[0]!;
		const firstTree = captureLynxFirstTree(source);
		const external = papi.createElement('view', page.uid, '');
		papi.insertBefore(page, external, null);
		papi.insertBefore(external, paintedChild, null);
		const target = createLynxHostContainer(papi, { root: 5, page });
		const mismatches: Error[] = [];

		const prepared = prepareLynxHostBatch(target, commands, {
			firstTree,
			onMismatch(error) {
				mismatches.push(error);
			},
		});

		expect(prepared.firstTreeAction).toBe('repair');
		expect(mismatches).toEqual([
			expect.objectContaining({
				code: LYNX_FIRST_TREE_MISMATCH,
				path: 'snapshot.nodes[2].parent',
			}),
		]);
		prepared.apply();
		expect(source.disposed).toBe(true);
		expect(external.children).toEqual([]);
		expect(painted.parent).toBeNull();
		expect(paintedChild.parent).toBeNull();
		expect(paintedChild.events.size).toBe(0);
		expect(page.children).toHaveLength(2);
		expect(page.children[0]).toBe(external);
		expect(page.children[1]).not.toBe(painted);
		expect(page.children[1]!.children.map((node) => node.id)).toEqual(['child']);
	});

	it('reports a deterministic mismatch and repairs only when the batch is applied', () => {
		const papi = createFakePAPI();
		const page = papi.createPage('entry', 0);
		const source = createLynxHostContainer(papi, { root: 3, page });
		prepareLynxHostBatch(
			source,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'main-value' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const painted = page.children[0]!;
		const firstTree = captureLynxFirstTree(source, { plan: 'scene:mismatch' });
		const target = createLynxHostContainer(papi, { root: 3, page });
		const mismatches: Error[] = [];
		const commands = batch(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'background-value' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		const aborted = prepareLynxHostBatch(target, commands, {
			firstTree,
			onMismatch(error) {
				mismatches.push(error);
			},
		});

		expect(aborted.firstTreeAction).toBe('repair');
		expect(mismatches[0]).toMatchObject({
			code: LYNX_FIRST_TREE_MISMATCH,
			path: 'snapshot.nodes[1].props',
			plan: 'scene:mismatch',
		});
		papi.resetCalls();
		aborted.abort();
		expect(papi.calls).toEqual([]);
		expect(page.children).toEqual([painted]);
		expect(source.disposed).toBe(false);

		const repaired = prepareLynxHostBatch(target, commands, { firstTree });
		papi.resetCalls();
		repaired.apply();

		expect(repaired.firstTreeAction).toBe('repair');
		expect(source.disposed).toBe(true);
		expect(painted.parent).toBeNull();
		expect(page.children).toHaveLength(1);
		expect(page.children[0]).not.toBe(painted);
		expect(page.children[0]!.id).toBe('background-value');
		expect(papi.calls.indexOf('remove')).toBeLessThan(papi.calls.indexOf('create:view'));
		expect(papi.calls.filter((call) => call === 'flush')).toHaveLength(2);
		expect(disposeLynxFirstTree(firstTree).complete).toBe(true);
	});

	it('applies every structural command with complete props and one flush per batch', () => {
		const { container, driver, page, papi } = createHost();
		const mount = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'parent', title: 'first' } },
				{ op: 'create', id: 2, type: 'text', props: { id: 'label' } },
				{ op: 'create', id: 3, type: '#text', props: { value: 'Count: 0' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: 2, id: 3, before: null },
				{ op: 'visibility', id: 2, state: 'hidden' },
			]),
		);

		expect(mount.mutationStarted).toBe(false);
		expect(mount.firstTreeAction).toBe('none');
		expect(mount.handleDelta.map((entry) => entry.op)).toEqual(['create', 'create', 'create']);
		mount.apply();

		const parent = page.children[0];
		const label = parent.children[0];
		const text = label.children[0];
		expect(mount.mutationStarted).toBe(true);
		expect(parent).toMatchObject({ type: 'view', id: 'parent' });
		expect(parent.attributes).toEqual({ title: 'first' });
		expect(label).toMatchObject({ type: 'text', id: 'label' });
		expect(label.attributes.hidden).toBe(true);
		expect(text).toMatchObject({ type: 'raw-text', text: 'Count: 0' });
		expect(getLynxHostEventListener(container, 1, 'bindtap')).toEqual({
			id: 101,
			priority: 'discrete',
		});
		expect(container.acceptedVersion).toBe(1);
		expect(container.instanceCount).toBe(3);
		expect(papi.flushCount).toBe(1);

		const parentHandle = driver.getPublicInstance(container, 1);
		const labelHandle = driver.getPublicInstance(container, 2);
		const update = prepareLynxHostBatch(
			container,
			batch(4, [
				{ op: 'update', id: 1, props: { id: 'parent-next', role: 'group' } },
				{ op: 'update', id: 3, props: { value: 'Count: 1' } },
				{ op: 'move', parent: null, id: 2, before: 1 },
				{ op: 'visibility', id: 2, state: 'visible' },
				{ op: 'remove', parent: 2, id: 3 },
				{ op: 'destroy', id: 3 },
			]),
		);
		update.apply();

		expect(page.children).toEqual([label, parent]);
		expect(parent.id).toBe('parent-next');
		expect(parent.attributes).toEqual({ role: 'group' });
		expect(label.attributes).not.toHaveProperty('hidden');
		expect(text.text).toBe('Count: 1');
		expect(text.parent).toBe(null);
		expect(driver.getPublicInstance(container, 1)).toBe(parentHandle);
		expect(driver.getPublicInstance(container, 2)).toBe(labelHandle);
		expect(driver.getPublicInstance(container, 3)).toBe(null);
		expect(update.handleDelta).toEqual([
			{
				op: 'destroy',
				renderer: 'lynx',
				root: 1,
				id: 3,
				generation: 1,
			},
		]);
		expect(container.acceptedVersion).toBe(4);
		expect(container.instanceCount).toBe(2);
		expect(papi.flushCount).toBe(2);

		const unmount = prepareLynxHostBatch(
			container,
			batch(5, [
				{ op: 'remove', parent: null, id: 2 },
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 2 },
				{ op: 'destroy', id: 1 },
			]),
		);
		unmount.apply();
		expect(page.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(papi.flushCount).toBe(3);
	});

	it('mounts a complete host template before an existing sibling with live events and query handles', () => {
		const { container, driver, page, papi } = createHost(24);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'parent' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'existing' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]),
		).apply();

		const command: UniversalHostCommand = {
			op: 'mount-template',
			parent: 1,
			before: 2,
			shape: [
				{ type: 'view', parent: -1 },
				{ type: 'text', parent: 0 },
				{ type: '#text', parent: 1 },
				{ type: 'view', parent: 0 },
				{ type: 'text', parent: 3 },
				{ type: '#text', parent: 4 },
			],
			nodes: [
				{ id: 3, props: { class: 'card' } },
				{ id: 4, props: { class: 'label' } },
				{ id: 5, props: { value: 'First' } },
				{
					id: 6,
					props: { id: 'button', title: 'ready' },
					events: [{ type: 'bindtap', listener: { id: 401, priority: 'discrete' } }],
				},
				{ id: 7, props: {} },
				{ id: 8, props: { value: 'Second' } },
			],
		};
		const prepared = prepareLynxHostBatch(container, batch(2, [command]));
		expect(prepared.handleDelta.map((delta) => delta.op)).toEqual([
			'create',
			'create',
			'create',
			'create',
			'create',
			'create',
		]);
		expect(page.children[0]!.children.map((node) => node.id)).toEqual(['existing']);
		prepared.apply();

		const parent = page.children[0]!;
		const [card, existing] = parent.children;
		const [label, button] = card.children;
		expect(card.classes).toBe('card');
		expect(existing.id).toBe('existing');
		expect(label.classes).toBe('label');
		expect(label.children[0]).toMatchObject({ type: 'raw-text', text: 'First' });
		expect(button).toMatchObject({ id: 'button', attributes: { title: 'ready' } });
		expect(button.children[0]!.children[0]).toMatchObject({ type: 'raw-text', text: 'Second' });
		const token = button.events.get('bindEvent:tap')!;
		expect(resolveLynxHostNativeEvent(container, token)).toEqual({
			listener: 401,
			priority: 'discrete',
		});
		for (const id of [3, 4, 5, 6, 7, 8]) {
			expect(driver.getPublicInstance(container, id)).toMatchObject({
				root: 24,
				id,
				generation: 1,
			});
		}
		expect(card.selector).toBe('r24-h3-g1');
		expect(button.selector).toBe('r24-h6-g1');
		expect(container.instanceCount).toBe(8);
		expect(papi.flushCount).toBe(2);
	});

	it('snapshots template values and listener identities before physical application', () => {
		const { container, page } = createHost(25);
		const props = { id: 'before' };
		const listener = { id: 501, priority: 'discrete' as const };
		const shape = [{ type: 'view', parent: -1 }];
		const nodes = [{ id: 1, props, events: [{ type: 'bindtap', listener }] }];
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [{ op: 'mount-template', parent: null, before: null, shape, nodes }]),
		);

		props.id = 'after';
		listener.id = 999;
		shape[0]!.type = 'image';
		nodes[0]!.id = 999;
		prepared.apply();

		const mounted = page.children[0]!;
		expect(mounted).toMatchObject({ type: 'view', id: 'before' });
		expect(resolveLynxHostNativeEvent(container, mounted.events.get('bindEvent:tap')!)).toEqual({
			listener: 501,
			priority: 'discrete',
		});
	});

	it('executes a shared host program with dynamic scalar values and contiguous listener identities', () => {
		const { container, driver, page } = createHost(35);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({ type: 'view', parent: -1, props: Object.freeze({ class: 'card' }) }),
				Object.freeze({ type: 'text', parent: 0, props: Object.freeze({ class: 'label' }) }),
				Object.freeze({
					type: '#text',
					parent: 1,
					props: Object.freeze({}),
					bindings: Object.freeze([Object.freeze({ name: 'value', valueIndex: 0 })]),
				}),
				Object.freeze({
					type: 'view',
					parent: 0,
					props: Object.freeze({ class: 'action' }),
					bindings: Object.freeze([Object.freeze({ name: 'id', valueIndex: 1 })]),
				}),
			]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
				Object.freeze({ node: 3, type: 'catchtap', priority: 'discrete' as const }),
			]),
		});
		prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template-range',
					parent: null,
					before: null,
					program,
					firstId: 10,
					values: ['Ready', 'primary'],
					firstListenerId: 800,
				},
				{
					op: 'mount-template-range',
					parent: null,
					before: null,
					program,
					firstId: 20,
					values: ['Again', 'secondary'],
					firstListenerId: 900,
				},
			]),
		).apply();

		const [first, second] = page.children;
		expect(first.classes).toBe('card');
		expect(first.children[0]!.classes).toBe('label');
		expect(first.children[0]!.children[0]).toMatchObject({ type: 'raw-text', text: 'Ready' });
		expect(first.children[1]).toMatchObject({ classes: 'action', id: 'primary' });
		expect(second.children[0]!.children[0]!.text).toBe('Again');
		expect(second.children[1]!.id).toBe('secondary');
		expect(resolveLynxHostNativeEvent(container, first.events.get('bindEvent:tap')!)).toEqual({
			listener: 800,
			priority: 'default',
		});
		expect(
			resolveLynxHostNativeEvent(container, first.children[1]!.events.get('catchEvent:tap')!),
		).toEqual({ listener: 801, priority: 'discrete' });
		expect(resolveLynxHostNativeEvent(container, second.events.get('bindEvent:tap')!)).toEqual({
			listener: 900,
			priority: 'default',
		});
		for (const id of [10, 11, 12, 13, 20, 21, 22, 23]) {
			expect(driver.getPublicInstance(container, id)).toMatchObject({
				root: 35,
				id,
				generation: 1,
			});
		}
		expect(first.selector).toBe('r35-h10-g1');
		expect(first.children[1]!.selector).toBe('r35-h13-g1');

		const oldAction = first.children[1]!.events.get('catchEvent:tap')!;
		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'update', id: 12, props: { value: 'Updated' } },
				{
					op: 'event',
					id: 13,
					type: 'catchtap',
					listener: { id: 950, priority: 'default' },
				},
			]),
		).apply();
		expect(first.children[0]!.children[0]!.text).toBe('Updated');
		expect(resolveLynxHostNativeEvent(container, oldAction)).toBeNull();
		expect(
			resolveLynxHostNativeEvent(container, first.children[1]!.events.get('catchEvent:tap')!),
		).toEqual({ listener: 950, priority: 'default' });
	});

	it('rejects malformed program identities and scalar bindings before mutating the native tree', () => {
		const { container, page, papi } = createHost(36);
		const program: UniversalHostTemplateProgram = {
			nodes: [
				{ type: 'view', parent: -1, props: {} },
				{ type: 'text', parent: 0, props: {} },
				{
					type: '#text',
					parent: 1,
					props: {},
					bindings: [{ name: 'value', valueIndex: 0 }],
				},
			],
			events: [{ node: 0, type: 'bindtap', priority: 'discrete' }],
		};
		const command = {
			op: 'mount-template-range' as const,
			parent: null,
			before: null,
			program,
			firstId: 1,
			values: ['ready'],
			firstListenerId: 20,
		};

		expect(() => prepareLynxHostBatch(container, batch(1, [{ ...command, values: [] }]))).toThrow(
			/scalar binding count/,
		);
		expect(() =>
			prepareLynxHostBatch(container, batch(1, [{ ...command, firstListenerId: null }])),
		).toThrow(/firstListenerId/);
		expect(() =>
			prepareLynxHostBatch(container, batch(1, [{ ...command, firstId: Number.MAX_SAFE_INTEGER }])),
		).toThrow(/host identity range/);
		expect(() =>
			prepareLynxHostBatch(container, batch(1, [{ ...command, values: [false] }])),
		).toThrow(/#text must contain a string value/);
		expect(page.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(papi.calls).toEqual([]);
	});

	it('preserves shared frozen static classes across host types and independent later updates', () => {
		const { container, page } = createHost(27);
		const shared = Object.freeze({ class: 'repeated' });
		const shape = Object.freeze([
			Object.freeze({ type: 'view', parent: -1 }),
			Object.freeze({ type: 'text', parent: 0 }),
		]);
		const template = (root: number): UniversalHostCommand => ({
			op: 'mount-template',
			parent: null,
			before: null,
			shape,
			nodes: [
				{ id: root, props: shared },
				{ id: root + 1, props: shared },
			],
		});
		prepareLynxHostBatch(container, batch(1, [template(1), template(3)])).apply();
		const [first, second] = page.children;
		expect(first.classes).toBe('repeated');
		expect(first.children[0]!.classes).toBe('repeated');
		expect(second.classes).toBe('repeated');
		expect(second.children[0]!.classes).toBe('repeated');

		prepareLynxHostBatch(
			container,
			batch(2, [{ op: 'update', id: 1, props: { class: 'updated' } }]),
		).apply();
		expect(first.classes).toBe('updated');
		expect(first.children[0]!.classes).toBe('repeated');
		expect(second.classes).toBe('repeated');
	});

	it('reads each frozen accessor independently instead of retaining its first rendered value', () => {
		const { container, page } = createHost(28);
		let reads = 0;
		const props = Object.freeze(
			Object.defineProperty(Object.create(null) as Record<string, unknown>, 'class', {
				enumerable: true,
				get() {
					return `card-${++reads}`;
				},
			}),
		);
		const shape = Object.freeze([Object.freeze({ type: 'view', parent: -1 })]);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'mount-template', parent: null, before: null, shape, nodes: [{ id: 1, props }] },
				{ op: 'mount-template', parent: null, before: null, shape, nodes: [{ id: 2, props }] },
			]),
		).apply();
		expect(page.children.map((node) => node.classes)).toEqual(['card-1', 'card-2']);
	});

	it('routes classes, styles, datasets, CSS scopes, assets, and removals through PAPI', () => {
		const { container, driver, page } = createHost(12);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'image',
					props: {
						id: 'hero',
						class: ['card', { active: true }],
						style: { width: '20rpx', opacity: 0.5 },
						'data-index': 1,
						src: '/assets/hero.abc.png',
						placeholder: 'data:image/png;base64,AA==',
						title: 'before',
						[LYNX_CSS_SCOPE_PROP]: { cssId: 1185352, entryName: 'lazy-card' },
					},
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();

		const image = page.children[0];
		expect(image).toMatchObject({
			id: 'hero',
			classes: 'card active',
			inlineStyle: 'width:20rpx;opacity:0.5',
			cssScope: { id: 1185352, entryName: 'lazy-card' },
		});
		expect(image.dataset).toEqual({ index: 1 });
		expect(image.attributes).toEqual({
			src: '/assets/hero.abc.png',
			placeholder: 'data:image/png;base64,AA==',
			title: 'before',
		});
		expect(image.selector).toBe('r12-h1-g1');

		prepareLynxHostBatch(
			container,
			batch(2, [
				{
					op: 'update',
					id: 1,
					props: {
						className: 'plain',
						style: null,
						'data-active': null,
						src: '/assets/hero.next.png',
						[LYNX_CSS_SCOPE_PROP]: 2000000,
					},
				},
			]),
		).apply();

		expect(image.id).toBe(null);
		expect(image.classes).toBe('plain');
		expect(image.inlineStyle).toBe('');
		expect(image.dataset).toEqual({ active: null });
		expect(image.cssScope).toEqual({ id: 2000000 });
		expect(image.attributes).toEqual({ src: '/assets/hero.next.png' });
		expect(driver.updates?.classify('image', { [LYNX_CSS_SCOPE_PROP]: 2000000 }, {})).toBe(
			'recreate',
		);
		expect(() =>
			prepareLynxHostBatch(container, batch(3, [{ op: 'update', id: 1, props: {} }])),
		).toThrow(/requires a recreate command/);

		const recreated = prepareLynxHostBatch(
			container,
			batch(3, [{ op: 'recreate', id: 1, type: 'image', props: {} }]),
		);
		recreated.apply();
		const replacement = page.children[0];
		expect(replacement).not.toBe(image);
		expect(replacement.cssScope).toBe(null);
		expect(replacement.selector).toBe('r12-h1-g2');
		expect(driver.getPublicInstance(container, 1)?.generation).toBe(2);
	});

	it('keeps retained visibility separate from the authored hidden prop', () => {
		const { container, page } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { hidden: false } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const node = page.children[0];
		expect(node.attributes.hidden).toBe(false);

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'visibility', id: 1, state: 'hidden' },
				{ op: 'update', id: 1, props: { hidden: true } },
			]),
		).apply();
		expect(node.attributes.hidden).toBe(true);

		prepareLynxHostBatch(
			container,
			batch(3, [{ op: 'visibility', id: 1, state: 'visible' }]),
		).apply();
		expect(node.attributes.hidden).toBe(true);

		prepareLynxHostBatch(
			container,
			batch(4, [
				{ op: 'visibility', id: 1, state: 'hidden' },
				{ op: 'update', id: 1, props: {} },
				{ op: 'visibility', id: 1, state: 'visible' },
			]),
		).apply();
		expect(node.attributes).not.toHaveProperty('hidden');
	});

	it('leaves retained visibility on the nearest element host instead of raw text', () => {
		const { container, page } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'text', props: {} },
				{ op: 'create', id: 2, type: '#text', props: { value: 'dynamic' } },
				{ op: 'create', id: 3, type: 'raw-text', props: { text: 'authored' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: 1, id: 3, before: null },
				{ op: 'visibility', id: 1, state: 'hidden' },
				{ op: 'visibility', id: 2, state: 'hidden' },
				{ op: 'visibility', id: 3, state: 'hidden' },
			]),
		).apply();
		const parent = page.children[0]!;
		const [dynamic, authored] = parent.children;

		expect(parent.attributes.hidden).toBe(true);
		expect(dynamic.attributes).not.toHaveProperty('hidden');
		expect(authored.attributes).not.toHaveProperty('hidden');

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'visibility', id: 1, state: 'visible' },
				{ op: 'visibility', id: 2, state: 'visible' },
				{ op: 'visibility', id: 3, state: 'visible' },
			]),
		).apply();
		expect(parent.attributes).not.toHaveProperty('hidden');
		expect(dynamic.attributes).not.toHaveProperty('hidden');
		expect(authored.attributes).not.toHaveProperty('hidden');
	});

	it('binds every native event kind, avoids handler-only rebinding, and cleans stale tokens', () => {
		const { container, page, papi } = createHost(20);
		const kinds = [
			['bindtap', 'bindEvent:tap'],
			['catchtap', 'catchEvent:tap'],
			['capture-bindtap', 'capture-bind:tap'],
			['capture-catchtap', 'capture-catch:tap'],
			['global-bindtap', 'global-bindEvent:tap'],
		] as const;
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				...kinds.map(([type], index) => ({
					op: 'event' as const,
					id: 1,
					type,
					listener: { id: 101 + index, priority: 'discrete' as const },
				})),
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const first = page.children[0];
		for (const [, key] of kinds) expect(first.events.has(key)).toBe(true);
		const originalToken = first.events.get('bindEvent:tap')!;
		expect(resolveLynxHostNativeEvent(container, originalToken)).toEqual({
			listener: 101,
			priority: 'discrete',
		});

		// A re-rendered handler is a new closure with the same listener identity.
		// That must not churn the native binding.
		papi.resetCalls();
		prepareLynxHostBatch(
			container,
			batch(2, [
				{
					op: 'event',
					id: 1,
					type: 'bindtap',
					listener: { id: 101, priority: 'discrete' },
				},
			]),
		).apply();
		expect(papi.calls).not.toContain('setEvent');
		expect(first.events.get('bindEvent:tap')).toBe(originalToken);
		expect(resolveLynxHostNativeEvent(container, originalToken)?.priority).toBe('discrete');

		// The token carries the listener priority so the background thread can
		// build a valid event message from a native delivery alone, so a priority
		// change is an identity change and does rebind. The Lynx renderer derives
		// priority from the event name, so this cannot happen through the
		// compiler; it is asserted here to pin the token's identity contract.
		papi.resetCalls();
		prepareLynxHostBatch(
			container,
			batch(3, [
				{
					op: 'event',
					id: 1,
					type: 'bindtap',
					listener: { id: 101, priority: 'default' },
				},
			]),
		).apply();
		expect(papi.calls).toContain('setEvent');
		const repriced = first.events.get('bindEvent:tap')!;
		expect(repriced).not.toBe(originalToken);
		expect(resolveLynxHostNativeEvent(container, repriced)?.priority).toBe('default');
		expect(resolveLynxHostNativeEvent(container, originalToken)).toBe(null);

		prepareLynxHostBatch(
			container,
			batch(4, [{ op: 'visibility', id: 1, state: 'hidden' }]),
		).apply();
		expect(first.events.size).toBe(0);
		expect(resolveLynxHostNativeEvent(container, originalToken)).toBe(null);
		prepareLynxHostBatch(
			container,
			batch(5, [{ op: 'visibility', id: 1, state: 'visible' }]),
		).apply();
		expect(first.events.size).toBe(5);

		prepareLynxHostBatch(
			container,
			batch(6, [{ op: 'recreate', id: 1, type: 'view', props: {} }]),
		).apply();
		const replacement = page.children[0];
		expect(replacement.events.size).toBe(5);
		expect(first.events.size).toBe(0);
		expect(resolveLynxHostNativeEvent(container, originalToken)).toBe(null);
		const replacementToken = replacement.events.get('bindEvent:tap')!;
		expect(replacementToken).not.toBe(originalToken);
		expect(resolveLynxHostNativeEvent(container, replacementToken)?.listener).toBe(101);

		prepareLynxHostBatch(
			container,
			batch(7, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 1 },
			]),
		).apply();
		expect(replacement.events.size).toBe(0);
		expect(resolveLynxHostNativeEvent(container, replacementToken)).toBe(null);
	});

	it('keeps listeners isolated when neighboring hosts gain and lose native handlers', () => {
		const { container, page } = createHost(22);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'first' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'second' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: null, id: 2, before: null },
			]),
		).apply();

		const [first, second] = page.children;
		const firstToken = first.events.get('bindEvent:tap')!;
		expect(resolveLynxHostNativeEvent(container, firstToken)?.listener).toBe(101);
		expect(second.events.size).toBe(0);
		expect(getLynxHostEventListener(container, 2, 'bindtap')).toBeNull();

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'event', id: 2, type: 'bindtap', listener: { id: 202, priority: 'default' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: null },
			]),
		).apply();

		const secondToken = second.events.get('bindEvent:tap')!;
		expect(first.events.size).toBe(0);
		expect(resolveLynxHostNativeEvent(container, firstToken)).toBeNull();
		expect(resolveLynxHostNativeEvent(container, secondToken)).toEqual({
			listener: 202,
			priority: 'default',
		});
		expect(getLynxHostEventListener(container, 1, 'bindtap')).toBeNull();
	});

	it('routes main-thread worklet events and refs without background callback tokens', () => {
		const worklets = createObservedWorkletRegistry();
		const { container, page } = createHost(21, worklets);
		const firstWorklet = { _wkltId: 'card.tsrx:tap', _c: { count: 1 } };
		const secondWorklet = { _wkltId: 'card.tsrx:tap', _c: { count: 2 } };
		const ref = { _wvid: 'card:root' };
		prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: { 'main-thread:bindtap': firstWorklet, 'main-thread:ref': ref },
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const first = page.children[0]!;
		expect(first.events.get('bindEvent:tap')).toMatchObject({
			type: 'worklet',
			value: { ...firstWorklet, _owlt: expect.any(Number) },
		});
		const firstListener = first.events.get('bindEvent:tap');
		expect(worklets.isActive((firstListener as { value: { _owlt: number } }).value._owlt)).toBe(
			true,
		);
		expect(worklets.refValues.get(ref._wvid)).toBe(first);

		prepareLynxHostBatch(
			container,
			batch(2, [
				{
					op: 'update',
					id: 1,
					props: { 'main-thread:bindtap': secondWorklet, 'main-thread:ref': ref },
				},
			]),
		).apply();
		expect(first.events.get('bindEvent:tap')).toMatchObject({
			type: 'worklet',
			value: { _wkltId: 'card.tsrx:tap', _c: { count: 2 } },
		});
		expect(worklets.isActive((firstListener as { value: { _owlt: number } }).value._owlt)).toBe(
			false,
		);

		prepareLynxHostBatch(
			container,
			batch(3, [{ op: 'visibility', id: 1, state: 'hidden' }]),
		).apply();
		expect(first.events.size).toBe(0);
		expect(worklets.refValues.get(ref._wvid)).toBe(null);
		prepareLynxHostBatch(
			container,
			batch(4, [{ op: 'visibility', id: 1, state: 'visible' }]),
		).apply();
		expect(first.events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' });
		expect(worklets.refValues.get(ref._wvid)).toBe(first);

		prepareLynxHostBatch(container, batch(5, [{ op: 'remove', parent: null, id: 1 }])).apply();
		expect(first.events.size).toBe(0);
		expect(worklets.refValues.get(ref._wvid)).toBe(null);
		prepareLynxHostBatch(
			container,
			batch(6, [{ op: 'insert', parent: null, id: 1, before: null }]),
		).apply();
		expect(first.events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' });
		expect(worklets.refValues.get(ref._wvid)).toBe(first);

		prepareLynxHostBatch(
			container,
			batch(7, [
				{
					op: 'recreate',
					id: 1,
					type: 'view',
					props: { 'main-thread:bindtap': secondWorklet, 'main-thread:ref': ref },
				},
			]),
		).apply();
		const replacement = page.children[0]!;
		expect(replacement).not.toBe(first);
		expect(first.events.size).toBe(0);
		expect(replacement.events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' });
		expect(worklets.refValues.get(ref._wvid)).toBe(replacement);

		expect(disposeLynxHostContainer(container).complete).toBe(true);
		expect(replacement.events.size).toBe(0);
		expect(worklets.refValues.get(ref._wvid)).toBe(null);
	});

	it('activates main-thread props only while their subtree is root-connected', () => {
		const worklets = createObservedWorkletRegistry();
		const { container, page } = createHost(22, worklets);
		const props = (ref: string) => ({
			'main-thread:bindtap': { _wkltId: 'card.tsrx:tap', _c: { ref } },
			'main-thread:ref': { _wvid: ref },
		});
		prepareLynxHostBatch(
			container,
			batch(1, [{ op: 'create', id: 3, type: 'view', props: {} }]),
		).apply();
		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'create', id: 1, type: 'view', props: props('detached:parent') },
				{ op: 'create', id: 2, type: 'view', props: props('detached:child') },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]),
		).apply();

		expect(page.children).toEqual([]);
		expect(worklets.refValues.get('detached:parent')).toBeUndefined();
		expect(worklets.refValues.get('detached:child')).toBeUndefined();

		prepareLynxHostBatch(
			container,
			batch(3, [{ op: 'insert', parent: null, id: 1, before: null }]),
		).apply();
		const parent = page.children[0]!;
		const child = parent.children[0]!;
		expect(parent.events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' });
		expect(child.events.get('bindEvent:tap')).toMatchObject({ type: 'worklet' });
		expect(worklets.refValues.get('detached:parent')).toBe(parent);
		expect(worklets.refValues.get('detached:child')).toBe(child);

		prepareLynxHostBatch(
			container,
			batch(4, [{ op: 'move', parent: 3, id: 1, before: null }]),
		).apply();
		expect(page.children).toEqual([]);
		expect(parent.events.size).toBe(0);
		expect(child.events.size).toBe(0);
		expect(worklets.refValues.get('detached:parent')).toBe(null);
		expect(worklets.refValues.get('detached:child')).toBe(null);
	});

	it('rejects ordinary and main-thread handlers targeting the same PAPI event tuple', () => {
		const { container } = createHost(22);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(1, [
					{
						op: 'create',
						id: 1,
						type: 'view',
						props: { 'main-thread:bindtap': { _wkltId: 'card.tsrx:tap' } },
					},
					{
						op: 'event',
						id: 1,
						type: 'bindtap',
						listener: { id: 101, priority: 'discrete' },
					},
				]),
			),
		).toThrow(/conflicts with background event "bindtap"/);
	});

	it('transfers one PAPI event tuple between background and main-thread ownership', () => {
		const worklets = createLynxMainThreadWorkletRegistry();
		const { container, page } = createHost(23, worklets);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const node = page.children[0]!;
		const backgroundToken = node.events.get('bindEvent:tap')!;

		// Universal core emits prop updates before ordinary event removals.
		prepareLynxHostBatch(
			container,
			batch(2, [
				{
					op: 'update',
					id: 1,
					props: { 'main-thread:bindtap': { _wkltId: 'card.tsrx:tap' } },
				},
				{ op: 'event', id: 1, type: 'bindtap', listener: null },
			]),
		).apply();
		const mainListener = node.events.get('bindEvent:tap') as {
			readonly type: 'worklet';
			readonly value: LynxActivatedMainThreadWorklet;
		};
		expect(mainListener).toMatchObject({ type: 'worklet' });
		expect(worklets.isActive(mainListener.value)).toBe(true);
		expect(resolveLynxHostNativeEvent(container, backgroundToken)).toBe(null);

		prepareLynxHostBatch(
			container,
			batch(3, [
				{ op: 'update', id: 1, props: {} },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 202, priority: 'default' } },
			]),
		).apply();
		const nextBackgroundToken = node.events.get('bindEvent:tap')!;
		expect(typeof nextBackgroundToken).toBe('string');
		expect(nextBackgroundToken).not.toBe(backgroundToken);
		expect(worklets.isActive(mainListener.value)).toBe(false);
		expect(resolveLynxHostNativeEvent(container, nextBackgroundToken)).toEqual({
			listener: 202,
			priority: 'default',
		});
	});

	it.each(['before', 'after'] as const)(
		'cleans both event journals when a background-to-main replacement fails %s mutation',
		(timing) => {
			const registry = createLynxMainThreadWorkletRegistry();
			const activations: LynxActivatedMainThreadWorklet[] = [];
			const worklets: LynxMainThreadWorkletRegistry = Object.freeze({
				...registry,
				activate(descriptor) {
					const active = registry.activate(descriptor);
					activations.push(active);
					return active;
				},
			});
			const { container, page, papi } = createHost(24, worklets);
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'view', props: {} },
					{
						op: 'event',
						id: 1,
						type: 'bindtap',
						listener: { id: 101, priority: 'discrete' },
					},
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const node = page.children[0]!;
			const failure = new Error(`event replacement failed ${timing} mutation`);
			papi.failNext('setEvent', timing, failure);
			const prepared = prepareLynxHostBatch(
				container,
				batch(2, [
					{
						op: 'update',
						id: 1,
						props: { 'main-thread:bindtap': { _wkltId: 'card.tsrx:tap' } },
					},
					{ op: 'event', id: 1, type: 'bindtap', listener: null },
				]),
			);

			expect(() => prepared.apply()).toThrow(failure);
			expect(activations).toHaveLength(1);
			expect(registry.isActive(activations[0]!)).toBe(false);
			const cleanup = disposeLynxHostContainer(container);
			expect(cleanup.complete).toBe(true);
			expect(cleanup.errors).toEqual([]);
			expect(node.events.size).toBe(0);
			expect(registry.isActive(activations[0]!)).toBe(false);
			expect(page.children).toEqual([]);
		},
	);

	it('does not retain an empty native-event journal when worklet activation fails', () => {
		const worklets = createLynxMainThreadWorkletRegistry();
		const { container, page } = createHost(25, worklets);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'create',
					id: 1,
					type: 'view',
					props: { 'main-thread:bindtap': { _wkltId: 'missing.tsrx:tap' } },
				},
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		);

		expect(() => prepared.apply()).toThrow(/missing\.tsrx:tap is not registered/);
		expect(prepared.mutationStarted).toBe(true);
		expect(disposeLynxHostContainer(container)).toEqual({
			complete: true,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: false,
			errors: [],
		});
		expect(container.disposed).toBe(true);
		expect(page.children).toEqual([]);
	});

	it.each([
		['setAttribute', 'before'],
		['setAttribute', 'after'],
		['flush', 'before'],
		['flush', 'after'],
	] as const)(
		'invalidates direct main-thread lifetimes when accepted %s fails %s mutation',
		(method, timing) => {
			const worklets = createLynxMainThreadWorkletRegistry();
			const ref = { _wvid: `fault:${method}:${timing}` };
			const refCell = worklets.retainOwner(ref);
			const worklet = { _wkltId: 'card.tsrx:tap' };
			const { container, page, papi } = createHost(26, worklets);
			prepareLynxHostBatch(
				container,
				batch(1, [
					{
						op: 'create',
						id: 1,
						type: 'view',
						props: { 'main-thread:bindtap': worklet, 'main-thread:ref': ref },
					},
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const node = page.children[0]!;
			const listener = node.events.get('bindEvent:tap') as {
				readonly type: 'worklet';
				readonly value: LynxActivatedMainThreadWorklet;
			};
			expect(worklets.isActive(listener.value)).toBe(true);
			expect(refCell.current).toBe(node);

			const failure = new Error(`${method} failed ${timing} mutation`);
			papi.failNext(method, timing, failure);
			const prepared = prepareLynxHostBatch(
				container,
				batch(2, [
					{
						op: 'update',
						id: 1,
						props: {
							title: 'faulted',
							'main-thread:bindtap': worklet,
							'main-thread:ref': ref,
						},
					},
				]),
			);

			expect(() => prepared.apply()).toThrow(failure);
			expect(worklets.isActive(listener.value)).toBe(false);
			expect(() => worklets.runWorklet(listener.value)).toThrow(/stale or foreign/);
			expect(refCell.current).toBe(null);
			// Refs have no PAPI binding, so fault invalidation releases the host
			// retain immediately while leaving an explicit owner independently live.
			expect(() => worklets.updateRef(ref, null)).not.toThrow();
			worklets.releaseOwner(ref);
			expect(() => worklets.updateRef(ref, null)).toThrow(/stale/);
			expect(node.events.get('bindEvent:tap')).toBe(listener);

			const cleanup = disposeLynxHostContainer(container);
			expect(cleanup.complete).toBe(true);
			expect(cleanup.errors).toEqual([]);
			expect(node.events.size).toBe(0);
			expect(worklets.isActive(listener.value)).toBe(false);
			expect(page.children).toEqual([]);
		},
	);

	it('recreates a host while preserving child identity and changing only its handle generation', () => {
		const { container, driver, page, papi } = createHost(7);
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'before' } },
				{ op: 'create', id: 2, type: 'text', props: {} },
				{ op: 'create', id: 3, type: '#text', props: { value: 'survivor' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: 2, id: 3, before: null },
			]),
		).apply();
		const previous = page.children[0];
		const child = previous.children[0];
		const grandchild = child.children[0];
		const previousHandle = driver.getPublicInstance(container, 1)!;
		const childHandle = driver.getPublicInstance(container, 2)!;

		const recreate = prepareLynxHostBatch(
			container,
			batch(2, [{ op: 'recreate', id: 1, type: 'view', props: { id: 'after' } }]),
		);
		recreate.apply();

		const replacement = page.children[0];
		const replacementHandle = driver.getPublicInstance(container, 1)!;
		expect(replacement).not.toBe(previous);
		expect(replacement.id).toBe('after');
		expect(replacement.children).toEqual([child]);
		expect(child.children).toEqual([grandchild]);
		expect(driver.getPublicInstance(container, 2)).toBe(childHandle);
		expect(replacementHandle).not.toBe(previousHandle);
		expect(replacementHandle.generation).toBe(previousHandle.generation + 1);
		expect(recreate.handleDelta).toEqual([{ op: 'recreate', handle: replacementHandle }]);
		expect(papi.flushCount).toBe(2);
	});

	it('resolves same-root portal parents transactionally without mixing authored child order', () => {
		const { container, driver, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'target-a' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'ordinary-a' } },
				{ op: 'create', id: 3, type: 'view', props: { id: 'target-b' } },
				{ op: 'create', id: 4, type: 'view', props: { id: 'ordinary-b' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: null, id: 3, before: null },
				{ op: 'insert', parent: 3, id: 4, before: null },
			]),
		).apply();
		const targetA = page.children[0]!;
		const targetB = page.children[1]!;
		const portalA = portalTarget(1);
		const portalB = portalTarget(3);

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'create', id: 5, type: 'view', props: { id: 'portal-child' } },
				{ op: 'insert', parent: portalA, id: 5, before: null },
			]),
		).apply();
		const portalNode = targetA.children[1]!;
		const portalHandle = driver.getPublicInstance(container, 5);
		expect(targetA.children.map((node) => node.id)).toEqual(['ordinary-a', 'portal-child']);

		prepareLynxHostBatch(
			container,
			batch(3, [
				{ op: 'create', id: 6, type: 'view', props: { id: 'ordinary-a-late' } },
				{ op: 'insert', parent: 1, id: 6, before: null },
			]),
		).apply();
		expect(targetA.children.map((node) => node.id)).toEqual([
			'ordinary-a',
			'ordinary-a-late',
			'portal-child',
		]);
		expect(targetA.children[2]).toBe(portalNode);

		prepareLynxHostBatch(
			container,
			batch(4, [
				{ op: 'create', id: 7, type: 'view', props: { id: 'ordinary-b-late' } },
				{ op: 'insert', parent: 3, id: 7, before: null },
				{ op: 'move', parent: portalB, id: 5, before: null },
			]),
		).apply();
		expect(targetA.children.map((node) => node.id)).toEqual(['ordinary-a', 'ordinary-a-late']);
		expect(targetB.children.map((node) => node.id)).toEqual([
			'ordinary-b',
			'ordinary-b-late',
			'portal-child',
		]);
		expect(targetB.children[2]).toBe(portalNode);
		expect(driver.getPublicInstance(container, 5)).toBe(portalHandle);

		papi.resetCalls();
		const beforeTree = [targetA.children.slice(), targetB.children.slice()];
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(5, [
					{ op: 'create', id: 8, type: 'view', props: {} },
					{ op: 'insert', parent: portalTarget(3, 1, 2), id: 8, before: null },
				]),
			),
		).toThrow(/foreign root 2/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(5, [
					{ op: 'create', id: 8, type: 'view', props: {} },
					{ op: 'insert', parent: portalTarget(3, 2), id: 8, before: null },
				]),
			),
		).toThrow(/stale, detached, or unacknowledged host 3:2/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(5, [
					{ op: 'create', id: 8, type: 'view', props: {} },
					{ op: 'insert', parent: portalTarget(3, 1, 1, 72), id: 8, before: null },
				]),
			),
		).toThrow(/foreign universal root/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(5, [
					{ op: 'create', id: 8, type: 'view', props: {} },
					{ op: 'create', id: 9, type: 'view', props: {} },
					{ op: 'insert', parent: null, id: 9, before: null },
					{ op: 'insert', parent: portalTarget(9), id: 8, before: null },
				]),
			),
		).toThrow(/stale, detached, or unacknowledged host 9:1/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(5, [
					{ op: 'create', id: 8, type: 'list-item', props: { 'item-key': 'portal' } },
					{ op: 'insert', parent: portalA, id: 8, before: null },
					{ op: 'recreate', id: 8, type: 'list-item', props: { 'item-key': 'portal' } },
					{ op: 'remove', parent: portalA, id: 8 },
					{ op: 'destroy', id: 8 },
				]),
			),
		).toThrow(/<list-item> 8 must be placed directly under a <list>/);
		expect(papi.calls).toEqual([]);
		expect(targetA.children).toEqual(beforeTree[0]);
		expect(targetB.children).toEqual(beforeTree[1]);

		const ordinaryBNodes = targetB.children.slice(0, 2);
		prepareLynxHostBatch(
			container,
			batch(5, [
				{ op: 'recreate', id: 3, type: 'view', props: { id: 'target-b-recreated' } },
				{ op: 'remove', parent: portalB, id: 5 },
				{ op: 'destroy', id: 5 },
			]),
		).apply();
		const replacementTargetB = page.children[1]!;
		expect(replacementTargetB).not.toBe(targetB);
		expect(replacementTargetB.children.map((node) => node.id)).toEqual([
			'ordinary-b',
			'ordinary-b-late',
		]);
		expect(replacementTargetB.children[0]).toBe(ordinaryBNodes[0]);
		expect(replacementTargetB.children[1]).toBe(ordinaryBNodes[1]);
		expect(driver.getPublicInstance(container, 5)).toBeNull();
	});

	it('validates the complete batch before making any PAPI call', () => {
		const { container, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'create', id: 2, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
			]),
		).apply();
		papi.resetCalls();
		const beforeTree = [...page.children];

		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{ op: 'create', id: 3, type: 'view', props: { title: 'never-applied' } },
					{ op: 'insert', parent: null, id: 3, before: 999 },
				]),
			),
		).toThrow(/before host 999/);
		expect(() =>
			prepareLynxHostBatch(container, batch(2, [{ op: 'move', parent: 2, id: 1, before: null }])),
		).toThrow(/create a cycle/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{ op: 'create', id: 3, type: 'view', props: {} },
					{ op: 'insert', parent: 3, id: 3, before: null },
				]),
			),
		).toThrow(/create a cycle/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{ op: 'create', id: 3, type: 'view', props: {} },
					{ op: 'create', id: 4, type: 'view', props: {} },
					{ op: 'insert', parent: 3, id: 4, before: null },
					{ op: 'insert', parent: 4, id: 3, before: null },
				]),
			),
		).toThrow(/create a cycle/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{ op: 'create', id: 3, type: 'view', props: {} },
					{
						op: 'insert',
						parent: {
							$$kind: 'octane.universal.portal-target',
							renderer: 'lynx',
							root: 1,
							id: 'portal',
						},
						id: 3,
						before: null,
					},
				]),
			),
		).toThrow(/portal target/);
		expect(() => prepareLynxHostBatch(container, batch(2, [], 'foreign'))).toThrow(
			/renderer mismatch/,
		);
		expect(() => prepareLynxHostBatch(container, batch(1, []))).toThrow(/stale batch version/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{
						op: 'mount-template',
						parent: 1,
						before: null,
						shape: [
							{ type: 'view', parent: -1 },
							{ type: '#text', parent: 0 },
						],
						nodes: [
							{ id: 3, props: {} },
							{ id: 4, props: { value: 'invalid under view' } },
						],
					},
				]),
			),
		).toThrow(/may only be placed directly under a text host/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{
						op: 'mount-template',
						parent: 1,
						before: null,
						shape: [
							{ type: 'view', parent: -1 },
							{ type: 'view', parent: 1 },
						],
						nodes: [
							{ id: 3, props: {} },
							{ id: 4, props: {} },
						],
					},
				]),
			),
		).toThrow(/earlier template node/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{ op: 'create', id: 3, type: '#text', props: { value: 'illegal' } },
					{ op: 'insert', parent: 1, id: 3, before: null },
				]),
			),
		).toThrow(/may only be placed directly under a text host/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [
					{
						op: 'create',
						id: 3,
						type: 'view',
						props: { 'octane-ref': 'spread-overwrite' },
					},
				]),
			),
		).toThrow(/reserved for generation-scoped query handles/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [{ op: 'event', id: 1, type: 'tap', listener: { id: 1, priority: 'discrete' } }]),
			),
		).toThrow(/not a Lynx event prop/);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [{ op: 'lifecycle', id: 1, type: 'mount', listener: { id: 1 } }]),
			),
		).toThrow(/lifecycle commands are not supported/);

		expect(papi.calls).toEqual([]);
		expect(papi.flushCount).toBe(1);
		expect(page.children).toEqual(beforeTree);
		expect(container.acceptedVersion).toBe(1);
		expect(container.instanceCount).toBe(2);
	});

	it('aborts preparation idempotently without allocating or flushing PAPI nodes', () => {
		const { container, page, papi } = createHost();
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'aborted' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		);
		prepared.abort();
		prepared.abort();
		prepared.apply();

		expect(prepared.mutationStarted).toBe(false);
		expect(page.children).toEqual([]);
		expect(container.acceptedVersion).toBe(0);
		expect(container.instanceCount).toBe(0);
		expect(papi.calls).toEqual([]);
		expect(papi.flushCount).toBe(0);
	});

	it('abandons a prepared host template without creating or attaching native elements', () => {
		const { container, page, papi } = createHost(29);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template',
					parent: null,
					before: null,
					shape: [
						{ type: 'view', parent: -1 },
						{ type: 'view', parent: 0 },
					],
					nodes: [
						{ id: 1, props: { id: 'aborted' } },
						{ id: 2, props: {} },
					],
				},
			]),
		);
		prepared.abort();
		prepared.apply();
		expect(prepared.mutationStarted).toBe(false);
		expect(page.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(papi.calls).toEqual([]);
	});

	it('keeps compact first mounts queryable and reconstructs immutable legacy deltas on demand', () => {
		const { container, driver, page } = createHost(33);
		const shape = Object.freeze([Object.freeze({ type: 'view', parent: -1 })]);
		const commands: UniversalHostCommand[] = Array.from({ length: 16 }, (_, index) => ({
			op: 'mount-template',
			parent: null,
			before: null,
			shape,
			nodes: [{ id: index + 1, props: { id: `entry-${index + 1}` } }],
		}));
		const prepared = prepareLynxHostBatch(container, batch(1, commands), { compact: true });
		expect(prepared.compactHostCount).toBe(16);
		prepared.apply();

		expect(page.children).toHaveLength(16);
		expect(driver.getPublicInstance(container, 16)).toMatchObject({
			root: 33,
			id: 16,
			generation: 1,
		});
		const deltas = prepared.handleDelta;
		expect(deltas).toHaveLength(16);
		expect(deltas.every((delta) => delta.op === 'create')).toBe(true);
		expect(Object.isFrozen(deltas)).toBe(true);
		expect(prepared.handleDelta).toBe(deltas);
	});

	it('counts implicit program hosts for compact acknowledgements without losing native listeners', () => {
		const { container, page } = createHost(37);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({ type: 'view', parent: -1, props: Object.freeze({ class: 'row' }) }),
				Object.freeze({ type: 'view', parent: 0, props: Object.freeze({ class: 'action' }) }),
			]),
			events: Object.freeze([
				Object.freeze({ node: 1, type: 'bindtap', priority: 'discrete' as const }),
			]),
		});
		const commands: UniversalHostCommand[] = Array.from({ length: 8 }, (_, index) => ({
			op: 'mount-template-range',
			parent: null,
			before: null,
			program,
			firstId: index * 2 + 1,
			values: [],
			firstListenerId: 100 + index,
		}));
		const prepared = prepareLynxHostBatch(container, batch(1, commands), { compact: true });
		expect(prepared.compactHostCount).toBe(16);
		prepared.apply();
		expect(page.children).toHaveLength(8);
		expect(page.children.at(-1)!.children[0]!.classes).toBe('action');
		expect(
			resolveLynxHostNativeEvent(
				container,
				page.children.at(-1)!.children[0]!.events.get('bindEvent:tap')!,
			),
		).toEqual({ listener: 107, priority: 'discrete' });
		expect(prepared.handleDelta).toHaveLength(16);
	});

	it('mounts a dense program run before an existing sibling with sparse public instances and events', () => {
		const { container, driver, page, papi } = createHost(43);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({
					type: 'view',
					parent: -1,
					props: Object.freeze({}),
					bindings: Object.freeze([
						Object.freeze({ name: 'class', valueIndex: 0 }),
						Object.freeze({ name: 'id', valueIndex: 1 }),
					]),
				}),
				Object.freeze({ type: 'text', parent: 0, props: Object.freeze({ class: 'label' }) }),
				Object.freeze({
					type: '#text',
					parent: 1,
					props: Object.freeze({}),
					bindings: Object.freeze([Object.freeze({ name: 'value', valueIndex: 2 })]),
				}),
				Object.freeze({ type: 'view', parent: 0, props: Object.freeze({ class: 'action' }) }),
			]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
				Object.freeze({ node: 3, type: 'catchtap', priority: 'discrete' as const }),
			]),
		});
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'shell' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'create', id: 2, type: 'view', props: { id: 'anchor' } },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{
					op: 'mount-template-run',
					parent: 1,
					before: 2,
					program,
					firstId: 10,
					firstListenerId: 700,
					count: 3,
					values: Object.freeze([
						'first',
						'row-1',
						'One',
						'second',
						'row-2',
						'Two',
						'third',
						'row-3',
						'Three',
					]),
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		);
		expect(prepared.compactHostCount).toBe(14);
		prepared.apply();

		const shell = page.children[0]!;
		expect(shell.children.map((child) => child.id)).toEqual(['row-1', 'row-2', 'row-3', 'anchor']);
		expect(shell.children[0]!.children[0]!.children[0]!.text).toBe('One');
		expect(shell.children[1]!.children[0]!.children[0]!.text).toBe('Two');
		expect(shell.children[2]!.children[0]!.children[0]!.text).toBe('Three');
		expect(shell.children[0]!.selector).toBe('');
		expect(shell.children[1]!.children[1]!.selector).toBe('');
		expect(shell.children[3]!.selector).toBe('r43-h2-g1');

		const secondRootListener = shell.children[1]!.events.get('bindEvent:tap')!;
		expect(resolveLynxHostNativeEvent(container, secondRootListener)).toEqual({
			listener: 702,
			priority: 'default',
		});
		expect(
			resolveLynxHostNativeEvent(
				container,
				shell.children[2]!.children[1]!.events.get('catchEvent:tap')!,
			),
		).toEqual({ listener: 705, priority: 'discrete' });
		expect(getLynxHostEventListener(container, 21, 'catchtap')).toEqual({
			id: 705,
			priority: 'discrete',
		});

		papi.resetCalls();
		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'update', id: 16, props: { value: 'Updated' } },
				{
					op: 'event',
					id: 14,
					type: 'bindtap',
					listener: { id: 900, priority: 'continuous' },
				},
				{ op: 'ensure-public-instance', id: 21 },
			]),
		).apply();
		expect(shell.children[1]!.children[0]!.children[0]!.text).toBe('Updated');
		expect(resolveLynxHostNativeEvent(container, secondRootListener)).toBeNull();
		expect(
			resolveLynxHostNativeEvent(container, shell.children[1]!.events.get('bindEvent:tap')!),
		).toEqual({ listener: 900, priority: 'continuous' });
		expect(shell.children[2]!.children[1]!.selector).toBe('r43-h21-g1');
		expect(papi.calls.filter((call) => call === 'setRefSelector')).toHaveLength(1);
		expect(driver.getPublicInstance(container, 21)).toMatchObject({ id: 21, generation: 1 });
		expect(prepared.handleDelta).toHaveLength(14);
	});

	it('rejects unsafe program runs before entering the Element PAPI', () => {
		const { container, page, papi } = createHost(44);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({
					type: 'view',
					parent: -1,
					props: Object.freeze({}),
					bindings: Object.freeze([Object.freeze({ name: 'id', valueIndex: 0 })]),
				}),
			]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
			]),
		});
		const command = {
			op: 'mount-template-run' as const,
			parent: null,
			before: null,
			program,
			firstId: 1,
			firstListenerId: 90,
			count: 2,
			values: ['one', 'two'],
		};
		for (const invalid of [
			{ ...command, count: 0 },
			{ ...command, count: Number.MAX_SAFE_INTEGER },
			{ ...command, firstId: Number.MAX_SAFE_INTEGER },
			{ ...command, firstListenerId: Number.MAX_SAFE_INTEGER },
			{ ...command, firstListenerId: null },
			{ ...command, values: ['one'] },
			{ ...command, values: ['one', {}] },
		]) {
			expect(
				() => prepareLynxHostBatch(container, batch(1, [invalid as never])),
				JSON.stringify(invalid),
			).toThrow();
		}
		expect(page.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(papi.calls).toEqual([]);
	});

	it('hydrates dense run hosts sparsely across trailing shell attachment, updates, teardown, and reuse', () => {
		const { container, driver, page, papi } = createHost(46);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({
					type: 'view',
					parent: -1,
					props: Object.freeze({}),
					bindings: Object.freeze([
						Object.freeze({ name: 'class', valueIndex: 0 }),
						Object.freeze({ name: 'id', valueIndex: 1 }),
					]),
				}),
				Object.freeze({ type: 'text', parent: 0, props: Object.freeze({ class: 'label' }) }),
				Object.freeze({
					type: '#text',
					parent: 1,
					props: Object.freeze({}),
					bindings: Object.freeze([Object.freeze({ name: 'value', valueIndex: 2 })]),
				}),
				Object.freeze({ type: 'view', parent: 0, props: Object.freeze({ class: 'action' }) }),
			]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
				Object.freeze({ node: 3, type: 'catchtap', priority: 'discrete' as const }),
			]),
		});
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'shell' } },
				{ op: 'create', id: 2, type: 'view', props: { id: 'table' } },
				{
					op: 'mount-template-run',
					parent: 2,
					before: null,
					program,
					firstId: 10,
					firstListenerId: 800,
					count: 3,
					values: Object.freeze([
						'first',
						'row-1',
						'One',
						'second',
						'row-2',
						'Two',
						'third',
						'row-3',
						'Three',
					]),
				},
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
			{ compact: true, lazyPublicInstances: true },
		);
		expect(prepared.compactHostCount).toBe(14);
		prepared.apply();
		expect(container.instanceCount).toBe(14);
		const table = page.children[0]!.children[0]!;
		expect(table.children.map((node) => node.id)).toEqual(['row-1', 'row-2', 'row-3']);
		expect(table.children[1]!.classes).toBe('second');
		expect(table.children[1]!.children[0]!.children[0]!.text).toBe('Two');
		expect(table.children[1]!.selector).toBe('');
		const previous = table.children[1]!.events.get('bindEvent:tap')!;
		expect(resolveLynxHostNativeEvent(container, previous)).toEqual({
			listener: 802,
			priority: 'default',
		});

		papi.resetCalls();
		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'update', id: 14, props: { class: 'selected', id: 'row-2' } },
				{ op: 'update', id: 16, props: { value: 'Changed' } },
				{
					op: 'event',
					id: 14,
					type: 'bindtap',
					listener: { id: 990, priority: 'continuous' },
				},
				{ op: 'ensure-public-instance', id: 21 },
			]),
		).apply();
		expect(table.children[1]!.classes).toBe('selected');
		expect(table.children[1]!.children[0]!.children[0]!.text).toBe('Changed');
		expect(resolveLynxHostNativeEvent(container, previous)).toBeNull();
		expect(
			resolveLynxHostNativeEvent(container, table.children[1]!.events.get('bindEvent:tap')!),
		).toEqual({ listener: 990, priority: 'continuous' });
		expect(table.children[2]!.children[1]!.selector).toBe('r46-h21-g1');
		expect(papi.calls.filter((call) => call === 'setRefSelector')).toHaveLength(1);

		const retired = table.children[1]!.events.get('bindEvent:tap')!;
		prepareLynxHostBatch(
			container,
			batch(3, [
				{ op: 'remove', parent: 2, id: 14 },
				{ op: 'destroy', id: 16 },
				{ op: 'destroy', id: 15 },
				{ op: 'destroy', id: 17 },
				{ op: 'destroy', id: 14 },
			]),
		).apply();
		expect(container.instanceCount).toBe(10);
		expect(table.children.map((node) => node.id)).toEqual(['row-1', 'row-3']);
		expect(resolveLynxHostNativeEvent(container, retired)).toBeNull();

		prepareLynxHostBatch(
			container,
			batch(4, [
				{ op: 'create', id: 14, type: 'view', props: { id: 'replacement' } },
				{ op: 'insert', parent: 2, id: 14, before: 18 },
			]),
		).apply();
		expect(container.instanceCount).toBe(11);
		expect(table.children.map((node) => node.id)).toEqual(['row-1', 'replacement', 'row-3']);
		expect(driver.getPublicInstance(container, 14)?.generation).toBe(2);
		expect(disposeLynxHostContainer(container).complete).toBe(true);
		expect(page.children).toEqual([]);
	});

	it('snapshots mutable run values before a caller can replace validated text between prepare and apply', () => {
		const { container, page } = createHost(47);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({
					type: 'view',
					parent: -1,
					props: Object.freeze({}),
					bindings: Object.freeze([
						Object.freeze({ name: 'class', valueIndex: 0 }),
						Object.freeze({ name: 'id', valueIndex: 1 }),
					]),
				}),
				Object.freeze({ type: 'text', parent: 0, props: Object.freeze({}) }),
				Object.freeze({
					type: '#text',
					parent: 1,
					props: Object.freeze({}),
					bindings: Object.freeze([Object.freeze({ name: 'value', valueIndex: 2 })]),
				}),
			]),
			events: Object.freeze([]),
		});
		const values: Array<string | number> = ['accepted-class', 'accepted-id', 'Accepted'];
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template-run',
					parent: null,
					before: null,
					program,
					firstId: 1,
					firstListenerId: null,
					count: 1,
					values,
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		);
		values[0] = 'tampered-class';
		values[1] = 'tampered-id';
		values[2] = 42;
		prepared.apply();
		expect(page.children[0]).toMatchObject({ classes: 'accepted-class', id: 'accepted-id' });
		expect(page.children[0]!.children[0]!.children[0]!.text).toBe('Accepted');
	});

	it('retains pre-journaled run listeners for cleanup when native event installation mutates then fails', () => {
		const { container, page, papi } = createHost(45);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([Object.freeze({ type: 'view', parent: -1, props: Object.freeze({}) })]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
			]),
		});
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template-run',
					parent: null,
					before: null,
					program,
					firstId: 1,
					firstListenerId: 301,
					count: 2,
					values: Object.freeze([]),
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		);
		const failure = new Error('run event installation mutated then failed');
		papi.failNext('setEvent', 'after', failure);
		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.mutationStarted).toBe(true);
		expect(container.acceptedVersion).toBe(1);
		expect(prepared.handleDelta).toHaveLength(2);
		expect(page.children).toEqual([]);
		expect(disposeLynxHostContainer(container).complete).toBe(true);
		expect(container.disposed).toBe(true);
	});

	it('installs only requested public-instance selectors for negotiated compact program hosts', () => {
		const { container, driver, page, papi } = createHost(38);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([
				Object.freeze({ type: 'view', parent: -1, props: Object.freeze({ class: 'row' }) }),
				Object.freeze({ type: 'view', parent: 0, props: Object.freeze({ class: 'action' }) }),
				Object.freeze({ type: 'text', parent: 0, props: Object.freeze({}) }),
				Object.freeze({ type: '#text', parent: 2, props: Object.freeze({ value: 'ready' }) }),
			]),
			events: Object.freeze([]),
		});
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'shell' } },
				{ op: 'insert', id: 1, parent: null, before: null },
				{
					op: 'mount-template-range',
					parent: 1,
					before: null,
					program,
					firstId: 2,
					values: [],
					firstListenerId: null,
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		);
		expect(prepared.compactHostCount).toBe(5);
		prepared.apply();

		const shell = page.children[0]!;
		const row = shell.children[0]!;
		const action = row.children[0]!;
		const text = row.children[1]!;
		expect(shell.selector).toBe('r38-h1-g1');
		expect(row.selector).toBe('');
		expect(action.selector).toBe('');
		expect(text.selector).toBe('');
		expect(text.children[0]!.text).toBe('ready');

		papi.resetCalls();
		const publicHandle = driver.getPublicInstance(container, 3);
		expect(publicHandle).toMatchObject({
			id: 3,
			generation: 1,
			selector: '[octane-ref=r38-h3-g1]',
		});
		expect(Object.isFrozen(publicHandle)).toBe(true);
		expect(Object.keys(publicHandle!)).toEqual([
			'$$kind',
			'renderer',
			'root',
			'id',
			'type',
			'generation',
			'selector',
		]);
		expect(action.selector).toBe('r38-h3-g1');
		expect(row.selector).toBe('');
		expect(text.selector).toBe('');
		expect(papi.calls).toEqual(['setRefSelector']);
		expect(driver.getPublicInstance(container, 3)).toBe(publicHandle);
		expect(papi.calls).toEqual(['setRefSelector']);

		papi.resetCalls();
		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'ensure-public-instance', id: 2 },
				{ op: 'ensure-public-instance', id: 2 },
				{ op: 'ensure-public-instance', id: 5 },
			]),
		).apply();
		expect(row.selector).toBe('r38-h2-g1');
		expect(text.selector).toBe('');
		expect(papi.calls.filter((call) => call === 'setRefSelector')).toEqual(['setRefSelector']);
	});

	it('keeps program selectors eager unless a safe compact mount explicitly negotiates laziness', () => {
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([Object.freeze({ type: 'view', parent: -1, props: Object.freeze({}) })]),
			events: Object.freeze([]),
		});
		const command: UniversalHostCommand = {
			op: 'mount-template-range',
			parent: null,
			before: null,
			program,
			firstId: 1,
			values: [],
			firstListenerId: null,
		};
		for (const options of [undefined, { compact: true }, { lazyPublicInstances: true }]) {
			const { container, page } = createHost(39);
			prepareLynxHostBatch(container, batch(1, [command]), options).apply();
			expect(page.children[0]!.selector).toBe('r39-h1-g1');
		}

		const { container, page, papi } = createHost(40);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [command, { op: 'ensure-public-instance', id: 1 }]),
			{ compact: true, lazyPublicInstances: true },
		);
		expect(prepared.compactHostCount).toBeUndefined();
		prepared.apply();
		expect(page.children[0]!.selector).toBe('r40-h1-g1');
		expect(papi.calls.filter((call) => call === 'setRefSelector')).toHaveLength(1);

		papi.resetCalls();
		expect(() =>
			prepareLynxHostBatch(container, batch(2, [{ op: 'ensure-public-instance', id: 99 }])),
		).toThrow(/unknown public instance target 99/);
		expect(papi.calls).toEqual([]);
	});

	it('preserves compact generation tombstones across destroy, identity reuse, and recreation', () => {
		const { container, driver, page } = createHost(41);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([Object.freeze({ type: 'view', parent: -1, props: Object.freeze({}) })]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
			]),
		});
		prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template-range',
					parent: null,
					before: null,
					program,
					firstId: 1,
					values: [],
					firstListenerId: 501,
				},
				{
					op: 'mount-template-range',
					parent: null,
					before: null,
					program,
					firstId: 2,
					values: [],
					firstListenerId: 502,
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		).apply();
		const retiredListener = page.children[0]!.events.get('bindEvent:tap')!;

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 1 },
			]),
		).apply();
		expect(resolveLynxHostNativeEvent(container, retiredListener)).toBeNull();
		prepareLynxHostBatch(
			container,
			batch(3, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'replacement' } },
				{ op: 'event', id: 1, type: 'bindtap', listener: { id: 601, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		expect(driver.getPublicInstance(container, 1)?.generation).toBe(2);
		expect(resolveLynxHostNativeEvent(container, retiredListener)).toBeNull();
		expect(
			resolveLynxHostNativeEvent(container, page.children[1]!.events.get('bindEvent:tap')!),
		).toEqual({ listener: 601, priority: 'discrete' });

		prepareLynxHostBatch(
			container,
			batch(4, [{ op: 'recreate', id: 2, type: 'view', props: { id: 'recreated' } }]),
		).apply();
		expect(driver.getPublicInstance(container, 2)?.generation).toBe(2);
		expect(driver.getPublicInstance(container, 1)?.generation).toBe(2);
	});

	it('treats a deferred selector installation failure as an accepted, cleanable host fault', () => {
		const { container, page, papi } = createHost(42);
		const program: UniversalHostTemplateProgram = Object.freeze({
			nodes: Object.freeze([Object.freeze({ type: 'view', parent: -1, props: Object.freeze({}) })]),
			events: Object.freeze([
				Object.freeze({ node: 0, type: 'bindtap', priority: 'default' as const }),
			]),
		});
		prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template-range',
					parent: null,
					before: null,
					program,
					firstId: 1,
					values: [],
					firstListenerId: 701,
				},
			]),
			{ compact: true, lazyPublicInstances: true },
		).apply();
		const node = page.children[0]!;
		expect(node.selector).toBe('');
		const failure = new Error('deferred selector mutated then failed');
		papi.failNext('setRefSelector', 'after', failure);
		const prepared = prepareLynxHostBatch(
			container,
			batch(2, [{ op: 'ensure-public-instance', id: 1 }]),
		);
		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.mutationStarted).toBe(true);
		expect(container.acceptedVersion).toBe(2);
		expect(node.selector).toBe('r42-h1-g1');
		expect(node.events.size).toBe(1);
		expect(disposeLynxHostContainer(container).complete).toBe(true);
		expect(node.events.size).toBe(0);
		expect(page.children).toEqual([]);
	});

	it('retains every legacy handle when a negotiated compact mount faults after acceptance', () => {
		const { container, page, papi } = createHost(34);
		const shape = Object.freeze([Object.freeze({ type: 'view', parent: -1 })]);
		const commands: UniversalHostCommand[] = Array.from({ length: 16 }, (_, index) => ({
			op: 'mount-template',
			parent: null,
			before: null,
			shape,
			nodes: [{ id: index + 1, props: { id: `partial-${index + 1}` } }],
		}));
		const prepared = prepareLynxHostBatch(container, batch(1, commands), { compact: true });
		const failure = new Error('compact template insertion mutated then failed');
		papi.failNext('insertBefore', 'after', failure);

		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.compactHostCount).toBe(16);
		expect(prepared.handleDelta).toHaveLength(16);
		expect(prepared.handleDelta.at(-1)).toMatchObject({
			op: 'create',
			handle: { root: 34, id: 16, generation: 1 },
		});
		expect(page.children).toHaveLength(1);
		expect(disposeLynxHostContainer(container).complete).toBe(true);
		expect(page.children).toEqual([]);
	});

	it('releases template-owned listeners and page roots after a partially applied native fault', () => {
		const { container, page, papi } = createHost(30);
		const failure = new Error('template insertion mutated then failed');
		papi.failNext('insertBefore', 'after', failure);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{
					op: 'mount-template',
					parent: null,
					before: null,
					shape: [{ type: 'view', parent: -1 }],
					nodes: [
						{
							id: 1,
							props: { id: 'partial-template' },
							events: [{ type: 'bindtap', listener: { id: 701, priority: 'discrete' } }],
						},
					],
				},
			]),
		);

		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.mutationStarted).toBe(true);
		const partial = page.children[0]!;
		expect(partial.id).toBe('partial-template');
		expect(partial.events.size).toBe(1);
		expect(container.acceptedVersion).toBe(1);

		const cleanup = disposeLynxHostContainer(container);
		expect(cleanup.complete).toBe(true);
		expect(cleanup.removedRoots).toBe(1);
		expect(partial.events.size).toBe(0);
		expect(page.children).toEqual([]);
		expect(container.disposed).toBe(true);
	});

	it('retains an attached node for idempotent terminal cleanup when a mutation throws', () => {
		const { container, page, papi } = createHost();
		const failure = new Error('insert mutated then failed');
		papi.failNext('insertBefore', 'after', failure);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'partial' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		);

		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.mutationStarted).toBe(true);
		expect(prepared.handleDelta).toHaveLength(1);
		expect(page.children).toHaveLength(1);
		expect(container.acceptedVersion).toBe(1);
		expect(papi.flushCount).toBe(1);
		expect(() =>
			prepareLynxHostBatch(container, batch(2, [{ op: 'update', id: 1, props: {} }])),
		).toThrow(/after a host fault/);
		expect(() => prepareLynxHostBatch(container, batch(2, []))).toThrow(
			/post-fault teardown must remove every remaining host/,
		);
		expect(() =>
			prepareLynxHostBatch(
				container,
				batch(2, [{ op: 'event', id: 1, type: 'bindtap', listener: null }]),
			),
		).toThrow(/post-fault teardown must remove every remaining host/);

		papi.resetCalls();
		const teardown = prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 1 },
			]),
		);
		teardown.apply();
		expect(teardown.handleDelta).toEqual([
			{
				op: 'destroy',
				renderer: 'lynx',
				root: 1,
				id: 1,
				generation: 1,
			},
		]);
		expect(papi.calls).toEqual([]);
		expect(container.acceptedVersion).toBe(2);
		expect(container.instanceCount).toBe(0);
		expect(page.children).toHaveLength(1);

		const cleanup = disposeLynxHostContainer(container);
		expect(cleanup).toEqual({
			complete: true,
			removedRoots: 1,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(page.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(container.disposed).toBe(true);
		expect(papi.flushCount).toBe(2);
		expect(disposeLynxHostContainer(container)).toEqual({
			complete: true,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: false,
			errors: [],
		});
		expect(papi.flushCount).toBe(2);
	});

	it('exposes the accepted boundary and cleanup journal when the single flush throws', () => {
		const { container, page, papi } = createHost();
		const failure = new Error('flush failed');
		papi.failNext('flush', 'after', failure);
		const prepared = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		);

		expect(() => prepared.apply()).toThrow(failure);
		expect(prepared.mutationStarted).toBe(true);
		expect(container.acceptedVersion).toBe(1);
		expect(page.children).toHaveLength(1);
		expect(papi.flushCount).toBe(1);

		const cleanup = disposeLynxHostContainer(container);
		expect(cleanup).toEqual({
			complete: true,
			removedRoots: 1,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(page.children).toEqual([]);
		expect(papi.flushCount).toBe(2);
	});

	it('retains ownership and retries cleanup when native root removal fails before mutation', () => {
		const { container, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'retry' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const failure = new Error('remove failed before mutation');
		papi.failNext('remove', 'before', failure);

		const first = disposeLynxHostContainer(container);
		expect(first).toEqual({
			complete: false,
			removedRoots: 0,
			remainingRoots: 1,
			flushed: false,
			errors: [failure],
		});
		expect(page.children).toHaveLength(1);
		expect(container.instanceCount).toBe(1);
		expect(container.disposed).toBe(false);
		expect(() => prepareLynxHostBatch(container, batch(2, []))).toThrow(/root cleanup is pending/);

		const retry = disposeLynxHostContainer(container);
		expect(retry).toEqual({
			complete: true,
			removedRoots: 1,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(page.children).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(container.disposed).toBe(true);
	});

	it.each([
		['root', 'before', false],
		['root', 'after', true],
		['child', 'before', false],
		['child', 'after', true],
	] as const)(
		'handles external %s removal faults %s mutation without losing retry ownership',
		(scope, timing, completesImmediately) => {
			const { container, page, papi } = createHost();
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'view', props: { id: 'root' } },
					{ op: 'create', id: 2, type: 'view', props: { id: 'child' } },
					{ op: 'insert', parent: null, id: 1, before: null },
					{ op: 'insert', parent: 1, id: 2, before: null },
				]),
			).apply();
			const root = page.children[0]!;
			const child = root.children[0]!;
			const external = papi.createElement('view', page.uid, '');
			papi.insertBefore(page, external, null);
			if (scope === 'root') {
				papi.insertBefore(external, root, null);
			} else {
				papi.insertBefore(external, child, null);
				papi.remove(page, root);
			}
			const failure = new Error(`external ${scope} removal failed ${timing} mutation`);
			papi.failNext('remove', timing, failure);

			const first = disposeLynxHostContainer(container);
			expect(first.complete).toBe(completesImmediately);
			expect(first.remainingRoots).toBe(completesImmediately ? 0 : 1);
			expect(first.errors).toEqual(completesImmediately ? [] : [failure]);
			expect(container.disposed).toBe(completesImmediately);
			expect(external.children).toHaveLength(completesImmediately ? 0 : 1);

			if (!completesImmediately) {
				const retry = disposeLynxHostContainer(container);
				expect(retry.complete).toBe(true);
				expect(retry.remainingRoots).toBe(0);
				expect(retry.errors).toEqual([]);
				expect(container.disposed).toBe(true);
				expect(external.children).toEqual([]);
			}
		},
	);

	it.each(['before', 'after'] as const)(
		'retains ownership when native parentage cannot be resolved %s inspection',
		(timing) => {
			const { container, page, papi } = createHost();
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'view', props: { id: 'retry-parent' } },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const failure = new Error('parent inspection failed');
			papi.failNext('getParent', timing, failure);

			expect(disposeLynxHostContainer(container)).toEqual({
				complete: false,
				removedRoots: 0,
				remainingRoots: 1,
				flushed: false,
				errors: [failure],
			});
			expect(page.children).toHaveLength(1);
			expect(container.disposed).toBe(false);

			expect(disposeLynxHostContainer(container)).toEqual({
				complete: true,
				removedRoots: 1,
				remainingRoots: 0,
				flushed: true,
				errors: [],
			});
			expect(page.children).toHaveLength(0);
			expect(container.disposed).toBe(true);
		},
	);

	it('completes cleanup when parent inspection proves a throwing removal detached the root', () => {
		const { container, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		papi.failNext('remove', 'after', new Error('remove failed after mutation'));

		expect(disposeLynxHostContainer(container)).toEqual({
			complete: true,
			removedRoots: 1,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(page.children).toHaveLength(0);
		expect(container.disposed).toBe(true);
	});

	it('retries the cleanup flush before releasing retained logical state', () => {
		const { container, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const failure = new Error('cleanup flush failed');
		papi.failNext('flush', 'before', failure);

		expect(disposeLynxHostContainer(container)).toEqual({
			complete: false,
			removedRoots: 1,
			remainingRoots: 0,
			flushed: false,
			errors: [failure],
		});
		expect(page.children).toHaveLength(0);
		expect(container.instanceCount).toBe(1);
		expect(container.disposed).toBe(false);

		expect(disposeLynxHostContainer(container)).toEqual({
			complete: true,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(container.instanceCount).toBe(0);
		expect(container.disposed).toBe(true);
	});

	it('persists a failed final-batch flush until terminal cleanup can flush successfully', () => {
		const { container, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const acceptedFailure = new Error('accepted final flush failed');
		papi.failNext('flush', 'before', acceptedFailure);
		const teardown = prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 1 },
			]),
		);

		expect(() => teardown.apply()).toThrow(acceptedFailure);
		expect(teardown.mutationStarted).toBe(true);
		expect(page.children).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(container.acceptedVersion).toBe(2);
		const retryFailure = new Error('terminal retry flush failed');
		papi.failNext('flush', 'before', retryFailure);

		expect(disposeLynxHostContainer(container)).toEqual({
			complete: false,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: false,
			errors: [retryFailure],
		});
		expect(container.disposed).toBe(false);
		expect(disposeLynxHostContainer(container)).toEqual({
			complete: true,
			removedRoots: 0,
			remainingRoots: 0,
			flushed: true,
			errors: [],
		});
		expect(container.disposed).toBe(true);
		expect(papi.flushCount).toBe(2);
	});

	it('releases native ownership for every host in a removed subtree', () => {
		const NativeSet = globalThis.Set;
		const released: FakeNode[] = [];
		class ObservedSet<Value> extends NativeSet<Value> {
			delete(value: Value): boolean {
				if (value !== null && typeof value === 'object' && 'uid' in value) {
					released.push(value as FakeNode);
				}
				return super.delete(value);
			}
		}
		let host: ReturnType<typeof createHost> | undefined;
		try {
			globalThis.Set = ObservedSet as SetConstructor;
			host = createHost();
		} finally {
			globalThis.Set = NativeSet;
		}
		const { container, page } = host!;
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'create', id: 2, type: 'view', props: {} },
				{ op: 'create', id: 3, type: 'text', props: {} },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: 2, id: 3, before: null },
			]),
		).apply();
		const rootNode = page.children[0];
		const childNode = rootNode.children[0];
		const grandchildNode = childNode.children[0];
		const expectedUids = [rootNode.uid, childNode.uid, grandchildNode.uid];
		released.length = 0;

		prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'remove', parent: null, id: 1 },
				{ op: 'destroy', id: 3 },
				{ op: 'destroy', id: 2 },
				{ op: 'destroy', id: 1 },
			]),
		).apply();

		const releasedUids = new Set(released.map((node) => node.uid));
		for (const uid of expectedUids) expect(releasedUids.has(uid)).toBe(true);
		expect(container.instanceCount).toBe(0);
	});

	it('stages a small update without copying root-wide maps', () => {
		const { container, driver, page } = createHost();
		const hostCount = 128;
		const commands: UniversalHostCommand[] = [];
		for (let id = 1; id <= hostCount; id++) {
			commands.push({ op: 'create', id, type: 'view', props: { id: `item-${id}` } });
			commands.push({ op: 'insert', parent: null, id, before: null });
		}
		prepareLynxHostBatch(container, batch(1, commands)).apply();
		const untouchedHandle = driver.getPublicInstance(container, hostCount);

		const NativeMap = globalThis.Map;
		let copiedEntries = 0;
		class ObservedMap<Key, Value> extends NativeMap<Key, Value> {
			constructor(entries?: readonly (readonly [Key, Value])[] | null) {
				super(entries);
				if (entries instanceof NativeMap) copiedEntries += entries.size;
			}
		}
		let prepared;
		try {
			globalThis.Map = ObservedMap as MapConstructor;
			prepared = prepareLynxHostBatch(
				container,
				batch(2, [{ op: 'update', id: 1, props: { id: 'updated' } }]),
			);
		} finally {
			globalThis.Map = NativeMap;
		}

		// A touched-record strategy may copy a bounded amount of local metadata,
		// but work must not scale with the 128-host accepted tree.
		expect(copiedEntries).toBeLessThan(hostCount / 8);
		prepared!.apply();
		expect(page.children[0].id).toBe('updated');
		expect(driver.getPublicInstance(container, hostCount)).toBe(untouchedHandle);
	});

	it('normalizes multiple handle transitions for one logical ID', () => {
		const { container, driver, page, papi } = createHost();
		prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'first' } },
				{ op: 'insert', parent: null, id: 1, before: null },
			]),
		).apply();
		const firstHandle = driver.getPublicInstance(container, 1)!;

		const repeatedRecreate = prepareLynxHostBatch(
			container,
			batch(2, [
				{ op: 'recreate', id: 1, type: 'view', props: { id: 'second' } },
				{ op: 'recreate', id: 1, type: 'view', props: { id: 'third' } },
			]),
		);
		expect(repeatedRecreate.handleDelta).toHaveLength(1);
		repeatedRecreate.apply();
		const finalHandle = driver.getPublicInstance(container, 1)!;
		expect(repeatedRecreate.handleDelta).toEqual([{ op: 'recreate', handle: finalHandle }]);
		expect(finalHandle.generation).toBe(firstHandle.generation + 2);
		expect(page.children[0].id).toBe('third');

		const transient = prepareLynxHostBatch(
			container,
			batch(3, [
				{ op: 'create', id: 2, type: 'view', props: {} },
				{ op: 'destroy', id: 2 },
			]),
		);
		expect(transient.handleDelta).toEqual([]);
		transient.apply();
		expect(driver.getPublicInstance(container, 2)).toBe(null);
		expect(container.instanceCount).toBe(1);
		expect(papi.flushCount).toBe(3);
	});
});
