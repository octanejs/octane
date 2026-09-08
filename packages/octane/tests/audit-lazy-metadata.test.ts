import { expect, it, vi } from 'vitest';
import { act, createElement, createRoot, lazy } from '../src/index.js';
import * as Universal from '../src/universal.js';

function hoistStatics(source: Function, target: Function): void {
	for (const key of Reflect.ownKeys(source)) {
		if (
			key === 'name' ||
			key === 'length' ||
			key === 'prototype' ||
			key === 'caller' ||
			key === 'arguments'
		)
			continue;
		Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)!);
	}
}

it('loads a DOM component that hoisted lazy statics without classifying it as nested lazy', async () => {
	const OriginalBody = () => createElement('span', null, 'original');
	const originalLoad = vi.fn(() => Promise.resolve({ default: OriginalBody }));
	const Original = lazy(originalLoad);
	const Hoc = () => createElement('span', null, 'wrapper');
	hoistStatics(Original, Hoc);
	const Outer = lazy(() => Promise.resolve({ default: Hoc }));
	const container = document.createElement('div');
	document.body.appendChild(container);
	const errors: unknown[] = [];
	const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
	try {
		await act(() => root.render(Outer));
		expect(errors).toEqual([]);
		expect(container.textContent).toBe('wrapper');
		expect(originalLoad).not.toHaveBeenCalled();
	} finally {
		root.unmount();
		container.remove();
	}
});

it.each([false, true])(
	'loads a universal component after hoisting lazy statics (memo: %s)',
	async (memo) => {
		const plan = Universal.universalPlan('object', { kind: 'host', type: 'wrapper' });
		const OriginalBody = Universal.defineUniversalComponent('object', () =>
			Universal.universalValue(plan, []),
		);
		const originalLoad = vi.fn(() => Promise.resolve({ default: OriginalBody }));
		const Original = Universal.lazy(originalLoad);
		const Source = memo ? Universal.memo(Original) : Original;
		const Hoc = Universal.defineUniversalComponent('object', () =>
			Universal.universalValue(plan, []),
		);
		hoistStatics(Source, Hoc);
		const Outer = Universal.lazy(() => Promise.resolve({ default: Hoc }));
		const container = Universal.createObjectContainer();
		const errors: unknown[] = [];
		const root = Universal.createUniversalRoot(container, Universal.createObjectDriver(), {
			onUncaughtError: (error) => errors.push(error),
		});
		try {
			await act(() => root.render(Outer, undefined));
			expect(errors).toEqual([]);
			expect(container.children.map((child) => child.type)).toEqual(['wrapper']);
			expect(originalLoad).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	},
);
