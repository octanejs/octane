import { createScope } from '../../src/signals/engine.js';
import type { DerivedSignal, WritableSignal } from '../../src/signals/types.js';

// Model-only Node consumers need no DOM library or renderer types.
const scope = createScope({ scopeKey: 'node-model-types' });
const count: WritableSignal<number> = scope.signal$('count', 0);
const doubled: DerivedSignal<number> = scope.derived$('double', () => count.get() * 2);
const value: number = doubled.get();

scope.batch(() => {
	count.set((previous) => previous + 1);
	scope.set(count, value);
});
const unsubscribe = count.subscribe(() => {
	const current: number = scope.get(count);
	void current;
});

// @ts-expect-error Writable values preserve the declared model type.
count.set('invalid');
// @ts-expect-error Derived values remain read-only.
scope.set(doubled, 1);

unsubscribe();
scope.dispose();
