import type { UniversalHostBatch, UniversalHostCommand } from 'octane/universal/native';
import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
	createLynxHostContainer,
	disposeLynxHostContainer,
	getLynxListDiagnostics,
	isLynxHostAttached,
	prepareLynxHostBatch,
	type LynxHostAttachmentDelta,
} from '../src/core/host-driver.js';
import { LYNX_CSS_SCOPE_PROP } from '../src/core/host-props.js';
import { LYNX_NODES_REF_ATTRIBUTE } from '../src/core/nodes-ref.js';
import { createLynxElementPAPI, type LynxListComponentAtIndexes } from '../src/core/papi.js';

function batch(version: number, commands: readonly UniversalHostCommand[]): UniversalHostBatch {
	return { renderer: 'lynx', version, commands };
}

interface ItemIds {
	readonly item: number;
	readonly text: number;
	readonly raw: number;
}

function idsAt(index: number): ItemIds {
	return { item: index * 3 + 2, text: index * 3 + 3, raw: index * 3 + 4 };
}

function largeListMount(itemCount: number): UniversalHostCommand[] {
	const commands: UniversalHostCommand[] = [
		{ op: 'create', id: 1, type: 'list', props: { id: 'feed' } },
	];
	for (let index = 0; index < itemCount; index++) {
		const ids = idsAt(index);
		commands.push(
			{
				op: 'create',
				id: ids.item,
				type: 'list-item',
				props: { 'item-key': `item-${index}`, 'reuse-identifier': 'feed-row' },
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

function largeListUnmount(itemCount: number): UniversalHostCommand[] {
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

describe('Lynx native list recycling', () => {
	it('materializes requested cells, reuses their native identity, and makes late callbacks inert', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const attachmentBatches: Array<{
				readonly version: number;
				readonly deltas: readonly LynxHostAttachmentDelta[];
			}> = [];
			const papi = createLynxElementPAPI(globalThis);
			const container = createLynxHostContainer(papi, {
				root: 1,
				onAttachments(version, deltas) {
					attachmentBatches.push({ version, deltas });
				},
			});
			const itemCount = 1_000;
			prepareLynxHostBatch(container, batch(1, largeListMount(itemCount))).apply();

			const page = container.page as unknown as Element;
			const list = page.querySelector('#feed')!;
			expect(list).not.toBeNull();
			expect(list.children).toHaveLength(0);
			expect(isLynxHostAttached(container, 1)).toBe(true);
			expect(isLynxHostAttached(container, idsAt(0).item)).toBe(false);
			expect(JSON.parse(list.getAttribute('update-list-info')!)[0].insertAction).toHaveLength(
				itemCount,
			);

			const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0, 11, false);
			const firstCell = list.firstElementChild!;
			expect(firstCell.textContent).toBe('Row 0');
			expect(isLynxHostAttached(container, idsAt(0).item)).toBe(true);
			expect(attachmentBatches.at(-1)).toMatchObject({
				version: 1,
				deltas: [
					{ id: idsAt(0).raw, attached: true },
					{ id: idsAt(0).text, attached: true },
					{ id: idsAt(0).item, attached: true },
				],
			});

			globalThis.elementTree.leaveListItem(list as never, firstSign);
			expect(isLynxHostAttached(container, idsAt(0).item)).toBe(false);
			expect(
				attachmentBatches.at(-1)?.deltas.map(({ id, attached }) => ({ id, attached })),
			).toEqual([
				{ id: idsAt(0).item, attached: false },
				{ id: idsAt(0).text, attached: false },
				{ id: idsAt(0).raw, attached: false },
			]);

			const secondSign = globalThis.elementTree.enterListItemAtIndex(list as never, 1, 12, false);
			expect(secondSign).toBe(firstSign);
			expect(list.firstElementChild).toBe(firstCell);
			expect(firstCell.textContent).toBe('Row 1');
			expect(isLynxHostAttached(container, idsAt(1).raw)).toBe(true);

			const last = idsAt(itemCount - 1);
			prepareLynxHostBatch(
				container,
				batch(2, [{ op: 'move', parent: 1, id: idsAt(1).item, before: null }]),
			).apply();
			const moveAttachmentStart = attachmentBatches.length;
			const movedSign = globalThis.elementTree.enterListItemAtIndex(list as never, itemCount - 1);
			expect(movedSign).not.toBe(secondSign);
			expect(list.children).toHaveLength(2);
			expect(firstCell.getAttribute(LYNX_NODES_REF_ATTRIBUTE)).toBe('');
			const movedSelector = list.lastElementChild!.getAttribute(LYNX_NODES_REF_ATTRIBUTE);
			expect(
				list.querySelectorAll(`[${LYNX_NODES_REF_ATTRIBUTE}="${movedSelector}"]`),
			).toHaveLength(1);
			expect(
				attachmentBatches
					.slice(moveAttachmentStart)
					.map(({ deltas }) => deltas.map(({ attached }) => attached)),
			).toEqual([
				[false, false, false],
				[true, true, true],
			]);
			globalThis.elementTree.leaveListItem(list as never, secondSign);
			expect(getLynxListDiagnostics(container, 1)).toMatchObject({
				physicalCells: 2,
				attachedCells: 1,
				pooledCells: 1,
				leaveCount: 2,
			});
			expect(isLynxHostAttached(container, last.item)).toBe(false);

			prepareLynxHostBatch(container, batch(3, largeListUnmount(itemCount))).apply();
			expect(page.children).toHaveLength(0);
			expect(attachmentBatches.at(-1)).toMatchObject({
				version: 3,
				deltas: expect.arrayContaining([{ id: idsAt(1).item, generation: 1, attached: false }]),
			});
			expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(-1);
			expect(() => globalThis.elementTree.leaveListItem(list as never, secondSign)).not.toThrow();
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('does not publish a reuse notification when a pooled cell returns to its own item', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const target = globalThis as unknown as Record<string, unknown>;
			const flushes: Array<Readonly<Record<string, unknown>> | undefined> = [];
			const flush = target.__FlushElementTree as (
				node?: object,
				options?: Readonly<Record<string, unknown>>,
			) => void;
			target.__FlushElementTree = (node?: object, options?: Readonly<Record<string, unknown>>) => {
				flushes.push(options);
				flush(node, options);
			};
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 10 });
			prepareLynxHostBatch(container, batch(1, largeListMount(1))).apply();
			const list = (container.page as unknown as Element).querySelector('#feed')!;
			const sign = globalThis.elementTree.enterListItemAtIndex(list as never, 0, 51, true);
			globalThis.elementTree.leaveListItem(list as never, sign);
			flushes.length = 0;

			expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0, 52, true)).toBe(sign);
			expect(flushes).toHaveLength(1);
			expect(flushes[0]).toMatchObject({ triggerLayout: true, operationID: 52 });
			expect(flushes[0]).not.toHaveProperty('listReuseNotification');
			expect(getLynxListDiagnostics(container, 1)).toMatchObject({
				createdCells: 1,
				reusedCells: 1,
				enterCount: 2,
				leaveCount: 1,
			});
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('treats an empty reuse identifier as the omitted default pool', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 11 });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'list', props: { id: 'default-pool' } },
					{
						op: 'create',
						id: 2,
						type: 'list-item',
						props: { 'item-key': 'empty', 'reuse-identifier': '' },
					},
					{ op: 'create', id: 3, type: 'list-item', props: { 'item-key': 'omitted' } },
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: 1, id: 3, before: null },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const list = (container.page as unknown as Element).querySelector('#default-pool')!;
			const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
			globalThis.elementTree.leaveListItem(list as never, firstSign);

			expect(globalThis.elementTree.enterListItemAtIndex(list as never, 1)).toBe(firstSign);
			expect(getLynxListDiagnostics(container, 1)).toMatchObject({
				createdCells: 1,
				reusedCells: 1,
			});
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('rejects invalid direct children, missing keys, and duplicate item keys before mutation', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 2 });
			expect(() =>
				prepareLynxHostBatch(
					container,
					batch(1, [
						{ op: 'create', id: 1, type: 'list', props: {} },
						{ op: 'create', id: 2, type: 'view', props: {} },
						{ op: 'insert', parent: 1, id: 2, before: null },
						{ op: 'insert', parent: null, id: 1, before: null },
					]),
				),
			).toThrow(/must be a <list-item>/);

			const keyed = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 3 });
			expect(() =>
				prepareLynxHostBatch(
					keyed,
					batch(1, [
						{ op: 'create', id: 1, type: 'list', props: {} },
						{ op: 'create', id: 2, type: 'list-item', props: { 'item-key': 'same' } },
						{ op: 'create', id: 3, type: 'list-item', props: { 'item-key': 'same' } },
						{ op: 'insert', parent: 1, id: 2, before: null },
						{ op: 'insert', parent: 1, id: 3, before: null },
						{ op: 'insert', parent: null, id: 1, before: null },
					]),
				),
			).toThrow(/item-key.*duplicated/);

			const nested = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 4 });
			expect(() =>
				prepareLynxHostBatch(
					nested,
					batch(1, [
						{ op: 'create', id: 1, type: 'list', props: {} },
						{ op: 'create', id: 2, type: 'list-item', props: { 'item-key': 'outer' } },
						{ op: 'create', id: 3, type: 'list', props: {} },
						{ op: 'insert', parent: 2, id: 3, before: null },
						{ op: 'insert', parent: 1, id: 2, before: null },
						{ op: 'insert', parent: null, id: 1, before: null },
					]),
				),
			).toThrow(/nested <list>/);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('rekeys the native callback sign when reuse must recreate a cell root', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 5 });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'list', props: { id: 'recreate-feed' } },
					{
						op: 'create',
						id: 2,
						type: 'list-item',
						props: {
							'item-key': 'scoped',
							'reuse-identifier': 'row',
							[LYNX_CSS_SCOPE_PROP]: 7,
						},
					},
					{
						op: 'create',
						id: 3,
						type: 'list-item',
						props: { 'item-key': 'unscoped', 'reuse-identifier': 'row' },
					},
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: 1, id: 3, before: null },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const list = (container.page as unknown as Element).querySelector('#recreate-feed')!;
			const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
			const firstCell = list.firstElementChild;
			globalThis.elementTree.leaveListItem(list as never, firstSign);

			const secondSign = globalThis.elementTree.enterListItemAtIndex(list as never, 1);
			expect(secondSign).not.toBe(firstSign);
			expect(list.firstElementChild).not.toBe(firstCell);
			expect(() => globalThis.elementTree.leaveListItem(list as never, firstSign)).not.toThrow();
			globalThis.elementTree.leaveListItem(list as never, secondSign);
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('accepts a logical list removal when native cell retirement faults before mutation', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const remove = globalThis.__RemoveElement as (parent: object, child: object) => unknown;
			const failure = new Error('injected list retirement failure');
			let failNextRemove = false;
			globalThis.__RemoveElement = (parent: object, child: object) => {
				if (failNextRemove) {
					failNextRemove = false;
					throw failure;
				}
				return remove(parent, child);
			};
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 6 });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'list', props: { id: 'fault-feed' } },
					{
						op: 'create',
						id: 2,
						type: 'list-item',
						props: { 'item-key': 'only', recyclable: false },
					},
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const page = container.page as unknown as Element;
			const list = page.querySelector('#fault-feed')!;
			globalThis.elementTree.enterListItemAtIndex(list as never, 0);
			failNextRemove = true;

			expect(() =>
				prepareLynxHostBatch(
					container,
					batch(2, [
						{ op: 'remove', parent: 1, id: 2 },
						{ op: 'destroy', id: 2 },
					]),
				).apply(),
			).toThrow(failure);
			expect(container.acceptedVersion).toBe(2);
			expect(container.instanceCount).toBe(1);
			expect(() => prepareLynxHostBatch(container, batch(3, []))).toThrow(/post-fault teardown/);

			expect(disposeLynxHostContainer(container)).toEqual({
				complete: true,
				removedRoots: 1,
				remainingRoots: 0,
				flushed: true,
				errors: [],
			});
			expect(page.children).toHaveLength(0);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('rekeys pooled cells when live item reuse metadata changes', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const container = createLynxHostContainer(createLynxElementPAPI(globalThis), { root: 7 });
			prepareLynxHostBatch(
				container,
				batch(1, [
					{ op: 'create', id: 1, type: 'list', props: { id: 'metadata-feed' } },
					{
						op: 'create',
						id: 2,
						type: 'list-item',
						props: { 'item-key': 'only', 'reuse-identifier': 'reuse-0' },
					},
					{ op: 'insert', parent: 1, id: 2, before: null },
					{ op: 'insert', parent: null, id: 1, before: null },
				]),
			).apply();
			const list = (container.page as unknown as Element).querySelector('#metadata-feed')!;
			const sign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
			globalThis.elementTree.leaveListItem(list as never, sign);

			for (let version = 2; version <= 12; version++) {
				prepareLynxHostBatch(
					container,
					batch(version, [
						{
							op: 'update',
							id: 2,
							props: {
								'item-key': 'only',
								'reuse-identifier': `reuse-${version - 1}`,
							},
						},
					]),
				).apply();
				expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(sign);
				globalThis.elementTree.leaveListItem(list as never, sign);
				expect(getLynxListDiagnostics(container, 1)).toMatchObject({
					physicalCells: 1,
					attachedCells: 0,
					pooledCells: 1,
					createdCells: 1,
				});
			}
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('batches callback attachments and mirrors sync and async reuse flush options', () => {
		const dom = new JSDOM();
		installLynxTestingEnv(globalThis, { window: dom.window as never });
		const environment = globalThis.lynxTestingEnv;
		environment.clearGlobal();
		environment.switchToMainThread();
		try {
			const target = globalThis as unknown as Record<string, unknown>;
			let componentAtIndexes: LynxListComponentAtIndexes<object> | undefined;
			const createList = target.__CreateList as (...args: unknown[]) => object;
			target.__CreateList = (...args: unknown[]) => {
				componentAtIndexes = args[4] as LynxListComponentAtIndexes<object>;
				return createList(...args);
			};
			const flushes: Array<{
				readonly node: object | undefined;
				readonly options: Readonly<Record<string, unknown>> | undefined;
			}> = [];
			const flush = target.__FlushElementTree as (
				node?: object,
				options?: Readonly<Record<string, unknown>>,
			) => void;
			target.__FlushElementTree = (node?: object, options?: Readonly<Record<string, unknown>>) => {
				flushes.push({ node, options });
				flush(node, options);
			};
			const attachmentBatches: Array<readonly LynxHostAttachmentDelta[]> = [];
			const papi = createLynxElementPAPI(globalThis);
			const container = createLynxHostContainer(papi, {
				root: 8,
				onAttachments(_version, deltas) {
					attachmentBatches.push(deltas);
				},
			});
			prepareLynxHostBatch(container, batch(1, largeListMount(4))).apply();
			const list = (container.page as unknown as Element).querySelector('#feed')!;
			const firstSign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
			const secondSign = globalThis.elementTree.enterListItemAtIndex(list as never, 1);
			globalThis.elementTree.leaveListItem(list as never, firstSign);
			globalThis.elementTree.leaveListItem(list as never, secondSign);
			flushes.length = 0;
			attachmentBatches.length = 0;
			if (componentAtIndexes === undefined) throw new Error('Expected batched list callback.');

			componentAtIndexes(
				list as never,
				papi.getUniqueId(list as never),
				[2, 3],
				[31, 32],
				true,
				true,
			);
			expect(flushes).toHaveLength(3);
			expect(
				flushes.slice(0, 2).map(({ options }) => ({
					asyncFlush: options?.asyncFlush,
					itemKey: (options?.listReuseNotification as { readonly itemKey?: unknown } | undefined)
						?.itemKey,
				})),
			).toEqual([
				{ asyncFlush: true, itemKey: 'item-2' },
				{ asyncFlush: true, itemKey: 'item-3' },
			]);
			expect(flushes[2]).toMatchObject({
				node: list,
				options: { triggerLayout: true, operationIDs: [31, 32] },
			});
			expect(attachmentBatches).toHaveLength(1);

			for (const child of [...list.children]) {
				globalThis.elementTree.leaveListItem(
					list as never,
					globalThis.__GetElementUniqueID(child as never),
				);
			}
			flushes.length = 0;
			attachmentBatches.length = 0;
			componentAtIndexes(
				list as never,
				papi.getUniqueId(list as never),
				[0, 1],
				[41, 42],
				true,
				false,
			);
			expect(flushes).toEqual([
				expect.objectContaining({
					node: list,
					options: expect.objectContaining({ triggerLayout: true, operationIDs: [41, 42] }),
				}),
			]);
			expect(flushes[0]!.options).not.toHaveProperty('listReuseNotification');
			expect(attachmentBatches).toHaveLength(1);
			expect(disposeLynxHostContainer(container).errors).toEqual([]);
		} finally {
			environment.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it.each(['create', 'insert', 'getUniqueId', 'flush', 'pooled-rebind'] as const)(
		'fail-stops and reports one accepted fault when scroll-time %s throws',
		(stage) => {
			const dom = new JSDOM();
			installLynxTestingEnv(globalThis, { window: dom.window as never });
			const environment = globalThis.lynxTestingEnv;
			environment.clearGlobal();
			environment.switchToMainThread();
			try {
				const target = globalThis as unknown as Record<string, unknown>;
				const failure = new Error(`injected scroll-time list ${stage} failure`);
				let armed = false;
				const failAt = (candidate: typeof stage): void => {
					if (!armed || stage !== candidate) return;
					armed = false;
					throw failure;
				};
				const createElement = target.__CreateElement as (type: string, parentId: number) => object;
				target.__CreateElement = (type: string, parentId: number) => {
					failAt('create');
					return createElement(type, parentId);
				};
				const insert = target.__InsertElementBefore as (
					parent: object,
					child: object,
					before?: object,
				) => unknown;
				target.__InsertElementBefore = (parent: object, child: object, before?: object) => {
					failAt('insert');
					return insert(parent, child, before);
				};
				const getUniqueId = target.__GetElementUniqueID as (node: object) => number;
				target.__GetElementUniqueID = (node: object) => {
					failAt('getUniqueId');
					return getUniqueId(node);
				};
				const setAttribute = target.__SetAttribute as (
					node: object,
					name: string,
					value: unknown,
				) => void;
				target.__SetAttribute = (node: object, name: string, value: unknown) => {
					failAt('pooled-rebind');
					setAttribute(node, name, value);
				};
				const flush = target.__FlushElementTree as (
					node?: object,
					options?: Readonly<Record<string, unknown>>,
				) => void;
				target.__FlushElementTree = (
					node?: object,
					options?: Readonly<Record<string, unknown>>,
				) => {
					failAt('flush');
					flush(node, options);
				};
				const faults: Array<{ readonly version: number; readonly error: unknown }> = [];
				const attachments: Array<readonly LynxHostAttachmentDelta[]> = [];
				const container = createLynxHostContainer(createLynxElementPAPI(globalThis), {
					root: 9,
					onAttachments(_version, deltas) {
						attachments.push(deltas);
					},
					onCallbackFault(version, error) {
						faults.push({ version, error });
					},
				});
				prepareLynxHostBatch(
					container,
					batch(1, largeListMount(stage === 'pooled-rebind' ? 2 : 1)),
				).apply();
				const list = (container.page as unknown as Element).querySelector('#feed')!;
				if (stage === 'pooled-rebind') {
					const sign = globalThis.elementTree.enterListItemAtIndex(list as never, 0);
					globalThis.elementTree.leaveListItem(list as never, sign);
					attachments.length = 0;
				}
				armed = true;

				expect(
					globalThis.elementTree.enterListItemAtIndex(
						list as never,
						stage === 'pooled-rebind' ? 1 : 0,
					),
				).toBe(-1);
				expect(faults).toEqual([{ version: 1, error: failure }]);
				expect(attachments).toEqual([]);
				expect(isLynxHostAttached(container, idsAt(0).item)).toBe(false);
				expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBe(-1);
				expect(faults).toHaveLength(1);
				expect(() =>
					prepareLynxHostBatch(container, batch(2, [{ op: 'update', id: 1, props: {} }])),
				).toThrow(/after a host fault/);
				expect(disposeLynxHostContainer(container).errors).toEqual([]);
			} finally {
				environment.clearGlobal();
				uninstallLynxTestingEnv(globalThis);
				dom.window.close();
			}
		},
	);
});
