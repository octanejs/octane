import { describe, expect, it } from 'vitest';
import {
	type ObjectHostInstance,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
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

describe('universal retained Suspense visibility', () => {
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
