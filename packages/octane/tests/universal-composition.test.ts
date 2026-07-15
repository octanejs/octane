import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	type ObjectHostInstance,
} from '../src/universal.js';
import { AtomicScene, CompositionScene } from './_fixtures/universal-composition.object.tsrx';

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function allInstances(parent: { children: readonly ObjectHostInstance[] }): ObjectHostInstance[] {
	const output: ObjectHostInstance[] = [];
	for (const child of parent.children) {
		output.push(child, ...allInstances(child));
	}
	return output;
}

function findInstance(
	parent: { children: readonly ObjectHostInstance[] },
	type: string,
	predicate: (instance: ObjectHostInstance) => boolean = () => true,
): ObjectHostInstance {
	const instance = allInstances(parent).find(
		(candidate) => candidate.type === type && predicate(candidate),
	);
	if (instance === undefined) throw new Error(`Missing object host instance ${type}.`);
	return instance;
}

function findInstances(
	parent: { children: readonly ObjectHostInstance[] },
	type: string,
): ObjectHostInstance[] {
	return allInstances(parent).filter((instance) => instance.type === type);
}

function makeItem(id: string, initial: number, listen = true) {
	return {
		id,
		listen,
		componentFirst: {
			key: `discarded-component-key:${id}`,
			initial,
			label: `component-first:${id}`,
			children: `discarded-component-child:${id}`,
		},
		componentLast: { label: `component-last:${id}` },
		hostFirst: {
			key: `discarded-host-key:${id}`,
			label: `host-first:${id}`,
			stale: `stale:${id}`,
			children: `discarded-host-child:${id}`,
			onPress: () => {
				throw new Error('the overwritten spread event must not be registered');
			},
		},
		hostLast: { label: `host-last:${id}` },
	};
}

function sceneProps(
	log: (entry: string) => void,
	refFor: (id: string) => (value: unknown) => void,
	overrides: Record<string, unknown> = {},
) {
	return {
		log,
		refFor,
		sceneFirst: {
			tone: 'spread-first',
			obsolete: 'remove-me',
			children: 'discarded-scene-child',
		},
		sceneLast: { tone: 'spread-last' },
		theme: 'night',
		statusMode: 'null',
		statusValue: 'status',
		tail: 'tail',
		showInline: false,
		showIf: false,
		variant: 'unknown',
		items: [],
		handler: 'initial',
		failResult: false,
		resource: null,
		resultValue: 'ready',
		...overrides,
	};
}

