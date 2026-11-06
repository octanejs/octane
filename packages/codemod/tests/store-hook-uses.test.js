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

it.each([
	['an opaque method result', 'const value = store.read(counter); return <p>{value}</p>;'],
	['a foreign handle', 'store.write(other, true);'],
	['a computed method', 'store[method](counter, true);'],
	[
		'a computed destructuring key',
		'const {[String(<b/>)]: child} = store; child.write(counter,true);',
	],
	[
		'a destructuring default',
		'const {entry: child = take(<b/>)} = store; child.write(counter,true);',
	],
	[
		'an intermediate method result',
		'function checked(value): string {return String(value)} const child = store.open(checked(<b/>)); child.write(counter,true);',
	],
	['an indexed receiver', 'const channel = store[String(<b/>)]; channel.write(counter, true);'],
	[
		'a typed callback with a renderer argument',
		'const put = (label: string) => { store.write(counter, label); }; put(<b/> as unknown as string);',
	],
	['JSX hidden by a cast', 'store.write(counter, <b/> as unknown as string);'],
	['a local initializer hiding JSX', 'const label = String(<b/>); store.write(counter, label);'],
	['a callback payload', 'store.write(counter, () => <b/>);'],
])('keeps the diagnostic for %s in a call with a shared handle', (_, body) => {
	const result = migrate(`import {useStore} from 'observer';
		import {counter, other} from './counter';
		export function Panel() { const store = useStore(); ${body} return <p/>; }`);
	expect(result.unported).toHaveLength(1);
});

it('keeps mixed receivers separate from a verified store of known origin', () => {
	const result = transformModule(
		`import {useFirst} from 'first'; import {useSecond} from 'second';
		import {counter} from './counter';
		export function Panel({active}) {
			const first = useFirst(), second = useSecond();
			const store = active ? first : second;
			store.write(counter, true);
			return <p/>;
		}`,
		'Panel.tsx',
		{
			unported: (module) => (['first', 'second'].includes(module) ? module : null),
			resolveStoreHook: (module, name, safe) =>
				safe((source, key) => module === 'first' && source === './counter' && key === 'counter')
					? { from: './bindings.ts', name }
					: null,
		},
	);
	expect(result.rules['store-hook']).toBeUndefined();
	expect(result.unported.map((entry) => entry.name)).toEqual(['first', 'second']);
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

it('accepts scalar-branded inputs and conditional choices of the original handle', () => {
	const prefix = `import {useStore} from 'observer';import {counter} from './counter';
		type Id=string & {readonly brand: unique symbol};
		export function Panel({id,on}:{id:Id,on:boolean}){`;
	const converted = migrate(
		prefix + 'useStore(on ? counter : null,id);useStore(on && counter,{id});return <p/>;}',
	);
	expect(converted.rules['store-hook']).toBe(1);
	for (const value of [
		'on ? counter : (<i/> as unknown as string)',
		'on ? counter : function render(){}',
		'on && {id: <b/>}',
		'{id: (<b/> as unknown as string)}',
	]) {
		expect(
			migrate(prefix + `useStore(${value});return <p/>;}`).rules['store-hook'],
		).toBeUndefined();
	}
});

it.each(['any', 'never', 'unknown', '(string & {brand:true}) | {render():unknown}'])(
	'defers a non-scalar input typed %s',
	(type) => {
		const result = migrate(
			`import {useStore} from 'observer';export function Panel({id}:{id:${type}}){useStore(id);return <p/>;}`,
		);
		expect(result.rules['store-hook']).toBeUndefined();
	},
);

it('rejects local renderer values hidden behind a branded result, call or destructuring', () => {
	const base = `import {useStore} from 'observer'; import type {ReactElement} from 'react';
		type Id=string & {readonly brand:unique symbol}; declare function getId(x: ReactElement):Id;`;
	for (const body of [
		'useStore().write(0,getId(<b/>));',
		'const {id}={id:<b/> as unknown as Id}; useStore().write(0,id);',
		'const tree=<b/>;function get(){return getId(tree)} useStore().write(0,get());',
		'const bad=(<b/> as unknown as Id)!;useStore().write(0,{bad});',
	]) {
		expect(
			migrate(base + `export function Panel(){${body}return <p/>;}`).rules['store-hook'],
		).toBeUndefined();
	}
});
