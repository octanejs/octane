import assert from 'node:assert/strict';
import test from 'node:test';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { parseModule } from '../../packages/octane/src/compiler/parser.node.js';
import { textTypeSourceVersion } from '../../packages/octane/src/compiler/text-type-facts.js';
import { exerciseLateInstanceModels, measurePrimitiveLocalSSR } from './primitive-local-values.mjs';

const adapters = new Set([
	'bindSignalText',
	'bindSignalAttribute',
	'bindSignalValue',
	'bindSignalChecked',
	'ssrSignalValue',
	'ssrSignalControlValue',
]);

function optimizationCalls(code) {
	const program = parseModule(code, 'primitive-local-output.js');
	const names = new Set();
	const capabilityNames = new Set();
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && adapters.has(specifier.imported.name)) {
				names.add(specifier.local.name);
			}
			if (
				specifier.type === 'ImportSpecifier' &&
				['enableSignalBindings', 'enableServerSignalBindings'].includes(specifier.imported.name)
			) {
				capabilityNames.add(specifier.local.name);
			}
		}
	}
	let count = 0;
	const capabilities = [];
	const visit = (node) => {
		if (!node || typeof node !== 'object') return;
		if (node.type === 'CallExpression' && names.has(node.callee?.name)) count++;
		if (node.type === 'CallExpression' && capabilityNames.has(node.callee?.name)) {
			capabilities.push(node.arguments.map((argument) => argument.value));
		}
		for (const [key, child] of Object.entries(node)) {
			if (['loc', 'metadata', 'parent', 'range'].includes(key)) continue;
			if (Array.isArray(child)) child.forEach(visit);
			else if (child && typeof child === 'object') visit(child);
		}
	};
	visit(program);
	return { adapters: count, capabilities };
}

test('immutable primitive locals omit optional value adapters in client and SSR output', (t) => {
	const cases = [
		{ setup: 'const value=String(props.value);', primitive: true },
		{ setup: 'const first=String(props.value);const value=first;', primitive: true },
		{ setup: 'const value=props.value+1;', primitive: true },
		{
			setup: 'const env=globalThis;env.String=props.convert;const value=props.value+1;',
			primitive: true,
		},
		{
			setup: 'const env=globalThis;env[props.name]=props.convert;const value=`${props.value}`;',
			primitive: true,
		},
		{ setup: 'const value=props.active ? String(props.value) : "fallback";', primitive: true },
		{ setup: 'const value=String(props.value) || "fallback";', primitive: true },
		{ setup: 'const value=(props.observe(),String(props.value));', primitive: true },
		{
			setup:
				'const env=globalThis;Object.assign(env,{String:(value)=>value});const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;Object.defineProperty(env,"String",{value:(value)=>value});const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;Reflect.set(env,"String",(value)=>value);const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;const assign=Object.assign;assign(env,{String:(value)=>value});const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;Object[props.method](env,{String:(value)=>value});const value=String(props.value);',
			primitive: false,
		},
		...[
			'env.__defineGetter__("String",()=>props.convert);',
			'env.__defineSetter__("String",props.setter);',
			'Object.setPrototypeOf(env,props.prototype);',
			'Reflect.setPrototypeOf(env,props.prototype);',
			'Reflect.deleteProperty(env,"String");',
			'const mutate=env.__defineGetter__;mutate.call(env,"String",()=>props.convert);',
			'const {setPrototypeOf}=Object;setPrototypeOf(env,props.prototype);',
			'const {deleteProperty}=Reflect;deleteProperty(env,"String");',
		].map((mutation) => ({
			setup: `const env=globalThis;${mutation}const value=String(props.value);`,
			primitive: false,
		})),
		...[
			'(Reflect[props.method] as typeof Reflect.set)(env,"String",props.convert);',
			'(Reflect[props.method]!)(env,"String",props.convert);',
			'(Reflect[props.method] satisfies typeof Reflect.set)(env,"String",props.convert);',
			'(Reflect[props.method] as typeof Reflect.set)?.(env,"String",props.convert);',
			'(Reflect?.[props.method] as typeof Reflect.set)(env,"String",props.convert);',
			'const mutate=Reflect[props.method];mutate(env,"String",props.convert);',
			'Object.assign?.(env,{String:props.convert});',
			'Object?.assign(env,{String:props.convert});',
			'(Object.assign as typeof Object.assign)(env,{String:props.convert});',
		].map((mutation) => ({
			setup: `const env=globalThis;${mutation}const value=String(props.value);`,
			primitive: false,
		})),
		// A computed read on an application receiver cannot reach a global
		// constructor, so the builtin result stays provable beside it.
		{
			setup: 'const observed=props.values[props.index];const value=String(observed);',
			primitive: true,
		},
		{
			setup: 'const observed=props.values[props.index];const value=observed+1;',
			primitive: true,
		},
		{
			setup: 'const observed=props.values[props.index];const value=`${observed}`;',
			primitive: true,
		},
		{
			setup:
				'const env=globalThis;const {assign}=Object;assign(env,{String:(value)=>value});const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;const {set:mutate}=Reflect;mutate(env,"String",(value)=>value);const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;Reflect.set(env,props.name,props.convert);const value=props.value+1;',
			primitive: true,
		},
		{ setup: 'const value=props.value as string;', primitive: false },
		{ setup: 'const value=props.read();', primitive: false },
		{ setup: 'const value=props.api.get();', primitive: false },
		{ setup: 'const value=props.active ? String(props.value) : props.other;', primitive: false },
		{ setup: 'let value=String(props.value);value=props.other;', primitive: false },
		{ setup: 'var value=String(props.value);value=props.other;', primitive: false },
		{ setup: 'const String=props.convert;const value=String(props.value);', primitive: false },
		{ setup: 'const value=String(props.value);eval(props.code);', primitive: false },
		{ setup: 'const value=String(props.value);value=props.other;', primitive: false },
		{ setup: 'const value=String(props.value);[value]=props.values;', primitive: false },
		{
			prefix: 'globalThis.String=(value)=>value;',
			setup: 'const value=String(props.value);',
			primitive: false,
		},
		{
			setup: 'const env=globalThis;env.String=(value)=>value;const value=String(props.value);',
			primitive: false,
		},
		{
			setup: 'const env=globalThis;env[props.name]=(value)=>value;const value=String(props.value);',
			primitive: false,
		},
		{
			setup:
				'const env=globalThis;env["Str"+"ing"]=(value)=>value;const value=String(props.value);',
			primitive: false,
		},
	];
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const saved = new Map(flags.map((flag) => [flag, process.env[flag]]));
	let checked = 0;
	try {
		for (const flag of flags) process.env[flag] = '1';
		for (const mode of ['client', 'server']) {
			for (const dev of [false, true]) {
				for (const extension of ['tsrx', 'tsx']) {
					for (const { setup, primitive, prefix = '' } of cases) {
						const source = `${prefix}\nexport function View(props) ${extension === 'tsrx' ? '@' : ''}{${setup}${extension === 'tsx' ? 'return ' : ''}<section><output title={value}>{value as string}</output><input value={value}/></section>${extension === 'tsx' ? ';' : ''}}`;
						const { code } = compile(source, `/project/primitive-local-values.${extension}`, {
							mode,
							dev,
							hmr: false,
						});
						const calls = optimizationCalls(code);
						const description = `${mode}/${dev}/${extension}: ${setup}`;
						if (primitive) assert.equal(calls.adapters, 0, description);
						else assert.ok(calls.adapters > 0, description);
						assert.deepEqual(calls.capabilities, [[1, true]], description);
						checked++;
					}
				}
			}
		}
	} finally {
		for (const [flag, value] of saved) {
			if (value === undefined) delete process.env[flag];
			else process.env[flag] = value;
		}
	}
	t.diagnostic(`${checked} matched primitive and opaque compiler controls`);
});