function refsAndLog() {
	const log: string[] = [];
	const refs = new Map<string, (value: unknown) => void>();
	const refFor = (id: string) => {
		let ref = refs.get(id);
		if (ref === undefined) {
			ref = (value: unknown) =>
				log.push(`ref:${id}:${value === null ? 'null' : (value as ObjectHostInstance).type}`);
			refs.set(id, ref);
		}
		return ref;
	};
	return { log, refFor };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

function indexOf(log: readonly string[], value: string): number {
	const index = log.indexOf(value);
	if (index === -1) throw new Error(`Missing log entry ${value}.`);
	return index;
}

describe('universal component composition', () => {
	it('executes local, imported, aliased, spread, child, and template-control authoring', async () => {
		const { container, root } = objectRoot();
		const { log, refFor } = refsAndLog();

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				failResult: true,
				resultValue: 'bad',
			}),
		);
		const scene = findInstance(container, 'scene');
		expect(scene.props).toMatchObject({ tone: 'spread-last', obsolete: 'remove-me' });
		expect(Object.hasOwn(scene.props, 'children')).toBe(false);
		expect(findInstance(scene, 'if-branch').props.value).toBe('else');
		expect(findInstance(scene, 'switch-branch').props.value).toBe('default');
		expect(findInstance(scene, 'empty-list').props.value).toBe('empty');
		expect(findInstance(scene, 'caught-result').props.value).toBe('failed:bad');
		expect(findInstances(scene, 'item')).toEqual([]);

		const a = makeItem('a', 2);
		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				sceneFirst: { tone: 'first-without-obsolete' },
				sceneLast: { tone: 'updated-last' },
				statusMode: 'array',
				statusValue: 'array-status',
				tail: 'array-tail',
				showInline: true,
				showIf: true,
				variant: 'a',
				items: [a],
			}),
		);
		expect(scene.props).toEqual({ tone: 'updated-last' });
		expect(findInstance(scene, 'badge').props.value).toBe('array-status');
		expect(findInstances(scene, '#text').some((text) => text.props.value === 'array-tail')).toBe(
			true,
		);
		expect(findInstance(scene, 'inline-marker').props.value).toBe('array-status');
		expect(findInstance(scene, 'if-branch').props.value).toBe('then');
		expect(findInstance(scene, 'switch-branch').props.value).toBe('a');
		expect(findInstances(scene, 'empty-list')).toEqual([]);
		const retainedCatch = findInstance(scene, 'caught-result');
		expect(retainedCatch.props.value).toBe('failed:bad');
		expect(findInstances(scene, 'result')).toEqual([]);
		container.dispatchEvent(retainedCatch, 'reset', undefined);
		await Promise.resolve();
		await Promise.resolve();
		expect(findInstance(scene, 'result').props.value).toBe('ready');

		const item = findInstance(scene, 'item', (candidate) => candidate.props.id === 'a');
		expect(item.props).toMatchObject({
			id: 'a',
			theme: 'night',
			count: 2,
			label: 'host-last:a',
			stale: 'stale:a',
		});
		expect(Object.hasOwn(item.props, 'children')).toBe(false);
		expect(item.children).toHaveLength(1);
		expect(item.children[0]).toMatchObject({ type: 'payload', props: { owner: 'a' } });
		expect(log).toContain('ref:a:item');

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				statusMode: 'primitive',
				tail: 'primitive-tail',
				items: [
					{
						...a,
						hostFirst: { label: 'host-first:a' },
						hostLast: { label: 'host-updated:a' },
					},
				],
			}),
		);
		expect(findInstances(scene, 'badge')).toEqual([]);
		expect(
			findInstances(scene, '#text').some((text) => text.props.value === 'primitive-tail'),
		).toBe(true);
		expect(item.props.label).toBe('host-updated:a');
		expect(Object.hasOwn(item.props, 'stale')).toBe(false);

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				statusMode: 'fragment',
				statusValue: 'fragment-status',
				tail: 'fragment-tail',
				items: [a],
			}),
		);
		expect(findInstance(scene, 'badge').props.value).toBe('fragment-status');
		expect(findInstance(scene, 'fragment-marker').props.value).toBe('fragment-tail');

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				statusMode: 'host',
				statusValue: 'host-status',
				items: [a],
			}),
		);
		expect(findInstance(scene, 'badge').props.value).toBe('host-status');

		root.unmount();
		await Promise.resolve();
	});

	it('preserves keyed public instances and child hook state across reorders', async () => {
		const { container, root } = objectRoot();
		const { log, refFor } = refsAndLog();
		const a = makeItem('a', 1);
		const b = makeItem('b', 10);

		root.render(CompositionScene, sceneProps(log.push.bind(log), refFor, { items: [a, b] }));
		const scene = findInstance(container, 'scene');
		const aInstance = findInstance(scene, 'item', (instance) => instance.props.id === 'a');
		const bInstance = findInstance(scene, 'item', (instance) => instance.props.id === 'b');
		const commitsBeforeEvent = container.commits.length;

		container.dispatchEvent(aInstance, 'press', { delta: 2 });
		await Promise.resolve();
		await Promise.resolve();
		expect(aInstance.props.count).toBe(3);
		expect(log).toContain('press:initial:a:2');
		expect(container.commits).toHaveLength(commitsBeforeEvent + 1);

		const commitsBeforeReorder = container.commits.length;
		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				items: [b, a],
				theme: 'dawn',
				handler: 'replacement',
			}),
		);
		const reordered = findInstances(scene, 'item');
		expect(reordered).toEqual([bInstance, aInstance]);
		expect(aInstance.props).toMatchObject({ count: 3, theme: 'dawn' });
		expect(bInstance.props).toMatchObject({ count: 10, theme: 'dawn' });
		expect(container.commits).toHaveLength(commitsBeforeReorder + 1);

		container.dispatchEvent(aInstance, 'press', { delta: 1 });
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toContain('press:replacement:a:1');
		expect(aInstance.props.count).toBe(4);

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				items: [{ ...b, listen: false }, a],
			}),
		);
		expect(() => container.dispatchEvent(bInstance, 'press', { delta: 5 })).toThrow(
			/no .*listener/i,
		);
		expect(bInstance.props.count).toBe(10);

		root.unmount();
		expect(() => container.dispatchEvent(aInstance, 'press', { delta: 1 })).toThrow(
			/unknown (?:event )?target|no .*listener/i,
		);
		await Promise.resolve();
	});

	it('orders nested effects and refs for mount, replacement, and teardown', async () => {
		const { root } = objectRoot();
		const { log, refFor } = refsAndLog();
		const a = makeItem('a', 1);
		const b = makeItem('b', 1);

		root.render(CompositionScene, sceneProps(log.push.bind(log), refFor, { items: [a] }));
		expect(log.slice(0, 7)).toEqual([
			'leaf-insertion:a',
			'item-insertion:a',
			'scene-insertion',
			'ref:a:item',
			'leaf-layout:a',
			'item-layout:a',
			'scene-layout',
		]);
		await Promise.resolve();
		expect(log.slice(-3)).toEqual(['leaf-passive:a', 'item-passive:a', 'scene-passive']);

		log.length = 0;
		root.render(CompositionScene, sceneProps(log.push.bind(log), refFor, { items: [b] }));
		expect(indexOf(log, 'item-insertion-cleanup:a')).toBeLessThan(
			indexOf(log, 'leaf-insertion-cleanup:a'),
		);
		expect(indexOf(log, 'leaf-insertion-cleanup:a')).toBeLessThan(indexOf(log, 'leaf-insertion:b'));
		expect(indexOf(log, 'item-layout-cleanup:a')).toBeLessThan(
			indexOf(log, 'leaf-layout-cleanup:a'),
		);
		expect(indexOf(log, 'leaf-layout-cleanup:a')).toBeLessThan(indexOf(log, 'ref:a:null'));
		expect(indexOf(log, 'ref:a:null')).toBeLessThan(indexOf(log, 'ref:b:item'));
		expect(indexOf(log, 'ref:b:item')).toBeLessThan(indexOf(log, 'leaf-layout:b'));
		expect(indexOf(log, 'leaf-layout:b')).toBeLessThan(indexOf(log, 'item-layout:b'));
		await Promise.resolve();
		expect(indexOf(log, 'item-passive-cleanup:a')).toBeLessThan(
			indexOf(log, 'leaf-passive-cleanup:a'),
		);
		expect(indexOf(log, 'leaf-passive-cleanup:a')).toBeLessThan(indexOf(log, 'leaf-passive:b'));

		log.length = 0;
		root.unmount();
		expect(log.slice(0, 7)).toEqual([
			'scene-insertion-cleanup',
			'item-insertion-cleanup:b',
			'leaf-insertion-cleanup:b',
			'scene-layout-cleanup',
			'item-layout-cleanup:b',
			'leaf-layout-cleanup:b',
			'ref:b:null',
		]);
		expect(indexOf(log, 'scene-insertion-cleanup')).toBeLessThan(
			indexOf(log, 'item-insertion-cleanup:b'),
		);
		expect(indexOf(log, 'item-insertion-cleanup:b')).toBeLessThan(
			indexOf(log, 'leaf-insertion-cleanup:b'),
		);
		expect(indexOf(log, 'scene-layout-cleanup')).toBeLessThan(
			indexOf(log, 'item-layout-cleanup:b'),
		);
		expect(indexOf(log, 'item-layout-cleanup:b')).toBeLessThan(
			indexOf(log, 'leaf-layout-cleanup:b'),
		);
		expect(indexOf(log, 'leaf-layout-cleanup:b')).toBeLessThan(indexOf(log, 'ref:b:null'));
		await Promise.resolve();
		expect(indexOf(log, 'scene-passive-cleanup')).toBeLessThan(
			indexOf(log, 'item-passive-cleanup:b'),
		);
		expect(indexOf(log, 'item-passive-cleanup:b')).toBeLessThan(
			indexOf(log, 'leaf-passive-cleanup:b'),
		);
	});

	it('commits pending and caught branches without exposing partial content', async () => {
		const { container, root } = objectRoot();
		const { log, refFor } = refsAndLog();
		const resource = deferred<string>();

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, { resource: resource.promise }),
		);
		expect(findInstance(container, 'pending-result').props.value).toBe('pending');
		expect(findInstances(container, 'result')).toEqual([]);
		const pendingCommits = container.commits.length;

		resource.resolve('resolved');
		await resource.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(findInstance(container, 'result').props.value).toBe('resolved');
		expect(findInstances(container, 'pending-result')).toEqual([]);
		expect(container.commits).toHaveLength(pendingCommits + 1);

		root.render(
			CompositionScene,
			sceneProps(log.push.bind(log), refFor, {
				failResult: true,
				resultValue: 'caught',
			}),
		);
		expect(findInstance(container, 'caught-result').props.value).toBe('failed:caught');
		expect(findInstances(container, 'result')).toEqual([]);
		root.unmount();
		await Promise.resolve();
	});
});

