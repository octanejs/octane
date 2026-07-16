import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	addAfterEffect,
	addEffect,
	addTail,
	createRoot,
	type Frameloop,
	type Renderer,
	type RootState,
	type RootStore,
	type ThreeRoot,
} from '@octanejs/three';
import { RootScene } from './_fixtures/root-scene.three.tsrx';

interface RootHarness {
	render: ReturnType<typeof vi.fn>;
	root: ThreeRoot<HTMLCanvasElement>;
	state: RootState;
	store: RootStore;
}

class ControlledAnimationFrames {
	#callbacks = new Map<number, FrameRequestCallback>();
	#nextId = 1;
	maxPending = 0;

	request = (callback: FrameRequestCallback): number => {
		const id = this.#nextId++;
		this.#callbacks.set(id, callback);
		this.maxPending = Math.max(this.maxPending, this.#callbacks.size);
		return id;
	};

	cancel = (id: number): void => {
		this.#callbacks.delete(id);
	};

	get pending(): number {
		return this.#callbacks.size;
	}

	step(timestamp: number): boolean {
		const first = this.#callbacks.entries().next();
		if (first.done) return false;
		const [id, callback] = first.value;
		this.#callbacks.delete(id);
		callback(timestamp);
		return true;
	}
}

describe('Three frame loop', () => {
	let animationFrames: ControlledAnimationFrames;
	let roots: RootHarness[];
	let removeEffects: Array<() => void>;

	beforeEach(() => {
		animationFrames = new ControlledAnimationFrames();
		roots = [];
		removeEffects = [];
		vi.stubGlobal('requestAnimationFrame', animationFrames.request);
		vi.stubGlobal('cancelAnimationFrame', animationFrames.cancel);
	});

	afterEach(() => {
		for (const removeEffect of removeEffects) removeEffect();
		for (const { root } of roots) root.unmount();
		for (let step = 0; animationFrames.pending > 0 && step < 10; step++) {
			animationFrames.step(10_000 + step);
		}
		vi.unstubAllGlobals();
	});

	async function createRootHarness(frameloop: Frameloop): Promise<RootHarness> {
		const render = vi.fn();
		const renderer = { render } as unknown as Renderer;
		const root = createRoot(document.createElement('canvas'));
		await root.configure({
			gl: renderer,
			size: { width: 64, height: 64 },
			dpr: 1,
			frameloop,
		});
		root.render(RootScene, { name: `loop-${frameloop}`, groupRef: () => {} });
		const store = root.store;
		const state = store.getState();
		const harness = { render, root, state, store };
		roots.push(harness);
		return harness;
	}

	it('coalesces demand invalidations into one rendered frame', async () => {
		const root = await createRootHarness('demand');

		root.state.invalidate();
		root.state.invalidate();
		root.state.invalidate();
		expect(animationFrames.pending).toBe(1);

		expect(animationFrames.step(16)).toBe(true);
		expect(root.render).toHaveBeenCalledTimes(1);
		expect(animationFrames.pending).toBe(0);
		expect(animationFrames.step(32)).toBe(false);
	});

	it('uses one animation-frame chain for every always root', async () => {
		const first = await createRootHarness('always');
		const second = await createRootHarness('always');

		first.state.invalidate();
		second.state.invalidate();
		expect(animationFrames.pending).toBe(1);

		animationFrames.step(16);
		expect(first.render).toHaveBeenCalledTimes(1);
		expect(second.render).toHaveBeenCalledTimes(1);
		expect(animationFrames.pending).toBe(1);

		animationFrames.step(32);
		expect(first.render).toHaveBeenCalledTimes(2);
		expect(second.render).toHaveBeenCalledTimes(2);
		expect(animationFrames.maxPending).toBe(1);
	});

	it('renders never roots only when they are explicitly advanced', async () => {
		const root = await createRootHarness('never');

		root.state.invalidate();
		expect(animationFrames.pending).toBe(0);
		expect(root.render).not.toHaveBeenCalled();

		root.state.advance(1);
		expect(root.render).toHaveBeenCalledTimes(1);
		expect(animationFrames.pending).toBe(0);

		root.state.advance(2);
		expect(root.render).toHaveBeenCalledTimes(2);
	});

	it('runs global frame phases and stops tail effects after unsubscribe', async () => {
		const root = await createRootHarness('demand');
		const before: number[] = [];
		const after: number[] = [];
		const tail: number[] = [];
		const removeBefore = addEffect((timestamp) => before.push(timestamp));
		const removeAfter = addAfterEffect((timestamp) => after.push(timestamp));
		const removeTail = addTail((timestamp) => tail.push(timestamp));
		removeEffects.push(removeBefore, removeAfter, removeTail);

		root.state.invalidate();
		animationFrames.step(24);
		expect(before).toEqual([24]);
		expect(after).toEqual([24]);
		expect(tail).toEqual([24]);

		removeBefore();
		removeAfter();
		removeTail();
		root.state.invalidate();
		animationFrames.step(48);
		expect(before).toEqual([24]);
		expect(after).toEqual([24]);
		expect(tail).toEqual([24]);
		expect(root.render).toHaveBeenCalledTimes(2);
	});

	it('orders frame subscribers by priority and lets positive priority take over rendering', async () => {
		const root = await createRootHarness('demand');
		const order: string[] = [];
		const removeBefore = addEffect(() => order.push('before'));
		const removeAfter = addAfterEffect(() => order.push('after'));
		removeEffects.push(removeBefore, removeAfter);
		const removeLate = root.state.internal.subscribe(
			{ current: () => order.push('priority:2') },
			2,
			root.store,
		);
		const removeEarly = root.state.internal.subscribe(
			{ current: () => order.push('priority:-1') },
			-1,
			root.store,
		);

		root.state.invalidate();
		animationFrames.step(16);
		expect(order).toEqual(['before', 'priority:-1', 'priority:2', 'after']);
		expect(root.render).not.toHaveBeenCalled();

		removeLate();
		order.length = 0;
		root.state.invalidate();
		animationFrames.step(32);
		expect(order).toEqual(['before', 'priority:-1', 'after']);
		expect(root.render).toHaveBeenCalledOnce();
		removeEarly();
	});

	it('honors one additional demand frame invalidated from inside a frame callback', async () => {
		const root = await createRootHarness('demand');
		let calls = 0;
		const removeFrame = root.state.internal.subscribe(
			{
				current(state) {
					calls++;
					if (calls === 1) state.invalidate();
				},
			},
			0,
			root.store,
		);

		root.state.invalidate();
		animationFrames.step(16);
		expect(calls).toBe(1);
		expect(animationFrames.pending).toBe(1);

		animationFrames.step(32);
		expect(calls).toBe(2);
		expect(root.render).toHaveBeenCalledTimes(2);
		expect(animationFrames.pending).toBe(0);
		removeFrame();
	});
});
