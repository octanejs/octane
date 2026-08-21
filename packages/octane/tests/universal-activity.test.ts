import { describe, expect, it } from 'vitest';
import { type ComponentBody } from '../src/index.js';
import {
	type ObjectHostContainer,
	type ObjectHostInstance,
	type UniversalHostAttachmentBatch,
	type UniversalHostDriver,
	type UniversalRenderable,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	isRendererRegion,
	rendererRegion,
	universalActivity,
	universalComponent,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useState,
} from '../src/universal.js';
import { mount as mountDom } from './_helpers';
import { CompiledUniversalActivity } from './_fixtures/universal-activity.object.tsrx';
import { ActivityRegionChild } from './conformance/_fixtures/activity-dom.tsrx';

const hostPlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
});

function labeledHost(label: string) {
	return universalValue(hostPlan, [universalProps([['set', 'label', label]])]);
}

async function flushUniversalWork(count = 3) {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

describe('universal Activity visibility', () => {
	it('executes compiler-lowered Activity through the selected renderer', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const refs: Array<ObjectHostInstance | null> = [];
		const hostRef = (value: ObjectHostInstance | null) => refs.push(value);

		root.render(CompiledUniversalActivity, { mode: 'hidden', hostRef });
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([]);
		root.render(CompiledUniversalActivity, { mode: 'visible', hostRef });
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		expect(refs).toEqual([instance]);
		root.unmount();
	});

	it('preserves the host and state while disconnecting refs, effects, and events', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const refs: Array<ObjectHostInstance | null> = [];
		const hostRef = (value: ObjectHostInstance | null) => refs.push(value);
		let updateState!: (value: (previous: number) => number) => void;
		const Child = defineUniversalComponent(
			'object',
			(props: { version: number; onPress: () => void }) => {
				const [count, setCount] = useState(0, 'state');
				updateState = setCount;
				log.push(`render:${count}`);
				useInsertionEffect(
					() => {
						log.push(`insertion mount:${props.version}`);
						return () => log.push(`insertion cleanup:${props.version}`);
					},
					[props.version],
					'insertion',
				);
				useLayoutEffect(
					() => {
						log.push('layout mount');
						return () => log.push('layout cleanup');
					},
					[],
					'layout',
				);
				useEffect(
					() => {
						log.push('passive mount');
						return () => log.push('passive cleanup');
					},
					[],
					'passive',
				);
				return universalValue(hostPlan, [
					universalProps([
						['set', 'value', count],
						['set', 'onPress', props.onPress],
						['set', 'ref', hostRef],
					]),
				]);
			},
		);
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; version: number; onPress: () => void }) =>
				universalActivity(props.mode, () =>
					universalComponent('object', Child, {
						version: props.version,
						onPress: props.onPress,
					}),
				),
		);
		const onPress = () => log.push('press');

		root.render(Scene, { mode: 'hidden', version: 0, onPress });
		await flushUniversalWork();
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([]);
		expect(log).toEqual(['render:0', 'insertion mount:0']);
		expect(() => container.dispatchEvent(instance, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		log.length = 0;
		root.render(Scene, { mode: 'hidden', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(false);
		expect(log).toEqual(['render:0', 'insertion cleanup:0', 'insertion mount:1']);

		log.length = 0;
		root.render(Scene, { mode: 'visible', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		expect(refs).toEqual([instance]);
		expect(log).toEqual(['render:0', 'layout mount', 'passive mount']);
		container.dispatchEvent(instance, 'press', undefined);
		expect(log.at(-1)).toBe('press');

		log.length = 0;
		updateState((value) => value + 1);
		await flushUniversalWork();
		expect(instance.props.value).toBe(1);
		expect(log).toContain('render:1');

		log.length = 0;
		root.render(Scene, { mode: 'hidden', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.props.value).toBe(1);
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([instance, null]);
		expect(log).toEqual(['render:1', 'layout cleanup', 'passive cleanup']);
		expect(() => container.dispatchEvent(instance, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		root.unmount();
		await flushUniversalWork();
		expect(refs).toEqual([instance, null]);
		expect(log.at(-1)).toBe('insertion cleanup:1');
	});

	it('disconnects parent-first and reconnects child-first', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const effectComponent = (name: string, child: (() => UniversalRenderable) | null = null) =>
			defineUniversalComponent('object', () => {
				useLayoutEffect(
					() => {
						log.push(`layout mount:${name}`);
						return () => log.push(`layout cleanup:${name}`);
					},
					[],
					`${name}:layout`,
				);
				useEffect(
					() => {
						log.push(`passive mount:${name}`);
						return () => log.push(`passive cleanup:${name}`);
					},
					[],
					`${name}:passive`,
				);
				return child === null ? universalValue(hostPlan, [universalProps([])]) : child();
			});
		const Child = effectComponent('child');
		const Parent = effectComponent('parent', () => universalComponent('object', Child, {}));
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () => universalComponent('object', Parent, {})),
		);

		root.render(Scene, { mode: 'visible' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout mount:child',
			'layout mount:parent',
			'passive mount:child',
			'passive mount:parent',
		]);

		log.length = 0;
		root.render(Scene, { mode: 'hidden' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout cleanup:parent',
			'layout cleanup:child',
			'passive cleanup:parent',
			'passive cleanup:child',
		]);

		log.length = 0;
		root.render(Scene, { mode: 'visible' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout mount:child',
			'layout mount:parent',
			'passive mount:child',
			'passive mount:parent',
		]);
		root.unmount();
	});

	it('composes nested hidden modes without changing host identity', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent(
			'object',
			(props: { outer: 'visible' | 'hidden'; inner: 'visible' | 'hidden' }) =>
				universalActivity(props.outer, () =>
					universalActivity(props.inner, () => universalValue(hostPlan, [universalProps([])])),
				),
		);

		root.render(Scene, { outer: 'hidden', inner: 'visible' });
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'visible' });
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		root.render(Scene, { outer: 'hidden', inner: 'hidden' });
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'hidden' });
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'visible' });
		expect(instance.visible).toBe(true);
		root.unmount();
	});

	it('keeps accepted visibility unchanged when a prepared transition aborts or preflight rejects', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let rejectVisibility = false;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				if (rejectVisibility && batch.commands.some((command) => command.op === 'visibility')) {
					throw new Error('visibility preflight rejected');
				}
				return baseDriver.prepareBatch(target, batch, context);
			},
		};
		const root = createUniversalRoot(container, driver);
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () => universalValue(hostPlan, [universalProps([])])),
		);

		root.render(Scene, { mode: 'visible' });
		const instance = container.children[0];
		const prepared = root.prepare(Scene, { mode: 'hidden' });
		expect(prepared.status).toBe('prepared');
		expect(instance.visible).toBe(true);
		prepared.abort();
		expect(instance.visible).toBe(true);

		rejectVisibility = true;
		expect(() => root.prepare(Scene, { mode: 'hidden' })).toThrow('visibility preflight rejected');
		expect(instance.visible).toBe(true);
		root.unmount();
	});

	// Per ReactFiberCommitWork.js:2908/3098 (React 19.2.7).
	it('reconnects the latest ref after hidden updates without repeating old cleanups', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const calls: string[] = [];
		const firstObject = { current: null as ObjectHostInstance | null };
		const nextObject = { current: null as ObjectHostInstance | null };
		const first = (value: ObjectHostInstance | null) => {
			if (value === null) {
				calls.push('first:null');
				return;
			}
			calls.push('first:attach');
			return () => calls.push('first:cleanup');
		};
		const next = (value: ObjectHostInstance | null) => {
			if (value === null) {
				calls.push('next:null');
				return;
			}
			calls.push('next:attach');
			return () => calls.push('next:cleanup');
		};
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; ref: unknown }) =>
				universalActivity(props.mode, () =>
					universalValue(hostPlan, [universalProps([['set', 'ref', props.ref]])]),
				),
		);

		root.render(Scene, { mode: 'visible', ref: [firstObject, first] });
		const instance = container.children[0];
		expect(firstObject.current).toBe(instance);
		root.render(Scene, { mode: 'hidden', ref: [firstObject, first] });
		expect(firstObject.current).toBeNull();
		expect(calls).toEqual(['first:attach', 'first:cleanup']);
		root.render(Scene, { mode: 'hidden', ref: [nextObject, next] });
		expect(nextObject.current).toBeNull();
		expect(calls).toEqual(['first:attach', 'first:cleanup']);

		const abandoned = root.prepare(Scene, { mode: 'visible', ref: [nextObject, next] });
		expect(abandoned.status).toBe('prepared');
		abandoned.abort();
		expect(nextObject.current).toBeNull();
		expect(instance.visible).toBe(false);
		root.render(Scene, { mode: 'visible', ref: [nextObject, next] });
		expect(container.children[0]).toBe(instance);
		expect(nextObject.current).toBe(instance);
		expect(calls).toEqual(['first:attach', 'first:cleanup', 'next:attach']);

		root.render(Scene, { mode: 'hidden', ref: [nextObject, next] });
		root.unmount();
		expect(nextObject.current).toBeNull();
		expect(calls).toEqual(['first:attach', 'first:cleanup', 'next:attach', 'next:cleanup']);
	});

	// A native recycling driver may attach a preserved host while its logical
	// Activity is hidden. Physical attachment alone must not publish a UI ref.
	it('keeps refs disconnected across hidden physical attachment notifications', () => {
		const container = createObjectContainer();
		let notify!: (batch: UniversalHostAttachmentBatch) => void;
		const driver: UniversalHostDriver<ObjectHostContainer, ObjectHostInstance> = {
			...createObjectDriver(),
			attachments: {
				subscribe(_target, onChange) {
					notify = onChange;
					return { isAttached: () => true, unsubscribe() {} };
				},
			},
		};
		const root = createUniversalRoot(container, driver);
		const calls: Array<ObjectHostInstance | null> = [];
		const ref = (value: ObjectHostInstance | null) => calls.push(value);
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () =>
				universalValue(hostPlan, [universalProps([['set', 'ref', ref]])]),
			),
		);

		root.render(Scene, { mode: 'hidden' });
		const instance = container.children[0];
		expect(calls).toEqual([]);
		notify({ detached: [instance.id], attached: [instance.id] });
		expect(calls).toEqual([]);
		root.render(Scene, { mode: 'visible' });
		expect(calls).toEqual([instance]);
		root.render(Scene, { mode: 'hidden' });
		expect(calls).toEqual([instance, null]);
		notify({ detached: [instance.id], attached: [instance.id] });
		expect(calls).toEqual([instance, null]);
		root.unmount();
		expect(calls).toEqual([instance, null]);
	});

	// Per ActivitySuspense-test.js:99/224 (React 19.2.7).
	it('contains hidden suspension and retries without replacing the visible shell', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const log: string[] = [];
		const Child = defineUniversalComponent('object', () => {
			const value = use(promise);
			useEffect(
				() => {
					log.push('mount');
					return () => log.push('cleanup');
				},
				[],
				'effect',
			);
			return labeledHost(value);
		});
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalTry(
				() => [
					labeledHost('shell'),
					universalActivity(props.mode, () => universalComponent('object', Child, {})),
				],
				() => labeledHost('fallback'),
			),
		);

		root.render(Scene, { mode: 'hidden' });
		const shell = container.children[0];
		expect(container.children.map((instance) => instance.props.label)).toEqual(['shell']);
		expect(shell.visible).toBe(true);
		expect(log).toEqual([]);

		root.render(Scene, { mode: 'visible' });
		expect(
			container.children.some(
				(instance) => instance.props.label === 'fallback' && instance.visible,
			),
		).toBe(true);
		root.render(Scene, { mode: 'hidden' });
		expect(container.children.map((instance) => instance.props.label)).toEqual(['shell']);
		expect(container.children[0]).toBe(shell);
		expect(shell.visible).toBe(true);

		resolve('ready');
		await promise;
		await flushUniversalWork(6);
		const child = container.children[1];
		expect(container.children.map((instance) => instance.props.label)).toEqual(['shell', 'ready']);
		expect(child.visible).toBe(false);
		expect(log).toEqual([]);
		root.render(Scene, { mode: 'visible' });
		await flushUniversalWork();
		expect(container.children).toEqual([shell, child]);
		expect(child.visible).toBe(true);
		expect(log).toEqual(['mount']);
		root.unmount();
	});

	// Per ActivitySuspense-test.js:293/384 (React 19.2.7).
	it.each(['component', 'Activity body'] as const)(
		'preserves accepted hidden hosts and queued state when a later render suspends (%s)',
		async (stateOwner) => {
			const container = createObjectContainer();
			const root = createUniversalRoot(container, createObjectDriver());
			let pending: Promise<string> | null = null;
			let resolve!: (value: string) => void;
			let setCount!: (value: number) => void;
			const log: string[] = [];
			const renderChild = () => {
				const [count, update] = useState(0, 'count');
				setCount = update;
				const value = pending === null ? 'ready' : use(pending);
				useEffect(
					() => {
						log.push('mount');
						return () => log.push('cleanup');
					},
					[],
					'effect',
				);
				return labeledHost(`${value}:${count}`);
			};
			const Child = defineUniversalComponent('object', renderChild);
			const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
				universalTry(
					() => [
						labeledHost('shell'),
						universalActivity(props.mode, () =>
							stateOwner === 'component' ? universalComponent('object', Child, {}) : renderChild(),
						),
					],
					() => labeledHost('fallback'),
				),
			);

			root.render(Scene, { mode: 'visible' });
			await flushUniversalWork();
			setCount(3);
			await flushUniversalWork();
			const [shell, child] = container.children;
			expect(child.props.label).toBe('ready:3');
			const abandonedPromise = new Promise<string>((done) => (resolve = done));
			pending = abandonedPromise;
			const abandoned = root.prepare(Scene, { mode: 'hidden' });
			expect(abandoned.status).toBe('prepared');
			expect(child.visible).toBe(true);
			expect(log).toEqual(['mount']);
			abandoned.abort();
			resolve('abandoned');
			await abandonedPromise;
			await flushUniversalWork();
			expect(container.children).toEqual([shell, child]);
			expect(child.visible).toBe(true);
			expect(child.props.label).toBe('ready:3');
			expect(log).toEqual(['mount']);

			pending = new Promise<string>((done) => (resolve = done));
			root.render(Scene, { mode: 'hidden' });
			await flushUniversalWork();
			expect(container.children).toEqual([shell, child]);
			expect(shell.visible).toBe(true);
			expect(child.visible).toBe(false);
			expect(log).toEqual(['mount', 'cleanup']);

			setCount(4);
			await flushUniversalWork();
			expect(container.children).toEqual([shell, child]);
			expect(child.props.label).toBe('ready:3');
			resolve('settled');
			await pending;
			await flushUniversalWork(6);
			expect(container.children).toEqual([shell, child]);
			expect(child.visible).toBe(false);
			expect(child.props.label).toBe('settled:4');
			expect(log).toEqual(['mount', 'cleanup']);
			root.render(Scene, { mode: 'visible' });
			await flushUniversalWork();
			expect(child.visible).toBe(true);
			expect(log).toEqual(['mount', 'cleanup', 'mount']);
			root.unmount();
		},
	);

	// Per ActivitySuspense-test.js:99 (React 19.2.7). Activity contains promises,
	// not errors: rejection still belongs to the enclosing error boundary.
	it('routes a rejected hidden render to the enclosing catch boundary', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let reject!: (error: Error) => void;
		const promise = new Promise<string>((_resolve, fail) => (reject = fail));
		const Child = defineUniversalComponent('object', () => labeledHost(use(promise)));
		const Scene = defineUniversalComponent('object', () =>
			universalTry(
				() => [
					labeledHost('shell'),
					universalActivity('hidden', () => universalComponent('object', Child, {})),
				],
				() => labeledHost('fallback'),
				(error) => labeledHost(`caught:${(error as Error).message}`),
			),
		);

		root.render(Scene, undefined);
		expect(container.children.map((instance) => instance.props.label)).toEqual(['shell']);
		reject(new Error('background failed'));
		await promise.catch(() => undefined);
		await flushUniversalWork(6);
		expect(container.children.map((instance) => instance.props.label)).toEqual([
			'caught:background failed',
		]);
		expect(container.children[0].visible).toBe(true);
		root.unmount();
	});

	it('contains renderer-region suspension inside the owning hidden Activity', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let resolve!: () => void;
		const thenable = new Promise<void>((done) => (resolve = done));
		const regionPlan = universalPlan('object', {
			kind: 'host',
			type: 'html-region',
			bindings: [['region', 0]],
		});
		const Region = defineUniversalComponent('object', () =>
			universalValue(regionPlan, [
				rendererRegion('object', 'dom', ActivityRegionChild, { thenable }),
			]),
		);
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalTry(
				() => [
					labeledHost('shell'),
					universalActivity(props.mode, () => universalComponent('object', Region, {})),
				],
				() => labeledHost('fallback'),
			),
		);

		root.render(Scene, { mode: 'hidden' });
		const [shell, regionHost] = container.children;
		const region = regionHost.props.region;
		if (!isRendererRegion(region)) throw new Error('Expected a committed DOM renderer region.');
		const dom = mountDom(region.component as ComponentBody<unknown>, region.props);
		try {
			await flushUniversalWork(6);
			expect(container.children).toEqual([shell, regionHost]);
			expect(shell.visible).toBe(true);
			expect(regionHost.visible).toBe(false);
			resolve();
			await thenable;
			await flushUniversalWork(6);
			expect(container.children).toEqual([shell, regionHost]);
			expect(regionHost.visible).toBe(false);
			root.render(Scene, { mode: 'visible' });
			expect(regionHost.visible).toBe(true);
		} finally {
			dom.unmount();
			root.unmount();
		}
	});

	it('publishes a hidden recreate atomically after an apply fault and reconnects it on reveal', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let failHiddenRecreate = false;
		const driver = {
			...baseDriver,
			updates: {
				classify(
					_type: string,
					previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					return previous.args === next.args ? ('update' as const) : ('recreate' as const);
				},
			},
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				const hiddenRecreate =
					batch.commands.some((command) => command.op === 'recreate') &&
					batch.commands.some(
						(command) => command.op === 'visibility' && command.state === 'hidden',
					);
				return {
					...prepared,
					apply() {
						prepared.apply();
						if (failHiddenRecreate && hiddenRecreate) {
							failHiddenRecreate = false;
							throw new Error('accepted hidden apply fault');
						}
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		let accepted!: ObjectHostInstance;
		let currentRef: ObjectHostInstance | null = null;
		const identity = (self: ObjectHostInstance) => (self === accepted ? 'accepted' : 'replacement');
		const visibility = (self: ObjectHostInstance) => (self.visible ? 'visible' : 'hidden');
		const attach = (_parent: ObjectHostInstance | null, self: ObjectHostInstance) => {
			log.push(`attach:${identity(self)}:${self.id}:${visibility(self)}`);
			return () =>
				log.push(
					`attach-cleanup:${identity(self)}:${container.children[0] === self ? 'current' : 'stale'}:${visibility(self)}`,
				);
		};
		const ref = (self: ObjectHostInstance | null) => {
			if (self === null) {
				log.push(`ref:null:${currentRef === accepted ? 'accepted' : 'replacement'}`);
				currentRef = null;
				return;
			}
			currentRef = self;
			log.push(`ref:${identity(self)}:${self.id}:${visibility(self)}`);
		};
		const onUpdate = (self: ObjectHostInstance) =>
			log.push(`update:${identity(self)}:${self.id}:${visibility(self)}`);
		const onPress = () => log.push('press');
		const Child = defineUniversalComponent('object', (props: { args: readonly number[] }) => {
			useLayoutEffect(
				() => {
					log.push('layout:mount');
					return () => log.push('layout:cleanup');
				},
				[],
				'layout',
			);
			return universalValue(hostPlan, [
				universalProps([
					['set', 'args', props.args],
					['set', 'attach', attach],
					['set', 'onPress', onPress],
					['set', 'onUpdate', onUpdate],
					['set', 'ref', ref],
				]),
			]);
		});
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; args: readonly number[] }) =>
				universalActivity(props.mode, () =>
					universalComponent('object', Child, { args: props.args }),
				),
		);
		const acceptedArgs = [1] as const;
		const replacementArgs = [2] as const;

		root.render(Scene, { mode: 'visible', args: acceptedArgs });
		accepted = container.children[0];
		const acceptedId = accepted.id;
		expect(currentRef).toBe(accepted);
		log.length = 0;

		failHiddenRecreate = true;
		expect(() => root.render(Scene, { mode: 'hidden', args: replacementArgs })).toThrow(
			'accepted hidden apply fault',
		);
		const replacement = container.children[0];
		expect(replacement).not.toBe(accepted);
		expect(replacement.id).toBe(acceptedId);
		expect(replacement.visible).toBe(false);
		expect(currentRef).toBeNull();
		expect(log).toEqual([
			`attach-cleanup:accepted:current:visible`,
			`attach:replacement:${acceptedId}:hidden`,
			'layout:cleanup',
			'ref:null:accepted',
			`update:replacement:${acceptedId}:hidden`,
		]);
		expect(() => container.dispatchEvent(replacement, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		log.length = 0;
		root.render(Scene, { mode: 'visible', args: replacementArgs });
		expect(container.children[0]).toBe(replacement);
		expect(replacement.visible).toBe(true);
		expect(currentRef).toBe(replacement);
		expect(log).toEqual([`ref:replacement:${acceptedId}:visible`, 'layout:mount']);
		container.dispatchEvent(replacement, 'press', undefined);
		expect(log.at(-1)).toBe('press');

		root.unmount();
		expect(log).toContain('attach-cleanup:replacement:current:visible');
		expect(log).toContain('ref:null:replacement');
	});
});
