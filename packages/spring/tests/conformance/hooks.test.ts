import { afterEach, describe, expect, it, vi } from 'vitest';
import { raf } from '@react-spring/rafz';
import { Controller } from '@octanejs/spring';
import { flushEffects, mount } from '../../../motion/tests/_helpers';
import {
	// Additional upstream provenance for shared adapted evidence:
	// Per packages/core/src/hooks/useSpringValue.test.ts:6

	ContextSpringFixture,
	ContextDepsSpringFixture,
	ChainFixture,
	NestedContextSpringFixture,
	ObjectSpringHookFixture,
	SpringHookFixture,
	SpringsCohortFixture,
	TrailHookFixture,
	UpdatingTrailHookFixture,
} from '../_fixtures/hooks.tsrx';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	raf.frameLoop = 'always';
});

describe('React Spring hooks', () => {
	// Per packages/core/src/hooks/useSpring.test.tsx:29
	it('does not cancel object-form springs on parent rerenders', () => {
		const onReady = () => {};
		const result = mount(ObjectSpringHookFixture, { x: 10, onReady });
		flushEffects();
		const stop = vi.spyOn(Controller.prototype, 'stop');

		result.update(ObjectSpringHookFixture, { x: 10, onReady });
		flushEffects();
		expect(stop).not.toHaveBeenCalled();

		result.unmount();
		expect(stop).toHaveBeenCalledWith(true);
	});

	// Per packages/core/src/hooks/useSpring.test.tsx:36
	it('keeps spring values and the imperative API stable across updates', () => {
		raf.frameLoop = 'demand';
		const apis: unknown[] = [];
		let renders = 0;
		const result = mount(SpringHookFixture, {
			x: 10,
			onReady: (api: unknown) => apis.push(api),
			onRender: () => renders++,
		});
		flushEffects();
		raf.advance();
		expect((result.find('#hook-spring') as HTMLElement).style.left).toBe('10px');

		result.update(SpringHookFixture, {
			x: 25,
			onReady: (api: unknown) => apis.push(api),
			onRender: () => renders++,
		});
		flushEffects();
		raf.advance();

		expect((result.find('#hook-spring') as HTMLElement).style.left).toBe('25px');
		expect(apis[1]).toBe(apis[0]);
		expect(renders).toBe(2);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTrail.test.tsx:19
	it('adds trail staggering to the caller delay', async () => {
		vi.useFakeTimers();
		let styles: any[];
		const result = mount(TrailHookFixture, {
			delay: 100,
			onReady: (value: any[]) => (styles = value),
		});
		flushEffects();

		await vi.advanceTimersByTimeAsync(99);
		expect(styles![0]?.x).toBeUndefined();
		expect(styles![1]?.x).toBeUndefined();

		await vi.advanceTimersByTimeAsync(1);
		expect(styles![0].x.get()).toBe(1);
		expect(styles![1]?.x).toBeUndefined();

		await vi.advanceTimersByTimeAsync(16);
		expect(styles![1].x.get()).toBe(1);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTrail.test.tsx:29
	it('restarts object-form trails when props change', () => {
		let styles: any[] = [];
		const onReady = (value: any[]) => (styles = value);
		const result = mount(UpdatingTrailHookFixture, { x: 1, onReady });
		flushEffects();
		expect(styles.map((style) => style.x.get())).toEqual([1]);

		result.update(UpdatingTrailHookFixture, { x: 2, onReady });
		flushEffects();
		expect(styles.map((style) => style.x.get())).toEqual([2]);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTrail.test.tsx:44
	it('does not cancel object-form trails on unchanged parent rerenders', () => {
		const onReady = () => {};
		const result = mount(UpdatingTrailHookFixture, { x: 1, onReady });
		flushEffects();
		const stop = vi.spyOn(Controller.prototype, 'stop');

		result.update(UpdatingTrailHookFixture, { x: 1, onReady });
		flushEffects();
		expect(stop).not.toHaveBeenCalled();
		result.unmount();
		expect(stop).toHaveBeenCalledWith(true);
	});

	// Per packages/core/src/SpringContext.test.tsx:69
	it('applies SpringContext values and resumes after context pause', () => {
		let styles: any;
		const onReady = (value: any) => (styles = value);
		const result = mount(ContextSpringFixture, { pause: true, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(0);

		result.update(ContextSpringFixture, { pause: false, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(1);
		result.unmount();
	});

	// Per packages/core/src/SpringContext.test.tsx:21
	it('applies SpringContext changes when useSpring has explicit deps', () => {
		let styles: any;
		const onReady = (value: any) => (styles = value);
		const result = mount(ContextDepsSpringFixture, { pause: true, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(0);

		result.update(ContextDepsSpringFixture, { pause: false, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(1);
		result.unmount();
	});

	// Per packages/core/src/hooks/useSprings.test.tsx:30
	it('reuses a spring cohort, only evaluates changed deps, and resizes the ref', () => {
		const created: number[] = [];
		let styles: any[] = [];
		let api: any;
		const onReady = (nextStyles: any[], nextApi: any) => {
			styles = nextStyles;
			api = nextApi;
		};
		const onCreate = (index: number) => created.push(index);
		const result = mount(SpringsCohortFixture, { count: 2, goal: 1, onCreate, onReady });
		flushEffects();
		const first = styles.slice();
		expect(created).toEqual([0, 1]);

		result.update(SpringsCohortFixture, { count: 2, goal: 1, onCreate, onReady });
		flushEffects();
		expect(created).toEqual([0, 1]);
		expect(styles).toEqual(first);

		result.update(SpringsCohortFixture, { count: 3, goal: 1, onCreate, onReady });
		flushEffects();
		expect(created).toEqual([0, 1, 2]);
		expect(api.current).toHaveLength(3);
		expect(styles.slice(0, 2)).toEqual(first);

		result.update(SpringsCohortFixture, { count: 1, goal: 2, onCreate, onReady });
		flushEffects();
		expect(created).toEqual([0, 1, 2, 0]);
		expect(api.current).toHaveLength(1);
		expect(styles[0]).toBe(first[0]);
		result.unmount();
	});

	// Per packages/core/src/SpringContext.test.tsx:21
	it('merges nested SpringContext values while allowing replacement', () => {
		let styles: any;
		const onReady = (value: any) => (styles = value);
		const result = mount(NestedContextSpringFixture, { pause: true, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(0);

		result.update(NestedContextSpringFixture, { pause: false, onReady });
		flushEffects();
		expect(styles.x.get()).toBe(1);
		result.unmount();
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:220
	it('starts useChain refs at explicit timesteps and clears pending starts on cleanup', async () => {
		vi.useFakeTimers();
		const starts: string[] = [];
		const refs = ['a', 'b', 'c'].map((name) => ({
			start: () => {
				starts.push(name);
				return Promise.resolve([]);
			},
		}));
		const result = mount(ChainFixture, { refs, timeSteps: [0.2, 0, 0.1], timeFrame: 100 });
		flushEffects();
		await vi.advanceTimersByTimeAsync(0);
		expect(starts).toEqual(['b']);
		await vi.advanceTimersByTimeAsync(10);
		expect(starts).toEqual(['b', 'c']);
		result.unmount();
		await vi.runAllTimersAsync();
		expect(starts).toEqual(['b', 'c']);
	});

	// Per packages/core/src/hooks/useTransition.test.tsx:220
	it('starts useChain refs sequentially when timesteps are omitted', async () => {
		let finishFirst!: () => void;
		const starts: string[] = [];
		const refs = [
			{
				start: () => {
					starts.push('a');
					return new Promise<void>((resolve) => (finishFirst = resolve));
				},
			},
			{ start: () => (starts.push('b'), Promise.resolve()) },
		] as any;
		const result = mount(ChainFixture, { refs });
		flushEffects();
		await Promise.resolve();
		expect(starts).toEqual(['a']);
		finishFirst();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(starts).toEqual(['a', 'b']);
		result.unmount();
	});
});
