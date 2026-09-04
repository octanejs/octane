import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { act, mount } from './_helpers';
import {
	TransitionUrgentEquality,
	type EqualityControls,
	type ValueAction,
} from './_fixtures/transition-urgent-equality.tsrx';

describe('urgent actions after a held transition', () => {
	for (const reducer of [false, true]) {
		for (const boundary of [false, true]) {
			it(`keeps an awaiting Action separate from held ${reducer ? 'reducer' : 'state'} replay (${boundary ? 'boundary' : 'root'})`, async () => {
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
					await act(() => {
						controls.transition(2);
						controls.asyncTransition((value) => value * 2, actionWait);
					});
					expect(root.find('section').textContent).toBe('true1');
					expect(controls.read()).toBe(4);

					await act(() => flushSync(() => controls.urgent((value) => (value === 2 ? 3 : value))));
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
					await act(async () => {
						resolve();
						await wait;
					});
					expect(root.find('section').textContent).toBe('false4');
					expect(root.find('span')).toBe(original);
				} finally {
					resolve();
					resolveAction();
					await act(() => {});
					root.unmount();
				}
			});
			for (const [name, action, immediate, final] of [
				['replacement', 1, 'false1', '1'],
				['constant updater', () => 1, 'false1', '1'],
				['identity updater', (value: number) => value, 'true1', '2'],
				['ready forward value', (value: number) => (value === 1 ? 1 : 3), 'false3', '3'],
			] satisfies Array<[string, ValueAction, string, string]>) {
				it(`rebases ${name} over held ${reducer ? 'reducer' : 'state'} work (${boundary ? 'boundary' : 'root'})`, async () => {
					let controls!: EqualityControls;
					let resolve!: () => void;
					const wait = new Promise<void>((done) => {
						resolve = done;
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
						await act(() => controls.transition(2));
						expect(root.find('b').textContent).toBe('true');
						expect(root.find('span')).toBe(original);
						expect(original.textContent).toBe('1');
						expect(root.findAll('p')).toHaveLength(0);

						await act(() => controls.urgent(action));
						expect(root.find('section').textContent).toBe(immediate);
						expect(root.find('span')).toBe(original);
						expect(root.findAll('p')).toHaveLength(0);

						await act(async () => {
							resolve();
							await wait;
						});
						expect(root.find('b').textContent).toBe('false');
						expect(root.find('span').textContent).toBe(final);
						expect(root.findAll('p')).toHaveLength(0);
					} finally {
						resolve();
						await act(() => {});
						root.unmount();
					}
				});
			}
		}
	}
});
