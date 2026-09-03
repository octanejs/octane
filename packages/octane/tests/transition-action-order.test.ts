import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { act, mount } from './_helpers';
import {
	TransitionUrgentEquality,
	type EqualityControls,
} from './_fixtures/transition-urgent-equality.tsrx';

describe('awaiting Actions after a suspended transition', () => {
	for (const reducer of [false, true]) {
		for (const boundary of [false, true]) {
			for (const afterHold of [false, true]) {
				for (const rebase of [false, true]) {
					for (const functional of [false, true]) {
						it(`holds an older wakeup until the Action settles (reducer=${reducer}, boundary=${boundary}, afterHold=${afterHold}, rebase=${rebase}, functional=${functional})`, async () => {
							let controls!: EqualityControls;
							let resolve!: () => void;
							let resolveAction!: () => void;
							const wait = new Promise<void>((done) => {
								resolve = done;
							});
							const actionWait = new Promise<void>((done) => {
								resolveAction = done;
							});
							const root = mount(TransitionUrgentEquality, {
								reducer,
								boundary,
								wait,
								bind: (value) => {
									controls = value;
								},
							});
							try {
								const original = root.find('span');
								const startAction = () =>
									controls.asyncTransition(functional ? (value) => value * 2 : 4, actionWait);
								if (afterHold) {
									await act(() => controls.transition(2));
									await act(startAction);
								} else {
									await act(() => {
										controls.transition(2);
										startAction();
									});
								}
								expect(root.find('section').textContent).toBe('true1');
								expect(controls.read()).toBe(4);
								if (rebase)
									await act(() =>
										flushSync(() => controls.urgent((value) => (value === 2 ? 3 : value))),
									);
								expect(root.find('section').textContent).toBe('true1');
								expect(controls.read()).toBe(4);
								await act(async () => {
									resolve();
									await wait;
								});
								expect(root.find('section').textContent).toBe('true1');
								expect(root.find('span')).toBe(original);
								expect(root.findAll('p')).toHaveLength(0);
								expect(controls.read()).toBe(4);
								await act(async () => {
									resolveAction();
									await actionWait;
								});
								expect(root.find('section').textContent).toBe('false4');
								expect(controls.read()).toBe(4);
							} finally {
								resolve();
								resolveAction();
								await act(() => {});
								root.unmount();
							}
						});
					}
				}
			}
			it(`finishes an Action replacing held state with its committed value (reducer=${reducer}, boundary=${boundary})`, async () => {
				let controls!: EqualityControls;
				let resolve!: () => void;
				let resolveAction!: () => void;
				const wait = new Promise<void>((done) => {
					resolve = done;
				});
				const actionWait = new Promise<void>((done) => {
					resolveAction = done;
				});
				const root = mount(TransitionUrgentEquality, {
					reducer,
					boundary,
					wait,
					bind: (value) => {
						controls = value;
					},
				});
				try {
					await act(() => controls.transition(2));
					await act(() => controls.asyncTransition(1, actionWait));
					expect(root.find('section').textContent).toBe('true1');
					expect(controls.read()).toBe(1);
					await act(async () => {
						resolveAction();
						await actionWait;
					});
					expect(root.find('section').textContent).toBe('false1');
					await act(async () => {
						resolve();
						await wait;
					});
					expect(root.find('section').textContent).toBe('false1');
				} finally {
					resolve();
					resolveAction();
					await act(() => {});
					root.unmount();
				}
			});
		}
	}
});