describe('nested universal transaction atomicity', () => {
	it('keeps committed hosts, refs, events, effects, hooks, and allocations intact on discarded work', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const refs: unknown[] = [];
		const hostRef = (value: unknown) => refs.push(value);
		const base = {
			initial: 1,
			value: 'A',
			mode: 'ready',
			resource: null,
			bumpDraft: false,
			listen: true,
			handler: 'old',
			hostRef,
			log: (entry: string) => log.push(entry),
		};

		root.render(AtomicScene, base);
		const host = findInstance(container, 'atomic-node');
		expect(host.props).toMatchObject({ value: 'A', count: 1 });
		expect(refs).toEqual([host]);
		const initialCommits = container.commits.length;
		const initialAllocations = container.instanceCount;
		const initialLog = [...log];

		expect(() =>
			root.prepare(AtomicScene, {
				...base,
				value: 'error',
				mode: 'error',
				bumpDraft: true,
				handler: 'discarded-error',
			}),
		).toThrow('atomic render failed');
		expect(container.commits).toHaveLength(initialCommits);
		expect(container.instanceCount).toBe(initialAllocations);
		expect(findInstance(container, 'atomic-node')).toBe(host);
		expect(host.props).toMatchObject({ value: 'A', count: 1 });
		expect(refs).toEqual([host]);
		expect(log).toEqual(initialLog);

		container.dispatchEvent(host, 'press', { delta: 1 });
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toContain('atomic-press:old:1');
		expect(host.props.count).toBe(2);
		const committedAfterEvent = container.commits.length;
		const allocationsAfterEvent = container.instanceCount;
		const refsAfterEvent = [...refs];

		const resource = deferred<string>();
		const suspended = root.prepare(AtomicScene, {
			...base,
			value: 'suspend',
			mode: 'suspend',
			resource: resource.promise,
			bumpDraft: true,
			handler: 'discarded-suspend',
		});
		expect(suspended.status).toBe('suspended');
		expect(container.commits).toHaveLength(committedAfterEvent);
		expect(container.instanceCount).toBe(allocationsAfterEvent);
		expect(host.props).toMatchObject({ value: 'A', count: 2 });
		expect(refs).toEqual(refsAfterEvent);
		suspended.abort();
		resource.resolve('ignored');
		await resource.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.commits).toHaveLength(committedAfterEvent);
		container.dispatchEvent(host, 'press', { delta: 0 });
		expect(log).toContain('atomic-press:old:0');
		expect(container.commits).toHaveLength(committedAfterEvent);

		const aborted = root.prepare(AtomicScene, {
			...base,
			value: 'aborted',
			handler: 'discarded-abort',
		});
		expect(aborted.status).toBe('prepared');
		if (aborted.status === 'prepared') aborted.abort();
		expect(container.commits).toHaveLength(committedAfterEvent);
		expect(host.props).toMatchObject({ value: 'A', count: 2 });

		const superseded = root.prepare(AtomicScene, {
			...base,
			value: 'superseded',
			handler: 'discarded-superseded',
		});
		const winner = root.prepare(AtomicScene, {
			...base,
			value: 'winner',
			handler: 'winner',
		});
		expect(superseded.status).toBe('aborted');
		expect(container.commits).toHaveLength(committedAfterEvent);
		if (winner.status !== 'prepared') throw new Error('Expected a prepared winning update.');
		container.dispatchEvent(host, 'press', { delta: 0 });
		expect(log).toContain('atomic-press:old:0');
		expect(host.props.count).toBe(2);
		winner.commit();
		expect(container.commits).toHaveLength(committedAfterEvent + 1);
		expect(findInstance(container, 'atomic-node')).toBe(host);
		expect(host.props).toMatchObject({ value: 'winner', count: 2 });
		expect(container.instanceCount).toBe(allocationsAfterEvent);
		expect(refs).toEqual(refsAfterEvent);
		expect(indexOf(log, 'atomic-cleanup:A')).toBeLessThan(indexOf(log, 'atomic-layout:winner'));
		expect(log).not.toContain('atomic-layout:error');
		expect(log).not.toContain('atomic-layout:suspend');
		expect(log).not.toContain('atomic-layout:aborted');
		expect(log).not.toContain('atomic-layout:superseded');

		container.dispatchEvent(host, 'press', { delta: 2 });
		await Promise.resolve();
		await Promise.resolve();
		expect(log).toContain('atomic-press:winner:2');
		expect(host.props.count).toBe(4);

		root.render(AtomicScene, { ...base, value: 'without-listener', listen: false });
		expect(() => container.dispatchEvent(host, 'press', { delta: 5 })).toThrow(/no .*listener/i);
		expect(host.props.count).toBe(4);
		root.unmount();
		expect(refs.at(-1)).toBe(null);
		await Promise.resolve();
	});
});
