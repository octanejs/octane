import { describe, expect, it } from 'vitest';
import {
	type ObjectHostInstance,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalFor,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
} from '../src/universal.js';

const primaryPlan = universalPlan('object', {
	kind: 'host',
	type: 'primary',
	propsSlot: 0,
});

const fallbackPlan = universalPlan('object', {
	kind: 'host',
	type: 'fallback',
	propsSlot: 0,
});

const catchPlan = universalPlan('object', {
	kind: 'host',
	type: 'caught',
	bindings: [['message', 0]],
});

async function flushUniversalWork(count = 4) {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

function expectHostOrder(actual: ObjectHostInstance[], expected: ObjectHostInstance[]) {
	expect(actual).toHaveLength(expected.length);
	for (const [index, host] of expected.entries()) expect(actual[index]).toBe(host);
}

describe('universal retained Suspense visibility', () => {
	it('preserves keyed primary hosts through aborted reorders, suspension, and removal', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let resolveA!: (value: string) => void;
		let resolveB!: (value: string) => void;
		const a = new Promise<string>((resolve) => {
			resolveA = resolve;
		});
		const b = new Promise<string>((resolve) => {
			resolveB = resolve;
		});
		const resources = new Map<string, Promise<string>>([
			['a', a],
			['b', b],
		]);
		const Scene = defineUniversalComponent('object', (props: { ids: string[]; pending: boolean }) =>
			universalFor(
				props.ids,
				(id) => id,
				(id) =>
					universalTry(
						() =>
							universalValue(primaryPlan, [
								universalProps([
									['set', 'id', id],
									[
										'set',
										'value',
										props.pending && resources.has(id) ? use(resources.get(id)!) : id,
									],
								]),
							]),
						() => universalValue(fallbackPlan, [universalProps([['set', 'id', id]])]),
					),
			),
		);
		root.render(Scene, { ids: ['a', 'b', 'c'], pending: false });
		const [primaryA, primaryB, primaryC] = container.children;
		root.prepare(Scene, { ids: ['c', 'a', 'b'], pending: true }).abort();
		expectHostOrder(container.children, [primaryA, primaryB, primaryC]);
		expect(container.children.every((node) => node.visible)).toBe(true);

		root.render(Scene, { ids: ['c', 'a', 'b'], pending: true });
		expectHostOrder(
			container.children.filter((node) => node.type === 'primary'),
			[primaryC, primaryA, primaryB],
		);
		expect([primaryC.visible, primaryA.visible, primaryB.visible]).toEqual([true, false, false]);
		expect(
			container.children.filter((node) => node.type === 'fallback').map((node) => node.props.id),
		).toEqual(['a', 'b']);

		resolveA('resolved a');
		await a;
		await flushUniversalWork();
		expect(primaryA.visible).toBe(true);
		expect(primaryA.props.value).toBe('resolved a');
		expect(primaryB.visible).toBe(false);
		root.render(Scene, { ids: ['d', 'a', 'c'], pending: true });
		const primaryD = container.children[0];
		expectHostOrder(container.children, [primaryD, primaryA, primaryC]);
		expect(primaryD.props.id).toBe('d');
		expect(primaryD).not.toBe(primaryB);

		resolveB('removed b');
		await b;
		await flushUniversalWork();
		expectHostOrder(container.children, [primaryD, primaryA, primaryC]);
		expect(container.children.every((node) => node.visible)).toBe(true);
		root.unmount();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
	});

	it('restores nested primary hosts without revealing an independently pending child', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let outer: Promise<string> | null = null;
		let inner: Promise<string> | null = null;
		let resolveOuter!: (value: string) => void;
		let resolveInner!: (value: string) => void;
		const node = (id: string, value: string) =>
			universalValue(primaryPlan, [
				universalProps([
					['set', 'id', id],
					['set', 'value', value],
				]),
			]);
		const fallback = (id: string) =>
			universalValue(fallbackPlan, [universalProps([['set', 'id', id]])]);
		const Scene = defineUniversalComponent('object', () =>
			universalTry(
				() => [
					node('outer', outer === null ? 'ready' : use(outer)),
					universalTry(
						() => node('inner', inner === null ? 'ready' : use(inner)),
						() => fallback('inner'),
					),
				],
				() => fallback('outer'),
			),
		);
		root.render(Scene, undefined);
		const [outerHost, innerHost] = container.children;
		inner = new Promise<string>((resolve) => {
			resolveInner = resolve;
		});
		root.render(Scene, undefined);
		expect(outerHost.visible).toBe(true);
		expect(innerHost.visible).toBe(false);
		const innerFallback = container.children[2];
		outer = new Promise<string>((resolve) => {
			resolveOuter = resolve;
		});
		root.render(Scene, undefined);
		expect([outerHost.visible, innerHost.visible, innerFallback.visible]).toEqual([
			false,
			false,
			false,
		]);
		expect(container.children.at(-1)).toMatchObject({
			type: 'fallback',
			props: { id: 'outer' },
			visible: true,
		});

		resolveOuter('outer resolved');
		await outer;
		await flushUniversalWork();
		expectHostOrder(container.children, [outerHost, innerHost, innerFallback]);
		expect([outerHost.visible, innerHost.visible, innerFallback.visible]).toEqual([
			true,
			false,
			true,
		]);
		expect(outerHost.props.value).toBe('outer resolved');
		resolveInner('inner resolved');
		await inner;
		await flushUniversalWork();
		expectHostOrder(container.children, [outerHost, innerHost]);
		expect(innerHost.visible).toBe(true);
		expect(innerHost.props.value).toBe('inner resolved');
		root.unmount();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
	});

	it('keeps one hidden primary beside one active fallback across pending rerenders', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const refs: Array<ObjectHostInstance | null> = [];
		const primaryRef = (value: ObjectHostInstance | null) => refs.push(value);
		const primaryPress = () => log.push('primary press');
		const fallbackPress = () => log.push('fallback press');
		let pending: Promise<string> | null = null;
		let resolve!: (value: string) => void;
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => {
					useInsertionEffect(
						() => {
							log.push('insertion mount');
							return () => log.push('insertion cleanup');
						},
						[],
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
					const value = pending === null ? 'ready' : use(pending);
					return universalValue(primaryPlan, [
						universalProps([
							['set', 'value', value],
							['set', 'onPress', primaryPress],
							['set', 'ref', primaryRef],
						]),
					]);
				},
				() =>
					universalValue(fallbackPlan, [
						universalProps([
							['set', 'value', 'pending'],
							['set', 'onPress', fallbackPress],
						]),
					]),
			),
		);

		root.render(Boundary, undefined);
		await flushUniversalWork();
		const primary = container.children[0];
		expect(log).toEqual(['insertion mount', 'layout mount', 'passive mount']);
		expect(refs).toEqual([primary]);

		pending = new Promise<string>((done) => {
			resolve = done;
		});
		log.length = 0;
		root.render(Boundary, undefined);
		await flushUniversalWork();
		const fallback = container.children[1];
		expect(container.children).toHaveLength(2);
		expect(container.children[0]).toBe(primary);
		expect(primary.visible).toBe(false);
		expect(fallback).toMatchObject({ type: 'fallback', visible: true });
		expect(refs).toEqual([primary, null]);
		expect(log).toEqual(['layout cleanup', 'passive cleanup']);
		expect(() => container.dispatchEvent(primary, 'press', undefined)).toThrow(
			/no "press" listener/,
		);
		container.dispatchEvent(fallback, 'press', undefined);
		expect(log.at(-1)).toBe('fallback press');

		root.render(Boundary, undefined);
		await flushUniversalWork();
		expect(container.children).toEqual([primary, fallback]);
		expect(container.instanceCount).toBe(2);
		expect(refs).toEqual([primary, null]);

		resolve('settled');
		await pending;
		await flushUniversalWork();
		expect(container.children).toEqual([primary]);
		expect(primary.visible).toBe(true);
		expect(primary.props.value).toBe('settled');
		expect(refs).toEqual([primary, null, primary]);
		expect(log.slice(-2)).toEqual(['layout mount', 'passive mount']);
		container.dispatchEvent(primary, 'press', undefined);
		expect(log.at(-1)).toBe('primary press');
		root.unmount();
		await flushUniversalWork();
		expect(log).toContain('insertion cleanup');
	});

	it('routes a retained rejection to catch without revealing or leaking the primary', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let pending: Promise<string> | null = null;
		let reject!: (error: Error) => void;
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => universalValue(primaryPlan, [universalProps([['set', 'value', useReady()]])]),
				() => universalValue(fallbackPlan, [universalProps([])]),
				(error) => universalValue(catchPlan, [(error as Error).message]),
			),
		);
		function useReady() {
			return pending === null ? 'ready' : use(pending);
		}

		root.render(Boundary, undefined);
		const primary = container.children[0];
		pending = new Promise<string>((_resolve, fail) => {
			reject = fail;
		});
		root.render(Boundary, undefined);
		expect(container.children[0]).toBe(primary);
		expect(primary.visible).toBe(false);
		expect(container.children[1].type).toBe('fallback');

		reject(new Error('asset failed'));
		await pending.catch(() => undefined);
		await flushUniversalWork();
		expect(container.children).toHaveLength(1);
		expect(container.children[0]).toMatchObject({
			type: 'caught',
			props: { message: 'asset failed' },
		});
		expect(container.children[0]).not.toBe(primary);
		expect(container.instanceCount).toBe(1);
		root.unmount();
	});

	it('rejects retained hiding before publication when the driver lacks visibility', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, visibility: false },
		};
		const root = createUniversalRoot(container, driver);
		let pending: Promise<string> | null = null;
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => universalValue(primaryPlan, [universalProps([['set', 'value', read()]])]),
				() => universalValue(fallbackPlan, [universalProps([])]),
			),
		);
		function read() {
			return pending === null ? 'ready' : use(pending);
		}

		root.render(Boundary, undefined);
		const primary = container.children[0];
		pending = new Promise<string>(() => {});
		expect(() => root.render(Boundary, undefined)).toThrow(
			/visibility capability required by retained Suspense/,
		);
		expect(container.children).toEqual([primary]);
		expect(primary.visible).toBe(true);
		root.unmount();
	});
});