test('primitive-local work controls preserve late model event identity and retirement', async () => {
	for (const dev of [false, true]) await exerciseLateInstanceModels({ dev });
});

test('primitive local SSR avoids value probes while opaque locals retain real-handle support', async () => {
	for (const dev of [false, true]) {
		const plain = await measurePrimitiveLocalSSR({ dev });
		const opaque = await measurePrimitiveLocalSSR({ dev, primitive: false });
		assert.deepEqual(plain.scalarCalls, { value: 0, control: 0 });
		assert.deepEqual(opaque.scalarCalls, { value: 600, control: 200 });
	}
});

test('local value certificates retain overlapping typed child protocol proofs', () => {
	for (const [initializer, string] of [
		['String(props.value)', true],
		['props.value+1', false],
	]) {
		for (const mode of ['client', 'server']) {
			for (const dev of [false, true]) {
				for (const extension of ['tsrx', 'tsx']) {
					const filename = `/project/overlapping-local.${extension}`;
					const source = `export function View(props) ${extension === 'tsrx' ? '@' : ''}{const value=${initializer};${extension === 'tsx' ? 'return ' : ''}<p>{value}</p>${extension === 'tsx' ? ';' : ''}}`;
					const start = source.indexOf('>{value}') + 2;
					const range = [start, start + 'value'.length];
					const { code } = compile(source, filename, {
						mode,
						dev,
						hmr: false,
						textTypeFacts: {
							version: 1,
							filename,
							sourceVersion: textTypeSourceVersion(source),
							projectVersion: 'matched-value-control',
							stringChildRanges: string ? [range] : [],
							primitiveTextChildRanges: string ? [] : [range],
						},
					});
					assert.deepEqual(optimizationCalls(code), { adapters: 0, capabilities: [] });
					const imported = new Set(
						parseModule(code, 'overlapping-output.js')
							.body.filter((node) => node.type === 'ImportDeclaration')
							.flatMap((node) => node.specifiers.map((specifier) => specifier.imported?.name)),
					);
					assert.ok(imported.has(mode === 'client' ? 'htext' : 'ssrText'));
				}
			}
		}
	}
});
