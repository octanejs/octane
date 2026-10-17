import { describe, expect, it } from 'vitest';
import { flushSync } from 'octane';
import { act, mount } from './_helpers';
import {
	TransitionRebaseOrder,
	TransitionUrgentEquality,
	type EqualityControls,
	type RebaseControls,
	type ValueAction,
} from './_fixtures/transition-urgent-equality.tsrx';

// React's update queue (processUpdateQueue): an urgent render skips a held
// transition's update and applies later urgent updates to the committed base;
// the transition's render then applies the whole queue in order. isPending
// stays raised until the commit that shows the transition.
describe('hook update queues rebase like React', () => {
	for (const reducer of [false, true]) {
		for (const boundary of [false, true]) {
			const label = `${reducer ? 'reducer' : 'state'}, ${boundary ? 'boundary' : 'root'}`;

			function mountRebase() {
				let controls!: RebaseControls;
				let resolve!: () => void;
				const wait = new Promise<void>((done) => {
					resolve = done;
				});
				const log: string[] = [];
				const root = mount(TransitionRebaseOrder, {
					reducer,
					boundary,
					wait,
					bind: (value) => {
						controls = value;
					},
					log: (entry) => log.push(entry),
				});
				const settle = () =>
					act(async () => {
						resolve();
						await wait;
					});
				return { root, log, controls: () => controls, settle, release: resolve };
			}

			it(`commits an urgent update over a held transition, then both in order (${label})`, async () => {
				const { root, log, controls, settle, release } = mountRebase();
				try {
					await act(() => controls().transition());
					expect(root.find('b').textContent).toBe('true');
					expect(root.find('span').textContent).toBe('');

					log.length = 0;
					await act(() => controls().urgent());
					// The urgent update applies to the committed base, without the held 'A'.
					expect(root.find('span').textContent).toBe('b');
					expect(root.find('b').textContent).toBe('true');
					expect(root.findAll('p')).toHaveLength(0);
					expect(log.filter((entry) => entry.includes('A'))).toEqual([]);

					await settle();
					// The transition renders the queue in order over the base: 'A', then 'b'.
					expect(root.find('span').textContent).toBe('Ab');
					expect(root.find('b').textContent).toBe('false');
					// isPending falls only in the commit that shows the transition.
					expect(log.filter((entry) => entry.endsWith('|false'))).toEqual(['Ab|0|false']);
				} finally {
					release();
					await act(() => {});
					root.unmount();
				}
			});

			it(`keeps a held transition's committed UI while other urgent updates commit (${label})`, async () => {
				const { root, log, controls, settle, release } = mountRebase();
				try {
					await act(() => controls().transition());
					log.length = 0;
					await act(() => controls().count());
					await act(() => controls().count());
					expect(root.find('i').textContent).toBe('2');
					expect(root.find('span').textContent).toBe('');
					expect(root.find('b').textContent).toBe('true');
					expect(root.findAll('p')).toHaveLength(0);
					expect(log.every((entry) => entry.startsWith('|') && entry.endsWith('|true'))).toBe(true);

					await settle();
					expect(root.find('span').textContent).toBe('A');
					expect(root.find('i').textContent).toBe('2');
					expect(root.find('b').textContent).toBe('false');
					expect(log.at(-1)).toBe('A|2|false');
				} finally {
					release();
					await act(() => {});
					root.unmount();
				}
			});
		}
	}
});

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
