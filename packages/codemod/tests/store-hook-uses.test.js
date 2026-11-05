import { expect, it } from 'vitest';
import { transformModule } from '../dist/index.js';

function migrate(source, target = 'tsrx') {
	return transformModule(source, 'Panel.tsx', {
		target,
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

it.each([
	['direct default', "import Mark from './mark.svg';", '<Mark/>'],
	['named default', "import {default as Mark} from './mark.svg';", '<Mark/>'],
	[
		'selected alias',
		"import Mark from './mark.svg';",
		'<Selected/>',
		'const Copy = Mark; const Selected = active ? Local : (Copy as typeof Mark);',
	],
	[
		'explicit React island',
		"import Mark from './mark.svg'; import {ReactCompat} from 'octane/react';",
		'<ReactCompat><Mark/></ReactCompat>',
	],
])('reports the %s SVG tag independently of the store hook', (_, imports, jsx, setup = '') => {
	const result = migrate(`import {useStore} from 'observer'; ${imports}
		function Local(){ return <b/>; }
		export function Panel() { const active = Boolean(useStore()); ${setup} return ${jsx}; }`);
	expect(result.rules['store-hook']).toBe(1);
	expect(result.unported).toEqual([]);
	expect(
		result.notes.filter((n) => n.severity === 'error' && n.message.includes('SVG')),
	).toHaveLength(1);
});

it('keeps SVG data uses, shadowed JSX tags and explicit loader conventions separate', () => {
	const result = migrate(`import {useStore} from 'observer';
		import Url from './image.svg'; import ReactGlyph from './glyph.svg?react';
		import {ReactComponent as Named} from './glyph.svg';
		export function Panel() { const active = Boolean(useStore());
			function Badge(Url) { return <Url/>; }
			return <div><img src={active ? Url : ''}/><ReactGlyph/><Named/></div>;
		}`);
	expect(result.rules['store-hook']).toBe(1);
	expect(result.notes.filter((n) => n.severity === 'error' && n.message.includes('SVG'))).toEqual(
		[],
	);
});

it('checks the issuer for SVG tags in the same migrated file', () => {
	const result = migrate(`import {useStore} from 'observer'; import Mark from './mark.svg';
		export function Panel(){return <p>{Boolean(useStore())}</p>;}
		export function Badge(){return <Mark/>;}`);
	expect(result.rules['store-hook']).toBe(1);
	expect(
		result.notes.filter((n) => n.severity === 'error' && n.message.includes('SVG')),
	).toHaveLength(1);
});

it('only generates native hook imports for callers compiled as TSRX', () => {
	const result = migrate(
		`import {useStore} from 'observer'; import Mark from './mark.svg';
		export function Panel(){return Boolean(useStore()) ? <Mark/> : null;}`,
		'tsx',
	);
	expect(result.rules['store-hook']).toBeUndefined();
	expect(result.notes.some((n) => n.rule === 'store-hook')).toBe(false);
});
