import type { UniversalHostBatch, UniversalHostCommand } from 'octane/universal/native';
import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	createLynxHostContainer,
	createLynxHostDriver,
	disposeLynxHostContainer,
	getLynxHostEventListener,
	prepareLynxHostBatch,
} from '../src/core/host-driver.js';
import { createLynxElementPAPI, type LynxElementPAPI } from '../src/core/papi.js';

interface FakeNode {
	readonly uid: number;
	readonly type: string;
	parent: FakeNode | null;
	readonly children: FakeNode[];
	readonly attributes: Record<string, unknown>;
	id: string | null;
	text: string;
}

type FaultMethod = 'flush' | 'insertBefore' | 'remove' | 'replace' | 'setAttribute';

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
		id: null,
		text,
	});
	const run = (method: FaultMethod, mutation: () => void): void => {
		calls.push(method);
		if (fault?.method === method && fault.timing === 'before') {
			const error = fault.error;
			fault = null;
			throw error;
		}
		mutation();
		if (fault?.method === method && fault.timing === 'after') {
			const error = fault.error;
			fault = null;
			throw error;
		}
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

function createHost(root = 1) {
	const papi = createFakePAPI();
	const container = createLynxHostContainer(papi, { root });
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
			const papi = createLynxElementPAPI(globalThis);
			const container = createLynxHostContainer(papi, { root: 1 });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'view', props: { id: 'counter' } },
					{ op: 'create', id: 2, type: 'text', props: {} },
					{ op: 'create', id: 3, type: '#text', props: { value: 'Count: 0' } },
					{ op: 'insert', parent: null, id: 1, before: null },
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: 2, id: 3, before: null },
				]),
			).apply();

			const page = container.page as unknown as Element;
			expect(page.querySelector('#counter')?.textContent).toBe('Count: 0');
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

	it('applies every structural command with complete props and one flush per batch', () => {
		const { container, driver, page, papi } = createHost();
		const mount = prepareLynxHostBatch(
			container,
			batch(1, [
				{ op: 'create', id: 1, type: 'view', props: { id: 'parent', title: 'first' } },
				{ op: 'create', id: 2, type: 'text', props: { id: 'label' } },
				{ op: 'create', id: 3, type: '#text', props: { value: 'Count: 0' } },
				{ op: 'event', id: 1, type: 'tap', listener: { id: 101, priority: 'discrete' } },
				{ op: 'insert', parent: null, id: 1, before: null },
				{ op: 'insert', parent: 1, id: 2, before: null },
				{ op: 'insert', parent: 2, id: 3, before: null },
				{ op: 'visibility', id: 2, state: 'hidden' },
			]),
		);

		expect(mount.mutationStarted).toBe(false);
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
		expect(getLynxHostEventListener(container, 1, 'tap')).toEqual({
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
				batch(2, [{ op: 'event', id: 1, type: 'tap', listener: null }]),
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
