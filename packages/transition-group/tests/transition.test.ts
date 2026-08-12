import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers.ts';
import {
	ClonedTransitionFixture,
	CSSNodeRefAppearFixture,
	CSSFixture,
	GroupFixture,
	MountOnEnterFixture,
	NodeRefAppearFixture,
	NullNodeRefFixture,
	LatestCompletionFixture,
	ReplaceFixture,
	SameKeyGroupFixture,
	StableChildrenGroupFlagsFixture,
	SameKeySwitchFixture,
	SwitchFixture,
	TransitionFixture,
} from './_fixtures/transition.tsrx';
import { ReAddOnExitedGroupProbe } from './_fixtures/upstream-probes.tsrx';

describe('react-transition-group v4.4.5 adapted transition behavior', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	// @parity-case runtime:transition-lifecycle-order
	it('moves through enter and exit states in callback order', async () => {
		// Per upstream/test/Transition-test.js:82-138 and 326-390.
		const trace: string[] = [];
		const view = mount(TransitionFixture, { trace });
		expect(view.container.querySelector('#state')?.textContent).toBe('exited');

		await act(() => (view.container.querySelector('#toggle') as HTMLButtonElement).click());
		expect(view.container.querySelector('#state')?.textContent).toBe('entering');
		expect(trace).toEqual(['enter', 'entering']);
		await act(() => vi.advanceTimersByTime(20));
		expect(view.container.querySelector('#state')?.textContent).toBe('entered');

		await act(() => (view.container.querySelector('#toggle') as HTMLButtonElement).click());
		expect(view.container.querySelector('#state')?.textContent).toBe('exiting');
		await act(() => vi.advanceTimersByTime(20));
		expect(view.container.querySelector('#state')?.textContent).toBe('exited');
		expect(trace).toEqual(['enter', 'entering', 'entered', 'exit', 'exiting', 'exited']);
		view.unmount();
	});

	// @parity-case runtime:css-class-phases
	it('applies and cleans CSS transition classes', async () => {
		// Per upstream/test/CSSTransition-test.js:44-115 and 196-250.
		const view = mount(CSSFixture);
		const node = view.container.querySelector('#css-node')!;
		await act(() => (view.container.querySelector('#css-toggle') as HTMLButtonElement).click());
		expect(node.classList.contains('fade-enter')).toBe(true);
		expect(node.classList.contains('fade-enter-active')).toBe(true);
		await act(() => vi.advanceTimersByTime(20));
		expect(node.classList.contains('fade-enter-done')).toBe(true);
		expect(node.classList.contains('fade-enter')).toBe(false);
		view.unmount();
	});

	// @parity-case runtime:group-exit-retention
	it('keeps removed group children mounted until their exit completes', async () => {
		// Per upstream/test/TransitionGroup-test.js:58-122.
		const trace: string[] = [];
		const view = mount(GroupFixture, { trace });
		expect(view.container.querySelectorAll('[data-item]')).toHaveLength(2);
		await act(() => (view.container.querySelector('#remove-first') as HTMLButtonElement).click());
		expect(view.container.querySelectorAll('[data-item]')).toHaveLength(2);
		expect(view.container.querySelector('[data-item="one"]')?.getAttribute('data-state')).toBe(
			'exiting',
		);
		await act(() => vi.runAllTimers());
		expect(trace).toEqual(['exited:one']);
		expect(view.container.querySelectorAll('[data-item]')).toHaveLength(1);
		view.unmount();
	});

	// @parity-case runtime:keyed-clone-update
	it('preserves a keyed cloned transition while its props change', async () => {
		const trace: string[] = [];
		const view = mount(ClonedTransitionFixture, { trace });
		await act(() => (view.container.querySelector('#clone-toggle') as HTMLButtonElement).click());
		expect(view.container.querySelector('#cloned-state')?.textContent).toBe('exiting');
		await act(() => vi.runAllTimers());
		expect(trace).toEqual(['exited']);
		view.unmount();
	});

	// @parity-case runtime:node-ref-callback-arguments
	it('omits the node argument when nodeRef is provided', async () => {
		const calls: unknown[][] = [];
		const view = mount(NodeRefAppearFixture, { calls });
		expect(calls).toEqual([[true]]);
		await act(() => vi.runAllTimers());
		view.unmount();
	});

	// @parity-case runtime:null-node-ref-end-listener
	it('completes immediately without invoking an end listener for a null nodeRef', async () => {
		const trace: string[] = [];
		const view = mount(NullNodeRefFixture, { trace });
		await act(() => vi.advanceTimersByTime(0));
		expect(trace).toEqual(['entered']);
		view.unmount();
	});

	// @parity-case runtime:css-node-ref-callback-arguments
	it('preserves upstream nodeRef callback arguments through CSSTransition', async () => {
		const calls: unknown[][] = [];
		const view = mount(CSSNodeRefAppearFixture, { calls });
		expect(calls).toEqual([[true, undefined]]);
		await act(() => vi.runAllTimers());
		view.unmount();
	});

	// @parity-case runtime:latest-completion-callback
	it('uses the latest completion callback after props change mid-transition', async () => {
		const trace: string[] = [];
		const view = mount(LatestCompletionFixture, { trace });
		await act(() => (view.container.querySelector('#latest-start') as HTMLButtonElement).click());
		await act(() => (view.container.querySelector('#latest-swap') as HTMLButtonElement).click());
		await act(() => vi.runAllTimers());
		expect(trace).toEqual(['second']);
		view.unmount();
	});

	// @parity-case runtime:mount-on-enter-sequencing
	it('mounts the child before starting a mountOnEnter CSS transition', async () => {
		const view = mount(MountOnEnterFixture);
		expect(view.container.querySelector('#mounted-node')).toBeNull();
		await act(() => (view.container.querySelector('#mount-toggle') as HTMLButtonElement).click());
		const node = view.container.querySelector('#mounted-node')!;
		expect(node.classList.contains('mount-enter')).toBe(true);
		expect(node.classList.contains('mount-enter-active')).toBe(true);
		await act(() => vi.runAllTimers());
		view.unmount();
	});

	// @parity-case runtime:group-same-key-update
	it('updates a TransitionGroup child when its key remains stable', async () => {
		const view = mount(SameKeyGroupFixture);
		expect(view.container.querySelector('#same-key-label')?.textContent).toBe('first');
		await act(() =>
			(view.container.querySelector('#same-key-update') as HTMLButtonElement).click(),
		);
		expect(view.container.querySelector('#same-key-label')?.textContent).toBe('second');
		view.unmount();
	});

	// @parity-case runtime:group-stable-children-flag-update
	it('reclones stable TransitionGroup children when group flags change', async () => {
		const view = mount(StableChildrenGroupFlagsFixture);
		expect(view.container.querySelector('#group-flag')?.getAttribute('data-enter')).toBe('true');
		await act(() =>
			(view.container.querySelector('#group-flag-toggle') as HTMLButtonElement).click(),
		);
		expect(view.container.querySelector('#group-flag')?.getAttribute('data-enter')).toBe('false');
		view.unmount();
	});

	// @parity-case runtime:switch-out-in
	it('sequences SwitchTransition out-in replacements', async () => {
		const view = mount(SwitchFixture, { mode: 'out-in' });
		await act(() => (view.container.querySelector('#switch-toggle') as HTMLButtonElement).click());
		expect(view.container.querySelector('[data-switch="first"]')?.getAttribute('data-state')).toBe(
			'exiting',
		);
		await act(() => vi.advanceTimersByTime(20));
		expect(view.container.querySelector('[data-switch="second"]')?.getAttribute('data-state')).toBe(
			'entering',
		);
		await act(() => vi.advanceTimersByTime(20));
		expect(view.container.querySelector('[data-switch="second"]')?.getAttribute('data-state')).toBe(
			'entered',
		);
		view.unmount();
	});

	// @parity-case runtime:switch-in-out
	it('sequences SwitchTransition in-out replacements', async () => {
		const view = mount(SwitchFixture, { mode: 'in-out' });
		await act(() => (view.container.querySelector('#switch-toggle') as HTMLButtonElement).click());
		expect(view.container.querySelectorAll('[data-switch]')).toHaveLength(2);
		await act(() => vi.advanceTimersByTime(20));
		await act(() => vi.advanceTimersByTime(20));
		expect(view.container.querySelectorAll('[data-switch]')).toHaveLength(1);
		expect(view.container.querySelector('[data-switch="second"]')).not.toBeNull();
		view.unmount();
	});

	// @parity-case runtime:switch-same-key-update
	it('updates a SwitchTransition child when its key remains stable', async () => {
		const view = mount(SameKeySwitchFixture);
		expect(view.container.querySelector('#same-key-switch-label')?.textContent).toBe('first');
		await act(() =>
			(view.container.querySelector('#same-key-switch-update') as HTMLButtonElement).click(),
		);
		expect(view.container.querySelector('#same-key-switch-label')?.textContent).toBe('second');
		view.unmount();
	});

	// @parity-case runtime:replace-transition
	it('selects and replaces the two ReplaceTransition children', async () => {
		const view = mount(ReplaceFixture);
		expect(view.container.querySelector('[data-replace="first"]')).not.toBeNull();
		await act(() => (view.container.querySelector('#replace-toggle') as HTMLButtonElement).click());
		await act(() => vi.runAllTimers());
		expect(view.container.querySelector('[data-replace="first"]')).toBeNull();
		expect(view.container.querySelector('[data-replace="second"]')).not.toBeNull();
		view.unmount();
	});

	// Regression: onExited that synchronously re-adds the same key must not be
	// undone by handleExited's mapping delete (upstream defers via setState +
	// getDerivedStateFromProps re-deriving from live props).
	it('should keep a child that onExited synchronously re-adds', async function reAddOnExited() {
		const log: string[] = [];
		let show = true;
		function onShowChange(next: boolean) {
			show = next;
			view.update(ReAddOnExitedGroupProbe, { show, log, onShowChange });
		}
		const view = mount(ReAddOnExitedGroupProbe, { show, log, onShowChange });
		await act(function flushAppear() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['appear', 'appearing', 'appeared']);
		log.length = 0;
		await act(function remove() {
			show = false;
			view.update(ReAddOnExitedGroupProbe, { show, log, onShowChange });
		});
		await act(function flushExitAndReadd() {
			vi.runAllTimers();
		});
		expect(view.container.querySelector('#readd-child')).not.toBeNull();
		expect(
			log.filter(function onlyEnter(event) {
				return event === 'enter';
			}),
		).toHaveLength(1);
		expect(
			log.filter(function onlyExited(event) {
				return event === 'exited';
			}),
		).toHaveLength(1);
		view.unmount();
	});
});
