// Ported from react-transition-group@4.4.5 test/SwitchTransition-test.js (jest → vitest, octane runtime).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../../octane/tests/_helpers.ts';
import {
	SwitchTransitionProbe,
	SwitchTransitionStaticChildProbe,
} from '../_fixtures/upstream-probes.tsrx';

describe('SwitchTransition', function switchSuite() {
	beforeEach(function useFake() {
		vi.useFakeTimers();
	});
	afterEach(function useReal() {
		vi.useRealTimers();
	});

	// Per path: packages/transition-group/upstream/test/SwitchTransition-test.js:46-60
	it('should have default status ENTERED', function defaultEntered() {
		const view = mount(SwitchTransitionProbe, { keyId: 'first' });
		expect(view.container.querySelector('#switch-status')?.textContent).toBe(
			'first status: entered',
		);
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/SwitchTransition-test.js:61-86
	it('should have default mode: out-in', async function defaultOutIn() {
		const view = mount(SwitchTransitionProbe, { keyId: 'first' });
		await act(function switchKey() {
			view.update(SwitchTransitionProbe, { keyId: 'second' });
		});
		expect(view.container.querySelector('#switch-status')?.textContent).toBe(
			'first status: exiting',
		);
		expect(view.container.textContent).not.toContain('second');
		expect(view.container.querySelectorAll('#switch-status')).toHaveLength(1);
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/SwitchTransition-test.js:87-99
	it('should work without childs', function withoutChilds() {
		expect(function renderStaticChild() {
			const view = mount(SwitchTransitionStaticChildProbe, {});
			view.unmount();
		}).not.toThrow();
	});

	// Per path: packages/transition-group/upstream/test/SwitchTransition-test.js:100-122
	it('should switch between components on change state', async function switchComponents() {
		const log: string[] = [];
		function push(name: string) {
			return function handler() {
				log.push(name);
			};
		}
		const view = mount(SwitchTransitionProbe, {
			keyId: 'first',
			onEnter: push('enter'),
			onEntering: push('entering'),
			onEntered: push('entered'),
			onExit: push('exit'),
			onExiting: push('exiting'),
			onExited: push('exited'),
		});
		expect(view.container.textContent).toContain('first');
		await act(function switchKey() {
			view.update(SwitchTransitionProbe, {
				keyId: 'second',
				onEnter: push('enter'),
				onEntering: push('entering'),
				onEntered: push('entered'),
				onExit: push('exit'),
				onExiting: push('exiting'),
				onExited: push('exited'),
			});
		});
		expect(log).toEqual(['exit', 'exiting']);
		await act(function flush() {
			vi.runAllTimers();
		});
		await act(function flushAgain() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['exit', 'exiting', 'exited', 'enter', 'entering', 'entered']);
		expect(view.container.textContent).toContain('second');
		view.unmount();
	});

	// Per path: packages/transition-group/upstream/test/SwitchTransition-test.js:123-163
	it('should switch between null and component', async function nullAndComponent() {
		const log: string[] = [];
		function push(name: string) {
			return function handler() {
				log.push(name);
			};
		}
		const view = mount(SwitchTransitionProbe, { keyId: null });
		expect(view.container.textContent).toBe('');
		await act(function show() {
			view.update(SwitchTransitionProbe, {
				keyId: 'first',
				onEnter: push('enter'),
				onEntering: push('entering'),
				onEntered: push('entered'),
				onExit: push('exit'),
				onExiting: push('exiting'),
				onExited: push('exited'),
			});
		});
		await act(function flush() {
			vi.runAllTimers();
		});
		expect(log).toEqual(['enter', 'entering', 'entered']);
		expect(view.container.textContent).toContain('first');
		await act(function switchKey() {
			view.update(SwitchTransitionProbe, {
				keyId: 'second',
				onEnter: push('enter'),
				onEntering: push('entering'),
				onEntered: push('entered'),
				onExit: push('exit'),
				onExiting: push('exiting'),
				onExited: push('exited'),
			});
		});
		await act(function flushExit() {
			vi.runAllTimers();
		});
		await act(function flushEnter() {
			vi.runAllTimers();
		});
		expect(log).toEqual([
			'enter',
			'entering',
			'entered',
			'exit',
			'exiting',
			'exited',
			'enter',
			'entering',
			'entered',
		]);
		expect(view.container.textContent).toContain('second');
		view.unmount();
	});
});
