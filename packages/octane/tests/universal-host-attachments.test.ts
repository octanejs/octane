import { describe, expect, it } from 'vitest';
import {
	type ObjectHostContainer,
	type ObjectHostInstance,
	type UniversalAsyncCommitTransport,
	type UniversalHostAttachmentBatch,
	type UniversalHostDriver,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
} from '../src/universal.js';

const attachmentPlan = universalPlan('object', {
	kind: 'host',
	type: 'parent',
	propsSlot: 0,
	children: [{ kind: 'host', type: 'child', propsSlot: 1 }],
});

type AttachmentRef = (value: ObjectHostInstance | null) => void;

const AttachmentScene = defineUniversalComponent(
	'object',
	(props: { show: boolean; value: number; parentRef: AttachmentRef; childRef: AttachmentRef }) =>
		props.show
			? universalValue(attachmentPlan, [
					universalProps([
						['set', 'ref', props.parentRef],
						['set', 'value', props.value],
					]),
					universalProps([['set', 'ref', props.childRef]]),
				])
			: null,
);

interface AttachmentHarness {
	readonly container: ObjectHostContainer;
	readonly driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance>;
	readonly attached: Set<number>;
	readonly notifications: (batch: UniversalHostAttachmentBatch) => void;
	readonly unsubscribeCount: () => number;
}

function createAttachmentHarness(): AttachmentHarness {
	const container = createObjectContainer();
	const base = createObjectDriver();
	const attached = new Set<number>();
	let notify: ((batch: UniversalHostAttachmentBatch) => void) | null = null;
	let unsubscribed = 0;
	const driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> = {
		...base,
		attachments: {
			subscribe(target, onChange) {
				expect(target).toBe(container);
				notify = onChange;
				return {
					isAttached(id) {
						return attached.has(id);
					},
					unsubscribe() {
						unsubscribed++;
					},
				};
			},
		},
	};
	return {
		container,
		driver,
		attached,
		notifications(batch) {
			if (notify === null) throw new Error('Attachment subscription was not installed.');
			notify(batch);
		},
		unsubscribeCount: () => unsubscribed,
	};
}

