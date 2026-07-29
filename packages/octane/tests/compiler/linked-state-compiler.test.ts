import { describe, expect, it } from 'vitest';
import { parseModule } from '@tsrx/core';
import { compile } from 'octane/compiler';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

function importedLocal(code: string, imported: string, from = 'octane'): string | undefined {
	const ast = parseModule(code, '/compiled/linked-state.js');
	for (const statement of ast.body ?? []) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== from) continue;
		for (const specifier of statement.specifiers ?? []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				(specifier.imported?.name ?? specifier.imported?.value) === imported
			) {
				return specifier.local?.name;
			}
		}
	}
}

function callsTo(code: string, name: string): any[] {
	const ast = parseModule(code, '/compiled/linked-state.js');
	const calls: any[] = [];
	const visited = new WeakSet<object>();
	const visit = (node: any) => {
		if (node === null || typeof node !== 'object' || visited.has(node)) return;
		visited.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'CallExpression' && node.callee?.name === name) calls.push(node);
		for (const [key, child] of Object.entries(node)) {
			if (!['loc', 'metadata', 'parent'].includes(key)) visit(child);
		}
	};
	visit(ast);
	return calls;
}

function component(tuple: string, options = ''): string {
	return `
		import { useEffect, useLinkedState } from 'octane';
		export function App(props) @{
			const ${tuple} = useLinkedState(props.source, (source) => source.label${options});
			useEffect(() => props.observe(value, setValue${tuple.includes('getValue') ? ', getValue' : ''}));
			<button onClick={() => setValue(value + '!')}>{value as string}</button>
		}
	`;
}

