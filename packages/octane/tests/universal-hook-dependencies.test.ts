import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	universalPlan,
	universalValue,
	useEffect,
	useLayoutEffect,
	useMemo,
} from '../src/universal-native.js';

const cellPlan = universalPlan('object', {
	kind: 'host',
	type: 'cell',
	bindings: [['value', 0]],
});

function mountScene<P>(body: (props: P) => unknown) {
	const Scene = defineUniversalComponent('object', (props: P) =>
		universalValue(cellPlan, [body(props)]),
	);
	// Passive effects run on the root's microtask scheduler; draining it here
	// settles every effect a render or unmount queued.
	const scheduled: Array<() => void> = [];
	const drain = () => {
		for (let count = 0; scheduled.length !== 0; count++) {
			if (count === 50) throw new Error('Universal effects did not settle.');
			scheduled.shift()!();
		}
	};
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver(), {
		scheduleMicrotask: (callback) => scheduled.push(callback),
	});
	return {
		render(props: P) {
			flushUniversalSync(() => root.render(Scene, props));
			drain();
		},
		value: () => container.children[0].props.value,
		unmount() {
			root.unmount();
			drain();
		},
	};
}

describe('universal hook dependencies', () => {
	it('recomputes a memo only when a dependency changes under Object.is', () => {
		let computes = 0;
		const scene = mountScene((props: { deps: unknown[] | null }) =>
			useMemo(() => ++computes, props.deps, 'memo'),
		);
		scene.render({ deps: [NaN] });
		scene.render({ deps: [NaN] });
		expect([scene.value(), computes]).toEqual([1, 1]);

		scene.render({ deps: [0] });
		scene.render({ deps: [-0] });
		expect([scene.value(), computes]).toEqual([3, 3]);

		scene.render({ deps: [-0, 1] });
		expect(computes).toBe(4);

		// `null` is the compiler's "run every render" dependency array.
		scene.render({ deps: null });
		scene.render({ deps: null });
		expect([scene.value(), computes]).toEqual([6, 6]);
		scene.unmount();
	});

	// The compiler lifts capture-free hook callbacks out of their component and
	// reads what they captured from these arguments, so this is its runtime ABI.
	it('passes effects their dependency values as arguments', () => {
		const calls: unknown[][] = [];
		const record =
			(phase: string) =>
			(...args: unknown[]) => {
				calls.push([phase, ...args]);
			};
		const scene = mountScene((props: { a: number; b: string }) => {
			useLayoutEffect(record('layout') as () => void, [props.a, props.b], 'layout');
			useEffect(record('passive') as () => void, [props.b, props.a], 'passive');
			useEffect(record('every') as () => void, null, 'every');
			return props.a;
		});
		scene.render({ a: 1, b: 'x' });
		expect(calls).toEqual([['layout', 1, 'x'], ['passive', 'x', 1], ['every']]);
		calls.length = 0;
		scene.render({ a: 2, b: 'x' });
		expect(calls).toEqual([['layout', 2, 'x'], ['passive', 'x', 2], ['every']]);
		scene.unmount();
	});

	it('runs each effect cleanup once for the create it belongs to', () => {
		const log: string[] = [];
		const scene = mountScene((props: { id: number }) => {
			useEffect(
				() => {
					log.push(`create ${props.id}`);
					return () => log.push(`cleanup ${props.id}`);
				},
				[props.id],
				'effect',
			);
			return props.id;
		});
		scene.render({ id: 1 });
		scene.render({ id: 1 });
		scene.render({ id: 2 });
		scene.unmount();
		expect(log).toEqual(['create 1', 'cleanup 1', 'create 2', 'cleanup 2']);
	});
});
