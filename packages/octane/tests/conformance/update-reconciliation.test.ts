import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, startTransition, type Root } from '../../src/index.js';
import { createLog, flushEffects, mount } from '../_helpers';
import * as Fixture from './_fixtures/update-reconciliation.tsrx';

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function ownedContainer(): HTMLElement {
	const container = document.createElement('div');
	document.body.appendChild(container);
	return container;
}

function removeRoot(root: Root, container: HTMLElement): void {
	root.unmount();
	container.remove();
}

beforeEach(() => {
	Fixture.resetRenderPhaseBases();
});

describe('ReactUpdates update reconciliation', () => {
	// Per ReactUpdates-test.js:69.
	it('should batch state when updating state twice', () => {
		const log = createLog();
		const r = mount(Fixture.BatchedPair, { label: 'initial', log: log.push });
		expect(log.drain()).toEqual(['initial:0,0']);

		flushSync(() => {
			Fixture.setFirst(1);
			Fixture.setFirst(2);
			expect(r.find('#first').textContent).toBe('0');
		});

		expect(r.find('#first').textContent).toBe('2');
		expect(log.drain()).toEqual(['initial:2,0']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:106.
	it('should batch state when updating two different states', () => {
		const log = createLog();
		const r = mount(Fixture.BatchedPair, { label: 'initial', log: log.push });
		log.clear();

		flushSync(() => {
			Fixture.setFirst(1);
			Fixture.setSecond(2);
			expect(r.find('#pair').textContent).toBe('00');
		});

		expect(r.find('#pair').textContent).toBe('12');
		expect(log.drain()).toEqual(['initial:1,2']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:155.
	it('should batch state and props together', () => {
		const log = createLog();
		const container = ownedContainer();
		const root = createRoot(container);
		root.render(Fixture.BatchedPair, { label: 'old', log: log.push });
		flushSync(() => {});
		log.clear();

		flushSync(() => {
			root.render(Fixture.BatchedPair, { label: 'new', log: log.push });
			Fixture.setSecond(2);
			expect(container.querySelector('#pair')!.getAttribute('data-label')).toBe('old');
			expect(container.querySelector('#second')!.textContent).toBe('0');
		});

		expect(container.querySelector('#pair')!.getAttribute('data-label')).toBe('new');
		expect(container.querySelector('#second')!.textContent).toBe('2');
		expect(log.drain()).toEqual(['new:0,2']);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:201.
	it('should batch parent/child state updates together', () => {
		const log = createLog();
		const r = mount(Fixture.BatchedParentChild, { log: log.push });
		log.clear();

		flushSync(() => {
			Fixture.setParent(1);
			Fixture.setChild(2);
			expect(r.find('#child-value').textContent).toBe('0,0');
		});

		expect(r.find('#child-value').textContent).toBe('1,2');
		expect(log.drain()).toEqual(['child:1,2', 'parent:1']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:268.
	it('should batch child/parent state updates together', () => {
		const log = createLog();
		const r = mount(Fixture.BatchedParentChild, { log: log.push });
		log.clear();

		flushSync(() => {
			Fixture.setChild(2);
			Fixture.setParent(1);
			expect(r.find('#child-value').textContent).toBe('0,0');
		});

		expect(r.find('#child-value').textContent).toBe('1,2');
		expect(log.drain()).toEqual(['child:1,2', 'parent:1']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:437. Function-component adaptation: memo is the
	// supported bailout boundary; a descendant's own state remains independent.
	it('should update children even if parent blocks updates', () => {
		const log = createLog();
		const r = mount(Fixture.MemoParentHost, { log: log.push });
		expect(log.drain()).toEqual(['child:0', 'parent:stable']);

		r.click('#memo-parent-update');
		expect(log.drain()).toEqual([]);
		flushSync(() => Fixture.setMemoChild(1));
		expect(r.find('#memo-child').textContent).toBe('1');
		expect(log.drain()).toEqual(['child:1']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:484. Function-component adaptation: the middle
	// component performs a hook update while returning the same child descriptor.
	it('should not reconcile children passed via props', () => {
		const log = createLog();
		const r = mount(Fixture.StableChildrenHost, { log: log.push });
		expect(r.find('#stable-bottom').textContent).toBe('stable');
		expect(log.drain()).toEqual(['bottom', 'middle:0', 'middle:1']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:484. An identity-stable children value that
	// suspended on its first attempt has no committed output to bail out to.
	it('retries an uncommitted stable children block after suspension', async () => {
		const pending = deferred<string>();
		const r = mount(Fixture.StableChildrenSuspenseRetry, {
			promise: pending.promise,
		});
		expect(r.find('#stable-retry-pending').textContent).toBe('loading');

		await act(() => pending.resolve('ready'));
		expect(r.find('#stable-retry-value').textContent).toBe('ready');
		r.unmount();
	});

	// Per ReactUpdates-test.js:484. A return slot can begin as an arbitrary render
	// function and later receive compiler-tagged children; the tagged body must then
	// gain same-value bailout and lazy context propagation without losing its slot.
	it('arms implicit bailout when a render function switches to tagged children', () => {
		const log = createLog();
		const r = mount(Fixture.FunctionToTaggedChildrenHost, { log: log.push });
		expect(r.find('#function-switch-initial').textContent).toBe('initial');
		expect(log.drain()).toEqual([]);

		flushSync(() => Fixture.showTaggedFunctionChildren());
		expect(r.find('#function-switch-consumer').textContent).toBe('initial');
		expect(log.drain()).toEqual(['switch-consumer:initial']);

		flushSync(() => Fixture.bumpFunctionSwitch());
		expect(log.drain()).toEqual([]);

		flushSync(() => Fixture.setFunctionSwitchContext('changed'));
		expect(r.find('#function-switch-consumer').textContent).toBe('changed');
		expect(log.drain()).toEqual(['switch-consumer:changed']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:664. Function-component adaptation: layout work
	// for one root observes all DOM mutations from the shared render batch.
	it('should queue mount-ready handlers across different roots', () => {
		const log = createLog();
		const a = ownedContainer();
		const b = ownedContainer();
		const rootA = createRoot(a);
		const rootB = createRoot(b);
		rootA.render(Fixture.CrossRootA, { other: b, log: log.push });
		rootB.render(Fixture.CrossRootB);
		flushSync(() => {});
		log.clear();

		flushSync(() => {
			Fixture.setCrossRootA(1);
			Fixture.setCrossRootB(1);
		});

		expect(a.textContent).toBe('A1');
		expect(b.textContent).toBe('B1');
		expect(log.drain()).toEqual(['a-sees:B1']);
		removeRoot(rootA, a);
		removeRoot(rootB, b);
	});

	// Per ReactUpdates-test.js:992. Hook adaptation: a child update queued before
	// its parent's removal must not resurrect or commit the deleted child.
	it('does not call render after a component as been deleted', () => {
		const log = createLog();
		const r = mount(Fixture.DeletePendingChild, { log: log.push });
		expect(log.drain()).toEqual(['child:0']);

		flushSync(() => {
			Fixture.setDeleteChild(1);
			Fixture.setDeleteParent(false);
		});

		expect(r.findAll('#delete-child')).toHaveLength(0);
		expect(r.find('#deleted').textContent).toBe('deleted');
		expect(log.drain()).toEqual([]);
		r.unmount();
	});

	// Redact-derived RDX-MEM-001: pending work beneath an ancestor removed in
	// the same batch cannot revive that memoized subtree.
	it('does not commit a memoized store update after its ancestor removes it', () => {
		const store = Fixture.makeDeleteStore(0);
		const log = createLog();
		const r = mount(Fixture.DeletePendingStoreChild, { store, log: log.push });
		flushEffects();
		expect(log.drain()).toEqual(['store-child-effect:0']);
		expect(store.listenerCount()).toBe(1);

		flushSync(() => {
			// Queue the child first, then queue its ancestor's removal. The
			// ancestor must win regardless of enqueue order.
			store.set(1);
			Fixture.setDeleteStoreParent(false);
		});

		expect(r.findAll('#delete-store-child')).toHaveLength(0);
		expect(r.find('#store-child-deleted').textContent).toBe('deleted');
		expect(log.drain()).toEqual([]);

		flushEffects();
		expect(log.drain()).toEqual(['store-child-cleanup:0']);
		expect(store.listenerCount()).toBe(0);
		expect(r.findAll('#delete-store-child')).toHaveLength(0);
		r.unmount();
	});

	// Per ReactUpdates-test.js:1303. useLayoutEffect is the function-component
	// mount-ready equivalent of the source componentDidMount callback.
	it('handles reentrant mounting in synchronous mode', () => {
		const container = ownedContainer();
		const root = createRoot(container);
		let onChangeCalls = 0;
		const onChange = () => {
			onChangeCalls++;
			root.render(Fixture.ReentrantEditor, {
				text: 'hello',
				rendered: true,
				onChange,
			});
		};

		root.render(Fixture.ReentrantEditor, { text: 'hello', rendered: false, onChange });
		flushSync(() => {});
		expect(container.textContent).toBe('hello');
		expect(onChangeCalls).toBe(1);

		flushSync(() => {
			root.render(Fixture.ReentrantEditor, {
				text: 'goodbye',
				rendered: true,
				onChange,
			});
		});
		expect(container.textContent).toBe('goodbye');
		expect(onChangeCalls).toBe(1);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1348.
	// OCTANE DIVERGENCE: first root mounts are synchronous; final teardown is
	// still synchronous and leaves no mounted output.
	it('synchronously mounts and unmounts inside one outer batch', () => {
		const container = ownedContainer();
		const root = createRoot(container);
		root.render('Hello');
		expect(container.textContent).toBe('Hello');
		root.unmount();
		expect(container.textContent).toBe('');
		container.remove();
	});

	// Per ReactUpdates-test.js:1362. Hook adaptation: each render-phase updater
	// sees the latest pending base state, including the converged replay.
	it('uses correct base state for setState inside render phase', () => {
		const r = mount(Fixture.RenderPhaseBaseState);
		expect(r.find('#render-phase-base').textContent).toBe('1');
		expect(Fixture.getRenderPhaseBases()).toEqual(['base:0,memoized:0', 'base:1,memoized:1']);
		r.unmount();
	});

	// Per ReactUpdates-test.js:1413.
	it('synchronously renders hidden subtrees', () => {
		const r = mount(Fixture.HiddenSubtree, { value: 'first' });
		expect((r.find('#hidden-owner') as HTMLElement).hidden).toBe(true);
		expect(r.find('#hidden-value').textContent).toBe('first');
		r.update(Fixture.HiddenSubtree, { value: 'second' });
		expect(r.find('#hidden-value').textContent).toBe('second');
		r.unmount();
	});

	// Per ReactUpdates-test.js:1509. Preserve the source's full 1,200 independent
	// roots created from one mount-ready callback.
	it('can render 1200 roots without triggering an infinite update loop error', async () => {
		const roots: Root[] = [];
		const containers: HTMLElement[] = [];
		const spawnerContainer = ownedContainer();
		const spawnerRoot = createRoot(spawnerContainer);
		await act(() => {
			spawnerRoot.render(Fixture.ManyRootsSpawner, {
				spawn() {
					for (let i = 0; i < 1200; i++) {
						const container = ownedContainer();
						const root = createRoot(container);
						root.render(Fixture.IndependentCell, { trigger: i === 1199 });
						roots.push(root);
						containers.push(container);
					}
				},
			});
		});
		expect(roots).toHaveLength(1200);
		expect(containers.slice(0, -1).every((container) => container.textContent === '0')).toBe(true);
		expect(containers.at(-1)!.textContent).toBe('1');

		for (let i = 0; i < roots.length; i++) removeRoot(roots[i], containers[i]);
		removeRoot(spawnerRoot, spawnerContainer);
	});

	// Per ReactUpdates-test.js:1638.
	it('does not fall into an infinite update loop with useLayoutEffect', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.LayoutEffectLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1638. Dependency-change cleanups are commit
	// callbacks too; both layout and passive cleanup-driven loops are bounded.
	it('prevents infinite update loops triggered by effect cleanup callbacks', async () => {
		for (const Body of [Fixture.LayoutCleanupLoop, Fixture.PassiveCleanupLoop]) {
			const container = ownedContainer();
			const root = createRoot(container);
			await expect(async () => {
				await act(() => root.render(Body));
			}).rejects.toThrow(/Maximum update depth exceeded/);
			removeRoot(root, container);
		}
	});

	// Per ReactUpdates-test.js:1638. A render-phase synchronization nested inside
	// a layout-driven chain inherits that chain instead of refreshing its budget.
	it('keeps the update budget across mixed layout and render-phase updates', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.MixedLayoutRenderLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1638. An ancestor-first wave may render a flagged
	// child before its queue entry; coalescing the render must not swallow the error.
	it('surfaces a flagged child after its pending render is coalesced by its parent', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.CoalescedParentChildLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1553. Function-component adaptation: a failed
	// nested chain does not spend the budget of later independent finite work.
	it('resets the update counter for unrelated updates', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.FiniteLayoutChain, { limit: 55 }));
		}).rejects.toThrow(/Maximum update depth exceeded/);

		await act(() => root.render(Fixture.FiniteLayoutChain, { limit: 45 }));
		expect(container.querySelector('#finite-layout-step')!.textContent).toBe('45');
		await act(() => Fixture.setFiniteLayoutStep(0));
		expect(container.querySelector('#finite-layout-step')!.textContent).toBe('45');

		await expect(async () => {
			await act(() => {
				root.render(Fixture.FiniteLayoutChain, { limit: 55 });
				Fixture.setFiniteLayoutStep(0);
			});
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1656. Function-component adaptation: an errored
	// root can alternate between a runaway layout effect and finite content.
	it('can recover after falling into an infinite update loop', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.LayoutEffectLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		await act(() => root.render(Fixture.OneStepLayoutUpdate));
		expect(container.querySelector('#one-step-layout')!.textContent).toBe('1');

		await expect(async () => {
			await act(() => root.render(Fixture.LayoutEffectLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		await act(() => root.render(Fixture.OneStepLayoutUpdate));
		expect(container.querySelector('#one-step-layout')!.textContent).toBe('1');
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1704. Function-component adaptation: mount-ready
	// callbacks replace the same root with each other until the runtime bounds it.
	it('does not fall into mutually recursive infinite update loop with same container', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		const swap = (target: 'a' | 'b') => {
			root.render(target === 'a' ? Fixture.RootLoopA : Fixture.RootLoopB, { swap });
		};
		await expect(async () => {
			await act(() => root.render(Fixture.RootLoopA, { swap }));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1704. Root replacements initiated directly during
	// render are part of the active chain and must terminate before stack overflow.
	it('does not stack overflow on mutually recursive render-phase root replacement', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		const swap = (target: 'a' | 'b') => {
			root.render(target === 'a' ? Fixture.RenderRootLoopA : Fixture.RenderRootLoopB, {
				swap,
			});
		};
		await expect(async () => {
			await act(() => root.render(Fixture.RenderRootLoopA, { swap }));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1733. Function-component adaptation: repeated
	// @try recovery/remount work is bounded like any other commit-phase loop.
	it('does not fall into an infinite error loop', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.ErrorRecoveryLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per stable ReactUpdates-test.js:1807. Canary's warning-only/force-throw
	// feature-flag split is an internal policy; Octane always terminates the loop.
	it("does not infinite loop if there's a synchronous render phase update on another component", async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(async () => {
				await act(() => flushSync(() => root.render(Fixture.CrossComponentRenderLoop)));
			}).rejects.toThrow(/Maximum update depth exceeded/);
			if (process.env.NODE_ENV !== 'production') {
				expect(error).toHaveBeenCalledWith(
					'Cannot update a component (`CrossComponentRenderLoop`) while rendering a different ' +
						'component (`CrossComponentLoopChild`). Move the update out of the rendering component body.',
				);
			}
		} finally {
			error.mockRestore();
			removeRoot(root, container);
		}
	});

	// Per stable ReactUpdates-test.js:1838.
	it("does not infinite loop if there's an async render phase update on another component", async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			await expect(async () => {
				await act(() => {
					startTransition(() => root.render(Fixture.CrossComponentAsyncRenderLoop));
				});
			}).rejects.toThrow(/Maximum update depth exceeded/);
			if (process.env.NODE_ENV !== 'production') {
				expect(error).toHaveBeenCalledWith(
					'Cannot update a component (`CrossComponentAsyncRenderLoop`) while rendering a different ' +
						'component (`CrossComponentAsyncLoopChild`). Move the update out of the rendering component body.',
				);
			}
		} finally {
			error.mockRestore();
			removeRoot(root, container);
		}
	});

	// Per ReactUpdates-test.js:1912.
	it('can have nested updates if they do not cross the limit', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await act(() => root.render(Fixture.NestedEffectUpdates, { limit: 50 }));
		expect(container.querySelector('#nested-effect-step')!.textContent).toBe('50');
		await act(() => Fixture.setNestedEffectStep(0));
		expect(container.querySelector('#nested-effect-step')!.textContent).toBe('50');
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1912. An external root unmount is a fresh update
	// boundary: its cleanup may advance a different root after that root completed
	// an exactly-at-the-limit chain without inheriting the old budget.
	it('resets the nested-update chain before external root unmount cleanups', async () => {
		const sourceContainer = ownedContainer();
		const sourceRoot = createRoot(sourceContainer);
		sourceRoot.render(Fixture.ExternalUnmountCleanupSource, {
			bumpTarget: Fixture.bumpExternalUnmountTarget,
		});
		flushSync(() => {});

		const targetContainer = ownedContainer();
		const targetRoot = createRoot(targetContainer);
		await act(() => targetRoot.render(Fixture.ExternalUnmountTarget));
		expect(targetContainer.querySelector('#external-unmount-target')!.textContent).toBe('50');

		sourceRoot.unmount();
		sourceContainer.remove();
		await act(() => {});
		expect(targetContainer.querySelector('#external-unmount-target')!.textContent).toBe('51');

		removeRoot(targetRoot, targetContainer);
	});

	// Per ReactUpdates-test.js:1942.
	it('can have many updates inside useEffect without triggering a warning', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await act(() => root.render(Fixture.ManyUpdatesInOneEffect));
		expect(container.querySelector('#many-effect-updates')!.textContent).toBe('1000');
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1965.
	it('prevents infinite update loop triggered by synchronous updates in useEffect', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.SynchronousPassiveEffectLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:2010 (stable), :2266 (canary).
	it('prevents infinite update loop triggered by too many updates in ref callbacks', async () => {
		const container = ownedContainer();
		const root = createRoot(container);
		await expect(async () => {
			await act(() => root.render(Fixture.RefCallbackLoop));
		}).rejects.toThrow(/Maximum update depth exceeded/);
		removeRoot(root, container);
	});

	// Per ReactUpdates-test.js:1769. Function-component adaptation: a wide batch
	// is not a recursive update chain, even when it contains far more than the cap.
	it('can schedule ridiculously many updates within the same batch without triggering a maximum update error', () => {
		const setters: Array<(value: number) => void> = [];
		const ids = Array.from({ length: 1200 }, (_, id) => id);
		const r = mount(Fixture.ManyBatchCells, {
			ids,
			capture(id: number, setter: (value: number) => void) {
				setters[id] = setter;
			},
		});

		flushSync(() => {
			for (const setter of setters) setter(1);
		});
		expect(r.findAll('.batch-cell')).toHaveLength(1200);
		expect(r.findAll('.batch-cell').every((node) => node.textContent === '1')).toBe(true);
		r.unmount();
	});
});
