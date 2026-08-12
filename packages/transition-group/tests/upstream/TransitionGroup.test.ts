// Ported from react-transition-group@4.4.5 test/TransitionGroup-test.js and
// test/CSSTransitionGroup-test.js (jest → vitest, octane runtime).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Children } from 'octane';
import { act, mount } from '../../../octane/tests/_helpers.ts';
import {
	CallbackRefGroupProbe,
	CloningWrapper,
	ConditionalHostGroupProbe,
	CSSTransitionGroupProbe,
	NullRenderGroupProbe,
	TransitionGroupCountProbe,
} from '../_fixtures/upstream-probes.tsrx';

describe('TransitionGroup', function transitionGroupSuite() {
	beforeEach(function useFake() {
		vi.useFakeTimers();
	});
	afterEach(function useReal() {
		vi.useRealTimers();
	});

	// Per path: packages/transition-group/upstream/test/TransitionGroup-test.js:43-55
	it('should allow null components', function nullComponents() {
		function FirstChild(props: { children?: any }) {
			const childrenArray = Children.toArray(props.children);
			return childrenArray[0] || null;
		}
		const view = mount(CSSTransitionGroupProbe, {
			items: ['one'],
			component: FirstChild,
		});
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/TransitionGroup-test.js:56-73
	// Upstream uses a class-component callback ref. Octane has no class
	// components; assert a plain-prop callback ref on a child/host instead.
	it('should allow callback refs', function callbackRefs() {
		const ref = vi.fn();
		const view = mount(CallbackRefGroupProbe, { onRef: ref });
		expect(ref).toHaveBeenCalled();
		expect(view.container.querySelector('#callback-ref-child')).not.toBeNull();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/TransitionGroup-test.js:74-77
	it('should work with no children', function noChildren() {
		const view = mount(CSSTransitionGroupProbe, { items: [] });
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/TransitionGroup-test.js:78-118
	// OCTANE DIVERGENCE[react-transition-group-no-strict-double-appear][runtime:8b31bf604e15e535]
	// Upstream StrictMode double-appear is not exact adapted parity (Octane has
	// no StrictMode double-invoke). Assert single appear/enter/exit sequencing.
	it('should handle transitioning correctly', async function transitioning() {
		const log: string[] = [];
		const view = mount(TransitionGroupCountProbe, { count: 1, log });
		await act(function flushAppear() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['appear', 'appearing', 'appeared']);
		log.length = 0;
		await act(function add() {
			view.update(TransitionGroupCountProbe, { count: 2, log });
		});
		await act(function flushEnter() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['enter', 'entering', 'entered']);
		log.length = 0;
		await act(function remove() {
			view.update(TransitionGroupCountProbe, { count: 1, log });
		});
		await act(function flushExit() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['exit', 'exiting', 'exited']);
		view.unmount();
	});
});

describe('CSSTransitionGroup', function cssTransitionGroupSuite() {
	beforeEach(function useFake() {
		vi.useFakeTimers();
	});
	afterEach(function useReal() {
		vi.useRealTimers();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:49-83
	it('should clean-up silently after the timeout elapses', async function cleanupSilently() {
		const warn = vi.spyOn(console, 'error').mockImplementation(function noop() {});
		const view = mount(CSSTransitionGroupProbe, { items: ['one'], enter: false });
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		await act(function replace() {
			view.update(CSSTransitionGroupProbe, { items: ['two'], enter: false });
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(2);
		expect(view.container.querySelector('#two')).not.toBeNull();
		expect(view.container.querySelector('#one')).not.toBeNull();
		await act(function flush() {
			vi.runAllTimers();
		});
		expect(warn).not.toHaveBeenCalled();
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		expect(view.container.querySelector('#two')).not.toBeNull();
		warn.mockRestore();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:84-107
	it('should keep both sets of DOM nodes around', async function keepBoth() {
		const view = mount(CSSTransitionGroupProbe, { items: ['one'] });
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		await act(function replace() {
			view.update(CSSTransitionGroupProbe, { items: ['two'] });
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(2);
		expect(view.container.querySelector('#two')).not.toBeNull();
		expect(view.container.querySelector('#one')).not.toBeNull();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:108-144
	it('should switch transitionLeave from false to true', async function switchLeave() {
		const view = mount(CSSTransitionGroupProbe, {
			items: ['one'],
			enter: false,
			exit: false,
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		await act(function toTwo() {
			view.update(CSSTransitionGroupProbe, {
				items: ['two'],
				enter: false,
				exit: false,
			});
		});
		await act(function flush() {
			vi.runAllTimers();
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		expect(view.container.querySelector('#two')).not.toBeNull();
		await act(function toThree() {
			view.update(CSSTransitionGroupProbe, {
				items: ['three'],
				enter: false,
				exit: true,
			});
		});
		// With exit re-enabled, the previous child is retained until exit finishes.
		expect(view.container.querySelectorAll('[id]')).toHaveLength(2);
		expect(view.container.querySelector('#three')).not.toBeNull();
		expect(view.container.querySelector('#two')).not.toBeNull();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:145-148
	it('should work with a null child', function nullChild() {
		const view = mount(CSSTransitionGroupProbe, { items: [null] });
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:149-164
	it('should work with a child which renders as null', async function nullRenderChild() {
		const view = mount(NullRenderGroupProbe, { active: false });
		await act(function add() {
			view.update(NullRenderGroupProbe, { active: true });
		});
		await act(function clear() {
			view.update(NullRenderGroupProbe, { active: false });
		});
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:165-184
	it('should transition from one to null', async function oneToNull() {
		const view = mount(CSSTransitionGroupProbe, { items: ['one'] });
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		await act(function clear() {
			view.update(CSSTransitionGroupProbe, { items: [] });
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		expect(view.container.querySelector('#one')).not.toBeNull();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:185-202
	it('should transition from false to one', async function falseToOne() {
		const view = mount(CSSTransitionGroupProbe, { items: [] });
		expect(view.container.querySelectorAll('[id]')).toHaveLength(0);
		await act(function add() {
			view.update(CSSTransitionGroupProbe, { items: ['one'] });
		});
		expect(view.container.querySelectorAll('[id]')).toHaveLength(1);
		expect(view.container.querySelector('#one')).not.toBeNull();
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:203-225
	it('should clear transition timeouts when unmounted', async function clearTimeouts() {
		const view = mount(CSSTransitionGroupProbe, { items: [] });
		await act(function add() {
			view.update(CSSTransitionGroupProbe, { items: ['yolo'] });
		});
		view.unmount();
		await act(function flush() {
			vi.runAllTimers();
		});
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:226-257
	it('should handle unmounted elements properly', async function unmountedElements() {
		const view = mount(ConditionalHostGroupProbe, { show: true });
		await act(function hideHost() {
			view.update(ConditionalHostGroupProbe, { show: false });
		});
		await act(function flush() {
			vi.runAllTimers();
		});
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransitionGroup-test.js:258-298
	it('should work with custom component wrapper cloning children', async function customWrapper() {
		const view = mount(CSSTransitionGroupProbe, {
			items: ['one'],
			component: CloningWrapper,
		});
		const child = view.container.querySelector('#one');
		expect(child?.classList.contains('wrapper-item')).toBe(true);
		await act(function flush() {
			vi.runAllTimers();
		});
		view.unmount();
	});
});