describe('universal host attachment capability', () => {
	it('defers refs and normalizes physical detach parent-first and attach child-first', () => {
		const harness = createAttachmentHarness();
		const root = createUniversalRoot(harness.container, harness.driver);
		const log: string[] = [];
		const parentRef: AttachmentRef = (value) =>
			log.push(value === null ? 'parent:detach' : 'parent:attach');
		const childRef: AttachmentRef = (value) =>
			log.push(value === null ? 'child:detach' : 'child:attach');

		root.render(AttachmentScene, { show: true, value: 1, parentRef, childRef });
		const parent = harness.container.children[0];
		const child = parent.children[0];
		expect(log).toEqual([]);

		harness.attached.add(parent.id);
		harness.attached.add(child.id);
		harness.notifications({
			// Deliberately parent-first: core attachment is always child-first.
			attached: [parent.id, child.id],
			detached: [],
		});
		expect(log).toEqual(['child:attach', 'parent:attach']);

		harness.notifications({
			// A renderer may report physical replacement as one ordered cycle even
			// though the logical hosts are attached again by delivery time.
			detached: [child.id, parent.id],
			attached: [parent.id, child.id],
		});
		expect(log).toEqual([
			'child:attach',
			'parent:attach',
			'parent:detach',
			'child:detach',
			'child:attach',
			'parent:attach',
		]);

		harness.attached.delete(parent.id);
		harness.attached.delete(child.id);
		harness.notifications({
			// Deliberately child-first: core detachment is always parent-first.
			attached: [],
			detached: [child.id, parent.id],
		});
		expect(log.slice(-2)).toEqual(['parent:detach', 'child:detach']);

		root.unmount();
		expect(harness.unsubscribeCount()).toBe(1);
	});

	it('uses current attachment state to ignore duplicate, stale, unknown, and removed hosts', () => {
		const harness = createAttachmentHarness();
		const root = createUniversalRoot(harness.container, harness.driver);
		const log: string[] = [];
		const parentRef: AttachmentRef = (value) =>
			log.push(value === null ? 'parent:detach' : 'parent:attach');
		const childRef: AttachmentRef = (value) =>
			log.push(value === null ? 'child:detach' : 'child:attach');

		root.render(AttachmentScene, { show: true, value: 1, parentRef, childRef });
		const parent = harness.container.children[0];
		const child = parent.children[0];
		harness.attached.add(parent.id);
		harness.attached.add(child.id);
		expect(() =>
			harness.notifications({
				attached: [child.id, child.id, parent.id, 99_999],
				detached: [parent.id, 99_999],
			}),
		).not.toThrow();
		expect(log).toEqual(['child:attach', 'parent:attach']);

		// Both reports are stale relative to current state and therefore no-ops.
		harness.notifications({ attached: [parent.id], detached: [child.id] });
		expect(log).toEqual(['child:attach', 'parent:attach']);

		root.render(AttachmentScene, { show: false, value: 1, parentRef, childRef });
		expect(log.slice(-2)).toEqual(['parent:detach', 'child:detach']);
		const afterRemoval = [...log];
		expect(() =>
			harness.notifications({
				attached: [parent.id, child.id],
				detached: [child.id, parent.id],
			}),
		).not.toThrow();
		expect(log).toEqual(afterRemoval);

		root.unmount();
		const afterUnmount = [...log];
		expect(() => harness.notifications({ attached: [parent.id], detached: [] })).not.toThrow();
		expect(log).toEqual(afterUnmount);
		expect(harness.unsubscribeCount()).toBe(1);
	});

	it('defers notifications raised during host mutation until accepted topology is public', () => {
		const container = createObjectContainer();
		const base = createObjectDriver();
		const attached = new Set<number>();
		const log: string[] = [];
		let notify: ((batch: UniversalHostAttachmentBatch) => void) | null = null;
		let applyCount = 0;
		const driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> = {
			...base,
			attachments: {
				subscribe(_target, onChange) {
					notify = onChange;
					return {
						isAttached: (id) => attached.has(id),
						unsubscribe() {},
					};
				},
			},
			prepareBatch(target, batch, context) {
				const prepared = base.prepareBatch(target, batch, context);
				return {
					...prepared,
					apply() {
						prepared.apply();
						applyCount++;
						const parent = container.children[0];
						const ids = parent === undefined ? [] : [parent.id, parent.children[0].id];
						if (applyCount === 1) {
							for (const id of ids) attached.add(id);
							notify?.({ attached: ids, detached: [] });
						} else {
							for (const id of ids) attached.delete(id);
							notify?.({ attached: [], detached: [...ids].reverse() });
						}
						log.push(`apply:${applyCount}:end`);
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const parentRef: AttachmentRef = (value) =>
			log.push(value === null ? 'parent:detach' : 'parent:attach');
		const childRef: AttachmentRef = (value) =>
			log.push(value === null ? 'child:detach' : 'child:attach');

		root.render(AttachmentScene, { show: true, value: 1, parentRef, childRef });
		expect(log).toEqual(['apply:1:end', 'child:attach', 'parent:attach']);
		root.render(AttachmentScene, { show: true, value: 2, parentRef, childRef });
		expect(log).toEqual([
			'apply:1:end',
			'child:attach',
			'parent:attach',
			'apply:2:end',
			'parent:detach',
			'child:detach',
		]);
		root.unmount();
	});

	it('holds pre-ack attachment notifications until an async host batch is accepted', async () => {
		const container = createObjectContainer();
		const base = createObjectDriver();
		const attached = new Set<number>();
		const log: string[] = [];
		let notify: ((batch: UniversalHostAttachmentBatch) => void) | null = null;
		let unsubscribed = 0;
		const driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> = {
			...base,
			capabilities: {
				...base.capabilities,
				localHostCallbacks: false,
			},
			localCallbacks: undefined,
			attachments: {
				subscribe(_target, onChange) {
					notify = onChange;
					return {
						isAttached: (id) => attached.has(id),
						unsubscribe() {
							unsubscribed++;
						},
					};
				},
			},
		};
		const transport: UniversalAsyncCommitTransport<ObjectHostContainer> = {
			mode: 'async',
			prepareBatch(target, batch, identity) {
				const prepared = base.prepareBatch(target, batch, {
					invokeLocalCallback() {
						throw new Error('Unexpected local callback.');
					},
				});
				return {
					async apply(acknowledge) {
						prepared.apply();
						const parent = container.children[0];
						if (parent !== undefined) {
							const ids = [parent.id, parent.children[0].id];
							for (const id of ids) attached.add(id);
							notify?.({ attached: ids, detached: [] });
							log.push('before:ack');
						}
						acknowledge({ ...identity, type: 'ack' });
					},
					abort() {
						prepared.abort();
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver, { transport });
		const parentRef: AttachmentRef = (value) =>
			log.push(value === null ? 'parent:detach' : 'parent:attach');
		const childRef: AttachmentRef = (value) =>
			log.push(value === null ? 'child:detach' : 'child:attach');

		await root.renderAsync(AttachmentScene, {
			show: true,
			value: 1,
			parentRef,
			childRef,
		});
		expect(log).toEqual(['before:ack', 'child:attach', 'parent:attach']);
		await root.unmountAsync();
		expect(unsubscribed).toBe(1);
	});

	it('preserves a queued detach and reattach cycle across an async acknowledgement', async () => {
		const harness = createAttachmentHarness();
		const base = createObjectDriver();
		const driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> = {
			...harness.driver,
			capabilities: {
				...harness.driver.capabilities,
				localHostCallbacks: false,
			},
			localCallbacks: undefined,
		};
		const log: string[] = [];
		let applyCount = 0;
		let acknowledgeUpdate: (() => void) | null = null;
		let markUpdateStarted!: () => void;
		const updateStarted = new Promise<void>((resolve) => {
			markUpdateStarted = resolve;
		});
		const transport: UniversalAsyncCommitTransport<ObjectHostContainer> = {
			mode: 'async',
			prepareBatch(target, batch, identity) {
				const prepared = base.prepareBatch(target, batch, {
					invokeLocalCallback() {
						throw new Error('Unexpected local callback.');
					},
				});
				return {
					async apply(acknowledge) {
						prepared.apply();
						applyCount++;
						if (applyCount === 1) {
							const parent = harness.container.children[0]!;
							harness.attached.add(parent.id);
							harness.attached.add(parent.children[0]!.id);
							harness.notifications({
								detached: [],
								attached: [parent.id, parent.children[0]!.id],
							});
							acknowledge({ ...identity, type: 'ack' });
						} else if (applyCount === 2) {
							await new Promise<void>((resolve) => {
								acknowledgeUpdate = () => {
									acknowledge({ ...identity, type: 'ack' });
									resolve();
								};
								markUpdateStarted();
							});
						} else {
							acknowledge({ ...identity, type: 'ack' });
						}
					},
					abort() {
						prepared.abort();
					},
				};
			},
		};
		const root = createUniversalRoot(harness.container, driver, { transport });
		const parentRef: AttachmentRef = (value) =>
			log.push(value === null ? 'parent:detach' : 'parent:attach');
		const childRef: AttachmentRef = (value) =>
			log.push(value === null ? 'child:detach' : 'child:attach');

		await root.renderAsync(AttachmentScene, {
			show: true,
			value: 1,
			parentRef,
			childRef,
		});
		const parent = harness.container.children[0]!;
		const child = parent.children[0]!;
		const updating = root.renderAsync(AttachmentScene, {
			show: true,
			value: 2,
			parentRef,
			childRef,
		});
		await updateStarted;
		if (acknowledgeUpdate === null) throw new Error('Expected a pending update acknowledgement.');

		harness.attached.delete(parent.id);
		harness.attached.delete(child.id);
		harness.notifications({ detached: [child.id, parent.id], attached: [] });
		harness.attached.add(parent.id);
		harness.attached.add(child.id);
		harness.notifications({ detached: [], attached: [parent.id, child.id] });
		acknowledgeUpdate();
		await updating;

		expect(log).toEqual([
			'child:attach',
			'parent:attach',
			'parent:detach',
			'child:detach',
			'child:attach',
			'parent:attach',
		]);
		await root.unmountAsync();
	});

	it('releases a partially valid registration when root construction rejects it', () => {
		const container = createObjectContainer();
		const base = createObjectDriver();
		let unsubscribed = 0;
		const driver = {
			...base,
			attachments: {
				subscribe() {
					return {
						isAttached: null,
						unsubscribe() {
							unsubscribed++;
						},
					};
				},
			},
		} as unknown as UniversalHostDriver<ObjectHostContainer, ObjectHostInstance>;

		expect(() => createUniversalRoot(container, driver)).toThrow(/provide isAttached/);
		expect(unsubscribed).toBe(1);
	});
});