describe('useLinkedState compiler integration', () => {
	it.each(['client', 'server'] as const)(
		'keeps the two-member tuple lean and pads an omitted options argument in %s output',
		(mode) => {
			const code = compile(component('[value, setValue]'), 'linked-state.tsrx', {
				mode,
				inlineHookMemo: false,
			}).code;
			const local = importedLocal(
				code,
				'useLinkedState',
				mode === 'server' ? 'octane/server' : 'octane',
			);
			expect(local).toBeDefined();
			const [call] = callsTo(code, local!);
			expect(call?.arguments).toHaveLength(4);
			expect(call.arguments[2]).toMatchObject({ type: 'Identifier', name: 'undefined' });
			expect(call.arguments[3]?.type).toBe('Literal');
			expect(
				importedLocal(
					code,
					'__useLinkedStateWithGetter',
					mode === 'server' ? 'octane/server' : 'octane',
				),
			).toBeUndefined();
		},
	);

	it.each(['client', 'server'] as const)(
		'only allocates the getter when the third tuple member is observed in %s output',
		(mode) => {
			const code = compile(component('[value, setValue, getValue]'), 'linked-state-getter.tsrx', {
				mode,
				inlineHookMemo: false,
			}).code;
			const local = importedLocal(
				code,
				'__useLinkedStateWithGetter',
				mode === 'server' ? 'octane/server' : 'octane',
			);
			expect(local).toBeDefined();
			expect(callsTo(code, local!)[0]?.arguments).toHaveLength(4);
		},
	);

	it('preserves explicit comparison options ahead of the compiler slot', () => {
		const code = compile(
			component(
				'[value, setValue]',
				', { sourceEqual: props.sameSource, valueEqual: props.sameValue }',
			),
			'linked-state-options.tsrx',
			{ inlineHookMemo: false },
		).code;
		const [call] = callsTo(code, importedLocal(code, 'useLinkedState')!);
		expect(call?.arguments[2]?.type).toBe('ObjectExpression');
		expect(call?.arguments[3]?.type).toBe('Literal');
	});

	it('keeps an omitted options argument unambiguous with development symbol slots', () => {
		const code = compile(component('[value, setValue]'), 'linked-state-hmr.tsrx', {
			hmr: true,
			inlineHookMemo: false,
		}).code;
		const [call] = callsTo(code, importedLocal(code, 'useLinkedState')!);
		expect(call?.arguments).toHaveLength(3);
		expect(call.arguments[2]?.type).toBe('Identifier');
	});

	it.each([
		{
			label: 'named alias',
			declaration: "import { useLinkedState as linked } from 'octane';",
			call: 'linked',
		},
		{
			label: 'namespace import',
			declaration: "import * as Octane from 'octane';",
			call: 'Octane.useLinkedState',
		},
	])('specializes observed getters reached through a $label', ({ declaration, call }) => {
		const source = `
			${declaration}
			export function App(props) @{
				const [value, setValue, getValue] = ${call}(props.source, (source) => source);
				props.observe(setValue, getValue);
				<span>{value as string}</span>
			}
		`;
		const code = compile(source, 'linked-state-import.tsrx').code;
		const helper = importedLocal(code, '__useLinkedStateWithGetter');
		expect(helper).toBeDefined();
		expect(callsTo(code, helper!)).toHaveLength(1);
	});

	it('omits the stable linked-state setter and getter from inferred effect dependencies', () => {
		const code = compile(component('[value, setValue, getValue]'), 'linked-state-deps.tsrx', {
			inlineHookMemo: false,
		}).code;
		const effect = callsTo(code, importedLocal(code, 'useEffect')!)[0];
		expect(effect?.arguments[1]?.elements).toMatchObject([
			{ type: 'MemberExpression', property: { name: 'observe' } },
			{ type: 'Identifier', name: 'value' },
		]);
	});

	it('slots linked state in plain TypeScript without turning omitted options into a number', () => {
		const source = `
			import { useLinkedState } from 'octane';
			export function useDraft<T extends { label: string }>(source: T) {
				const [value, setValue] = useLinkedState(source, (next) => next.label);
				return [value, setValue] as const;
			}
		`;
		const code = slotHooks(source, 'use-draft.ts')?.code;
		expect(code).toBeDefined();
		const [call] = callsTo(code!, importedLocal(code!, 'useLinkedState')!);
		expect(call?.arguments).toHaveLength(3);
		expect(call.arguments[2]?.type).toBe('Identifier');
		expect(code).toContain('T extends { label: string }');
	});

	it('selects the getter-enabled helper for plain-TypeScript three-member tuples', () => {
		const source = `
			import { useLinkedState as linked } from 'octane';
			export function useDraft(source: string) {
				const [value, setValue, getValue] = linked(source, (next) => next);
				return { value, setValue, getValue };
			}
		`;
		const code = slotHooks(source, 'use-draft-getter.ts')?.code;
		expect(code).toBeDefined();
		const helper = importedLocal(code!, '__useLinkedStateWithGetter');
		expect(helper).toBeDefined();
		const [call] = callsTo(code!, helper!);
		expect(call?.arguments).toHaveLength(3);
		expect(call.arguments[2]?.type).toBe('Identifier');
	});

	it('keeps explicit comparison options ahead of a plain-TypeScript symbol slot', () => {
		const source = `
			import { useLinkedState } from 'octane';
			export function useDraft(source: string) {
				const [value, setValue] = useLinkedState(source, (next) => next, {
					sourceEqual: Object.is,
				});
				return { value, setValue };
			}
		`;
		const code = slotHooks(source, 'use-draft-options.ts')?.code;
		expect(code).toBeDefined();
		const [call] = callsTo(code!, importedLocal(code!, 'useLinkedState')!);
		expect(call?.arguments).toHaveLength(4);
		expect(call.arguments[2]?.type).toBe('ObjectExpression');
		expect(call.arguments[3]?.type).toBe('Identifier');
	});

	it('preserves the latest-value getter when an entire linked tuple escapes', () => {
		const source = `
			import { useLinkedState } from 'octane';
			export function App(props) @{
				const state = useLinkedState(props.source, (next) => next);
				props.observe(state);
				<span>{state[0] as string}</span>
			}
		`;
		const code = compile(source, 'linked-state-escaped.tsrx').code;
		const helper = importedLocal(code, '__useLinkedStateWithGetter');
		expect(helper).toBeDefined();
		expect(callsTo(code, helper!)).toHaveLength(1);
	});

	it('rejects a linked-state hook called from a plain JavaScript loop', () => {
		const source = `
			import { useLinkedState } from 'octane';
			export function App(props) @{
				for (const item of props.items) {
					useLinkedState(item, (next) => next);
				}
				<div />
			}
		`;
		expect(() => compile(source, 'linked-state-loop.tsrx')).toThrow(/hook.*loop|loop.*hook/i);
	});

	it('routes linked-state calls and getter helpers through universal renderers', () => {
		const renderer = {
			id: 'object',
			module: 'octane/universal',
			target: 'universal' as const,
			text: 'host' as const,
		};
		const lean = compile(component('[value, setValue]'), 'linked-state.object.tsrx', {
			renderer,
			inlineHookMemo: false,
		}).code;
		expect(importedLocal(lean, 'useLinkedState', 'octane/universal')).toBeDefined();

		const observed = compile(
			component('[value, setValue, getValue]'),
			'linked-getter.object.tsrx',
			{
				renderer,
				inlineHookMemo: false,
			},
		).code;
		expect(importedLocal(observed, '__useLinkedStateWithGetter', 'octane/universal')).toBeDefined();
	});
});
