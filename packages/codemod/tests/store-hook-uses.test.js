import { expect, it } from 'vitest';
import { transformModule } from '../dist/index.js';

function migrate(source) {
	return transformModule(source, 'Panel.tsx', {
		unported: (name) => (name === 'observer' ? name : null),
		resolveStoreHook: (module, name, safe) =>
			module === 'observer' && safe((source, name) => source === './counter' && name === 'counter')
				? { from: './bindings.ts', name }
				: null,
	});
}

it('moves a checked alias and keeps the package initializer and dependency comparison', () => {
	const result = migrate(`
		import { useReading as useValue } from 'observer';
		import { useEffect as after } from 'react';
		import { counter } from './counter';
		export function Panel() {
			const value = useValue(counter);
			after(() => {}, [value]);
			return <p>{String(value)}</p>;
		}`);
	expect(result.code).toContain("useReading as useValue } from './bindings.ts'");
	expect(result.code).toContain("import 'observer';");
	expect(result.unported).toEqual([]);
});

it.each([
	[
		'a type assertion hiding an element',
		'const value = <b/> as unknown as string; useStore().write(0, value);',
	],
	['a dynamically accessed binding', "const owner = useStore(); (eval)('owner.mutate()');"],
	['a method writing an element', 'const scope = useStore(); scope.write(0, {icon: <b/>});'],
	['an escaped callback', 'const { write } = useStore(); write(0, () => ({icon: <b/>}));'],
	['a renderer-owned hook input', 'const value = useStore(<b/>); void value;'],
	['an element-valued input alias', 'const config = {icon:<b/>}; void useStore(config);'],
	['a store value rendered as a child', 'const value = useStore(); return <p>{value}</p>;'],
	['a hook alias passed to a helper', 'invoke(useStore);'],
	['a shadowed coercion', 'const String = (item) => register(item); String(useStore());'],
	['an unknown dependency-list consumer', 'track(() => {}, [useStore()]);'],
	['a nested callback', 'const load = () => useStore(); void load();'],
])('keeps the diagnostic for %s', (_, body) => {
	const result = migrate(`import {useStore} from 'observer';
		export function Panel() { ${body} return <p/>; }`);
	expect(result.rules['store-hook']).toBeUndefined();
	expect(result.unported).toHaveLength(1);
});

it('defers a component passed to an unknown renderer', () => {
	const result = migrate(`import {useStore} from 'observer';
		function Panel() { return <p>{Boolean(useStore())}</p>; } register(Panel);`);
	expect(result.rules['store-hook']).toBeUndefined();
	expect(result.unported).toHaveLength(1);
});

it('rejects a renderer-specific imported input even when the hook returns a condition', () => {
	const result = migrate(`import {useStore} from 'observer'; import {createElement} from 'react';
		export function Panel() { return <p>{Boolean(useStore(createElement))}</p>; }`);
	expect(result.rules['store-hook']).toBeUndefined();
	expect(result.unported).toHaveLength(1);
});

it('requires the original result to establish a scalar type', () => {
	const result = migrate(`import {useStore} from 'observer';
		export function Panel() { const text: string = useStore(); return <p>{text}</p>; }`);
	expect(result.rules['store-hook']).toBeUndefined();
});
