import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import {
	TransitionOwners,
	type TransitionOwnerControls,
	type TransitionOwnerName,
} from './_fixtures/transition-ownership.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function mountOwners() {
	const controls = {} as Record<TransitionOwnerName, TransitionOwnerControls>;
	const props = {
		owners: ['first', 'second', 'third'] as TransitionOwnerName[],
		initial: Promise.resolve('initial'),
		bind: (name: TransitionOwnerName, value: TransitionOwnerControls) => {
			controls[name] = value;
		},
	};
	const root = mount(TransitionOwners, props);
	await act(() => {});
	const pending = (name: TransitionOwnerName) =>
		root.find(`[data-owner="${name}"] output`).textContent;
	return { root, props, controls, pending };
}

describe('transition owner lifetimes', () => {
	it('keeps repeated nested owners pending until every Action settles', async () => {
		const firstGate = deferred<void>();
		const secondGate = deferred<void>();
		const laterGate = deferred<void>();
		const { root, controls, pending } = await mountOwners();
		try {
			await act(() =>
				controls.first.start(() => {
					controls.first.start(() => firstGate.promise);
					controls.second.start(() => {
						controls.second.start(() => secondGate.promise);
						controls.first.start(() => {});
					});
				}),
			);
			expect([pending('first'), pending('second'), pending('third')]).toEqual([
				'true',
				'true',
				'false',
			]);
			await act(() => firstGate.resolve());
			expect([pending('first'), pending('second')]).toEqual(['true', 'true']);
			await act(() => secondGate.resolve());
			expect([pending('first'), pending('second')]).toEqual(['false', 'false']);

			await act(() => controls.second.start(() => laterGate.promise));
			expect([pending('first'), pending('second'), pending('third')]).toEqual([
				'false',
				'true',
				'false',
			]);
			await act(() => laterGate.resolve());
			expect(pending('second')).toBe('false');
		} finally {
			firstGate.resolve();
			secondGate.resolve();
			laterGate.resolve();
			await act(() => {});
			root.unmount();
		}
	});

	it.each(['first', 'second'] as const)(
		'keeps all participating owners pending while %s waits for suspended content',
		async (suspending) => {
			const actionGate = deferred<void>();
			const content = deferred<string>();
			const { root, controls, pending } = await mountOwners();
			try {
				const original = root.find(`[data-owner="${suspending}"] span`);
				await act(() =>
					controls.first.start(() => {
						controls.second.start(() => controls[suspending].setRequest(content.promise));
						return actionGate.promise;
					}),
				);
				await act(() => actionGate.resolve());
				expect([pending('first'), pending('second'), pending('third')]).toEqual([
					'true',
					'true',
					'false',
				]);
				expect(root.find(`[data-owner="${suspending}"] span`)).toBe(original);
				expect(original.textContent).toBe('initial');
				expect(root.findAll(`[data-owner="${suspending}"] p`)).toHaveLength(0);
				await act(() => content.resolve('resolved'));
				expect(root.find(`[data-owner="${suspending}"] span`).textContent).toBe('resolved');
				expect([pending('first'), pending('second'), pending('third')]).toEqual([
					'false',
					'false',
					'false',
				]);
			} finally {
				actionGate.resolve();
				content.resolve('resolved');
				await act(() => {});
				root.unmount();
			}
		},
	);

	it.each(['first', 'second'] as const)(
		'lets remaining owners finish and another owner join after %s unmounts',
		async (removed) => {
			const firstGate = deferred<void>();
			const thirdGate = deferred<void>();
			const { root, props, controls, pending } = await mountOwners();
			const survivor = removed === 'first' ? 'second' : 'first';
			try {
				await act(() => controls.first.start(() => controls.second.start(() => firstGate.promise)));
				await act(() =>
					root.update(TransitionOwners, {
						...props,
						owners: props.owners.filter((name) => name !== removed),
					}),
				);
				expect(root.findAll(`[data-owner="${removed}"]`)).toHaveLength(0);
				expect(pending(survivor)).toBe('true');
				await act(() => controls.third.start(() => thirdGate.promise));
				expect([pending(survivor), pending('third')]).toEqual(['true', 'true']);
				await act(() => firstGate.resolve());
				expect([pending(survivor), pending('third')]).toEqual(['true', 'true']);
				await act(() => thirdGate.resolve());
				expect([pending(survivor), pending('third')]).toEqual(['false', 'false']);
			} finally {
				firstGate.resolve();
				thirdGate.resolve();
				await act(() => {});
				root.unmount();
			}
		},
	);

	it.each(['first', 'second'] as const)(
		'recovers a rejected %s Action without abandoning another pending owner',
		async (failed) => {
			const firstGate = deferred<void>();
			const secondGate = deferred<void>();
			const { root, controls, pending } = await mountOwners();
			const survivor = failed === 'first' ? 'second' : 'first';
			try {
				await act(() =>
					controls.first.start(() => {
						controls.second.start(() => secondGate.promise);
						return firstGate.promise;
					}),
				);
				await act(() =>
					(failed === 'first' ? firstGate : secondGate).reject(new Error('Action failed')),
				);
				expect(root.find(`[data-owner-scope="${failed}"] p`).textContent).toBe('Action failed');
				expect(pending(survivor)).toBe('true');
				expect(pending('third')).toBe('false');
				await act(() => (failed === 'first' ? secondGate : firstGate).resolve());
				expect(pending(survivor)).toBe('false');
			} finally {
				firstGate.resolve();
				secondGate.resolve();
				await act(() => {});
				root.unmount();
			}
		},
	);

	it('stages a state update behind an Action started by its functional updater', async () => {
		const gate = deferred<void>();
		const { root, controls, pending } = await mountOwners();
		let started = false;
		try {
			await act(() =>
				controls.first.setValue((value) => {
					if (!started) {
						started = true;
						controls.first.start(() => gate.promise);
					}
					return value + 1;
				}),
			);
			expect(root.find('[data-owner="first"] b').textContent).toBe('0');
			expect(pending('first')).toBe('true');
			await act(() => gate.resolve());
			expect(root.find('[data-owner="first"] b').textContent).toBe('1');
			expect(pending('first')).toBe('false');
		} finally {
			gate.resolve();
			await act(() => {});
			root.unmount();
		}
	});
});
