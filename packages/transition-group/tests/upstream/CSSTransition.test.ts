// Ported from react-transition-group@4.4.5 test/CSSTransition-test.js (jest → vitest, octane runtime).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../../octane/tests/_helpers.ts';
import {
	CSSTransitionProbe,
	CSSTransitionReenterGroupProbe,
} from '../_fixtures/upstream-probes.tsrx';

describe('CSSTransition', function cssTransitionSuite() {
	beforeEach(function useFake() {
		vi.useFakeTimers();
	});
	afterEach(function useReal() {
		vi.useRealTimers();
	});

	// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:8-38
	it('should flush new props to the DOM before initiating a transition', async function flushProps() {
		let done = false;
		const view = mount(CSSTransitionProbe, {
			shown: false,
			timeout: 0,
			classNames: 'test',
		});
		expect(view.container.querySelector('#css-node')?.classList.contains('test-class')).toBe(false);
		await act(function enter() {
			view.update(CSSTransitionProbe, {
				shown: true,
				timeout: 0,
				classNames: 'test',
				className: 'test-class',
				onEnter: function onEnter() {
					const node = view.container.querySelector('#css-node')!;
					expect(node.classList.contains('test-class')).toBe(true);
					expect(node.classList.contains('test-enter-active')).toBe(false);
					done = true;
				},
			});
		});
		expect(done).toBe(true);
		view.unmount();
	});

	describe('entering', function entering() {
		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:39-75
		it('should apply classes at each transition state', async function enterClasses() {
			let count = 0;
			let done = false;
			const view = mount(CSSTransitionProbe, {
				shown: false,
				timeout: 10,
				classNames: 'test',
			});
			await act(function enter() {
				view.update(CSSTransitionProbe, {
					shown: true,
					timeout: 10,
					classNames: 'test',
					onEnter: function onEnter() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('test-enter');
					},
					onEntering: function onEntering() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'test-enter test-enter-active',
						);
					},
					onEntered: function onEntered() {
						expect(view.container.querySelector('#css-node')?.className).toBe('test-enter-done');
						expect(count).toBe(2);
						done = true;
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(done).toBe(true);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:76-119
		it('should apply custom classNames names', async function customEnterNames() {
			let count = 0;
			const view = mount(CSSTransitionProbe, {
				shown: false,
				timeout: 10,
				classNames: {
					enter: 'custom',
					enterActive: 'custom-super-active',
					enterDone: 'custom-super-done',
				},
			});
			await act(function enter() {
				view.update(CSSTransitionProbe, {
					shown: true,
					timeout: 10,
					classNames: {
						enter: 'custom',
						enterActive: 'custom-super-active',
						enterDone: 'custom-super-done',
					},
					onEnter: function onEnter() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('custom');
					},
					onEntering: function onEntering() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'custom custom-super-active',
						);
					},
					onEntered: function onEntered() {
						expect(view.container.querySelector('#css-node')?.className).toBe('custom-super-done');
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});
	});

	describe('appearing', function appearing() {
		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:120-157
		it('should apply appear classes at each transition state', async function appearClasses() {
			let count = 0;
			function node() {
				return document.querySelector('#css-node');
			}
			const view = mount(CSSTransitionProbe, {
				shown: true,
				appear: true,
				timeout: 10,
				classNames: 'appear-test',
				// nodeRef callback shape: first argument is isAppearing.
				onEnter: function onEnter(isAppearing?: Element | boolean) {
					count++;
					expect(isAppearing).toBe(true);
					expect(node()?.className).toBe('appear-test-appear');
				},
				onEntering: function onEntering(isAppearing?: Element | boolean) {
					count++;
					expect(isAppearing).toBe(true);
					expect(node()?.className).toBe('appear-test-appear appear-test-appear-active');
				},
				onEntered: function onEntered(isAppearing?: Element | boolean) {
					expect(isAppearing).toBe(true);
					expect(node()?.className).toBe('appear-test-appear-done appear-test-enter-done');
				},
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:158-205
		it('should lose the "*-appear-done" class after leaving and entering again', async function loseAppearDone() {
			let entered = false;
			let exited = false;
			const view = mount(CSSTransitionProbe, {
				shown: true,
				appear: true,
				timeout: 10,
				classNames: 'appear-test',
				onEntered: function onEntered() {
					entered = true;
				},
			});
			await act(function flushAppear() {
				vi.advanceTimersByTime(10);
			});
			expect(entered).toBe(true);
			await act(function leave() {
				view.update(CSSTransitionProbe, {
					shown: false,
					appear: true,
					timeout: 10,
					classNames: 'appear-test',
					onExited: function onExited() {
						exited = true;
					},
				});
			});
			await act(function flushExit() {
				vi.advanceTimersByTime(10);
			});
			expect(exited).toBe(true);
			expect(view.container.querySelector('#css-node')?.className).toBe('appear-test-exit-done');
			entered = false;
			await act(function reenter() {
				view.update(CSSTransitionProbe, {
					shown: true,
					appear: true,
					timeout: 10,
					classNames: 'appear-test',
					onEntered: function onEntered() {
						entered = true;
					},
				});
			});
			await act(function flushEnter() {
				vi.advanceTimersByTime(10);
			});
			expect(entered).toBe(true);
			expect(view.container.querySelector('#css-node')?.className).toBe('appear-test-enter-done');
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:206-234
		it('should not add undefined when appearDone is not defined', async function noUndefinedAppearDone() {
			let done = false;
			function node() {
				return document.querySelector('#css-node');
			}
			const view = mount(CSSTransitionProbe, {
				shown: true,
				appear: true,
				timeout: 10,
				classNames: { appear: 'appear-test' },
				onEnter: function onEnter(isAppearing?: Element | boolean) {
					expect(isAppearing).toBe(true);
					expect(node()?.className).toBe('appear-test');
				},
				onEntered: function onEntered(isAppearing?: Element | boolean) {
					expect(isAppearing).toBe(true);
					expect(node()?.className).toBe('');
					done = true;
				},
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(done).toBe(true);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:235-276
		it('should not be appearing in normal enter mode', async function notAppearing() {
			let count = 0;
			const view = mount(CSSTransitionProbe, {
				shown: false,
				appear: true,
				timeout: 10,
				classNames: 'not-appear-test',
			});
			await act(function enter() {
				view.update(CSSTransitionProbe, {
					shown: true,
					appear: true,
					timeout: 10,
					classNames: 'not-appear-test',
					onEnter: function onEnter(isAppearing?: Element | boolean) {
						count++;
						expect(isAppearing).toBe(false);
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'not-appear-test-enter',
						);
					},
					onEntering: function onEntering(isAppearing?: Element | boolean) {
						count++;
						expect(isAppearing).toBe(false);
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'not-appear-test-enter not-appear-test-enter-active',
						);
					},
					onEntered: function onEntered(isAppearing?: Element | boolean) {
						expect(isAppearing).toBe(false);
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'not-appear-test-enter-done',
						);
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:277-302
		it('should not enter the transition states when appear=false', function appearFalse() {
			const view = mount(CSSTransitionProbe, {
				shown: true,
				appear: false,
				timeout: 10,
				classNames: 'appear-fail-test',
				onEnter: function onEnter() {
					throw new Error('Enter called!');
				},
				onEntering: function onEntering() {
					throw new Error('Entering called!');
				},
				onEntered: function onEntered() {
					throw new Error('Entered called!');
				},
			});
			view.unmount();
		});
	});

	describe('exiting', function exiting() {
		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:303-336
		it('should apply classes at each transition state', async function exitClasses() {
			let count = 0;
			const view = mount(CSSTransitionProbe, {
				shown: true,
				timeout: 10,
				classNames: 'test',
			});
			await act(function exit() {
				view.update(CSSTransitionProbe, {
					shown: false,
					timeout: 10,
					classNames: 'test',
					onExit: function onExit() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('test-exit');
					},
					onExiting: function onExiting() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'test-exit test-exit-active',
						);
					},
					onExited: function onExited() {
						expect(view.container.querySelector('#css-node')?.className).toBe('test-exit-done');
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:337-379
		it('should apply custom classNames names', async function customExitNames() {
			let count = 0;
			const view = mount(CSSTransitionProbe, {
				shown: true,
				timeout: 10,
				classNames: {
					exit: 'custom',
					exitActive: 'custom-super-active',
					exitDone: 'custom-super-done',
				},
			});
			await act(function exit() {
				view.update(CSSTransitionProbe, {
					shown: false,
					timeout: 10,
					classNames: {
						exit: 'custom',
						exitActive: 'custom-super-active',
						exitDone: 'custom-super-done',
					},
					onExit: function onExit() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('custom');
					},
					onExiting: function onExiting() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe(
							'custom custom-super-active',
						);
					},
					onExited: function onExited() {
						expect(view.container.querySelector('#css-node')?.className).toBe('custom-super-done');
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});

		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:380-414
		it('should support empty prefix', async function emptyPrefix() {
			let count = 0;
			const view = mount(CSSTransitionProbe, { shown: true, timeout: 10 });
			await act(function exit() {
				view.update(CSSTransitionProbe, {
					shown: false,
					timeout: 10,
					onExit: function onExit() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('exit');
					},
					onExiting: function onExiting() {
						count++;
						expect(view.container.querySelector('#css-node')?.className).toBe('exit exit-active');
					},
					onExited: function onExited() {
						expect(view.container.querySelector('#css-node')?.className).toBe('exit-done');
					},
				});
			});
			await act(function flush() {
				vi.advanceTimersByTime(10);
			});
			expect(count).toBe(2);
			view.unmount();
		});
	});

	describe('reentering', function reentering() {
		// Per path: packages/transition-group/upstream/test/CSSTransition-test.js:415-455
		it('should remove dynamically applied classes', async function dynamicClasses() {
			let count = 0;
			const nodeRef = {
				foo: { current: null as HTMLSpanElement | null },
				bar: { current: null as HTMLSpanElement | null },
			};
			const view = mount(CSSTransitionReenterGroupProbe, {
				text: 'foo',
				direction: 'down',
				timeout: 100,
				nodeRef: nodeRef.foo,
			});
			await act(function toBar() {
				view.update(CSSTransitionReenterGroupProbe, {
					text: 'bar',
					direction: 'up',
					timeout: 100,
					nodeRef: nodeRef.bar,
					onEnter: function onEnter() {
						count++;
						expect(nodeRef.bar.current?.className).toBe('up-enter');
					},
					onEntering: function onEntering() {
						count++;
						expect(nodeRef.bar.current?.className).toBe('up-enter up-enter-active');
					},
				});
			});
			await act(function flushBar() {
				vi.advanceTimersByTime(100);
			});
			expect(count).toBe(2);
			await act(function toFoo() {
				view.update(CSSTransitionReenterGroupProbe, {
					text: 'foo',
					direction: 'down',
					timeout: 100,
					nodeRef: nodeRef.foo,
					onEntering: function onEntering() {
						count++;
						expect(nodeRef.foo.current?.className).toBe('down-enter down-enter-active');
					},
					onEntered: function onEntered() {
						count++;
						expect(nodeRef.foo.current?.className).toBe('down-enter-done');
					},
				});
			});
			await act(function flushFoo() {
				vi.advanceTimersByTime(100);
			});
			expect(count).toBe(4);
			view.unmount();
		});
	});
});
