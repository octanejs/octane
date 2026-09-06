import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import { useState } from '../src/index.js';
import ts from 'typescript';
import {
	evaluateCompiledFixtureCode,
	loadCompiledFixtureSource,
	loadPlainHookFixtureSource,
} from './_server-fixture';
import { mount } from './_helpers';

const helperSource = readFileSync(
	resolve(import.meta.dirname, './_fixtures/compiler-transitive-hook.ts'),
	'utf8',
);
const componentSource = readFileSync(
	resolve(import.meta.dirname, './_fixtures/compiler-transitive-hook.tsrx'),
	'utf8',
);
const methodSource = readFileSync(
	resolve(import.meta.dirname, './_fixtures/compiler-method-hook.ts'),
	'utf8',
);

describe('transitive hook ownership', () => {
	for (const mode of ['client', 'server'] as const) {
		for (const inlineHookMemo of [false, true]) {
			it(`lowers optional chains in the selected emitter (${mode}, inline=${inlineHookMemo})`, () => {
				const source = `import { useMemo } from 'octane';
export function useProbe(value) { return useMemo(() => ({ value }), [value]); }
export function readMethod(store) { return [store.method!?.().useValue().value, store.useValue!?.().value]; }
export function read(store) { return [store?.useValue()!.value, store?.useValue?.().value, store?.useValue()._oc$leafSuffix, store?.method!?.().useValue().value, store?.useValue!?.().value]; }`;
				const transformed = slotHooks(source, '/project/src/optional.ts', {
					environment: mode,
					inlineHookMemo,
					dev: false,
					hmr: false,
				});
				expect(transformed?.map !== null).toBe(inlineHookMemo && mode === 'client');
				const helper = loadPlainHookFixtureSource(source, {
					id: '/project/src/optional.ts',
					mode,
					inlineHookMemo,
				});
				expect(helper.read(null)).toEqual([undefined, undefined, undefined, undefined, undefined]);
				const api = {
					value: 'present',
					method() {
						return this;
					},
					useValue() {
						return { value: this.value, _oc$leafSuffix: 'literal' };
					},
				};
				expect(helper.readMethod({})).toEqual([undefined, undefined]);
				expect(helper.readMethod(api)).toEqual(['present', 'present']);
				expect(helper.read(api)).toEqual(['present', 'present', 'literal', 'present', 'present']);
			});
			it(`preserves complete optional method chains (${mode}, inline=${inlineHookMemo})`, () => {
				const helper = loadPlainHookFixtureSource(methodSource, {
					id: '/project/src/methods.ts',
					mode,
					inlineHookMemo,
				});
				expect(helper.evaluateOptionalChainEdges()).toEqual({
					value: 'present',
					deleted: true,
					removed: true,
					returnedUndefined: true,
					missingChild: true,
					parenthesized: true,
					nested: 'present',
					trace: ['receiver', 'getter', 'argument', 'this', 'arg', 'receiver', 'getter', 'this'],
				});
				expect(helper.evaluateOptionalMethodChain(false)).toEqual({
					value: undefined,
					call: undefined,
					optional: undefined,
					trace: [],
				});
				expect(helper.evaluateOptionalMethodChain(true)).toEqual({
					value: 'present',
					call: 'present',
					optional: 'present',
					trace: ['method', 'method', 'read', 'method'],
				});
			});
			it(`preserves method receivers, getters, optional calls and thrown errors (${mode}, inline=${inlineHookMemo})`, () => {
				const helper = loadPlainHookFixtureSource(methodSource, {
					id: '/project/src/methods.ts',
					mode,
					inlineHookMemo,
				});
				expect(helper.evaluateMethodSyntax()).toEqual({
					trace: [
						'receiver',
						'method',
						'argument',
						'store',
						'1',
						'receiver',
						'method',
						'store',
						'1',
					],
					value: 'value',
					missing: undefined,
					after: 'value',
					sameError: true,
				});
			});
		}
	}
	it.each([false, true])('isolates store method calls and preserves this (dev=%s)', (dev) => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const id = '/project/src/methods.ts';
		const out = compiler.transform(methodSource, id, { dev, hmr: false, profile: false });
		const { outputText } = ts.transpileModule(out?.code ?? methodSource, {
			compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext },
		});
		const helper = evaluateCompiledFixtureCode(outputText, id, 'client', undefined);
		const { Pair } = loadCompiledFixtureSource(componentSource, {
			id: '/project/src/Pair.tsrx',
			mode: 'client',
			compileOptions: { dev },
			runtimeModules: { './compiler-transitive-hook': helper },
		});
		const view = mount(Pair);
		try {
			expect(view.container.textContent).toBe('state:firststate:second');
			view.click('button');
			expect(view.container.textContent).toBe('updatedstate:second');
		} finally {
			view.unmount();
		}
	});
	for (const dev of [false, true]) {
		for (const requireDirective of [false, true]) {
			it(`keeps imported alias state independent (dev=${dev}, requireDirective=${requireDirective})`, () => {
				const compiler = createOctaneCompiler({ root: '/project', requireDirective });
				const id = '/project/src/helper.ts';
				const transformed = compiler.transform(helperSource, id, {
					dev,
					hmr: false,
					profile: false,
				});
				const helper = evaluateCompiledFixtureCode(
					transformed?.code ?? helperSource,
					id,
					'client',
					{
						'./hook-alias': { useAliasedState: useState },
					},
				);
				const { Pair } = loadCompiledFixtureSource(componentSource, {
					id: '/project/src/Pair.tsrx',
					mode: 'client',
					compileOptions: { dev },
					runtimeModules: { './compiler-transitive-hook': helper },
				});
				const view = mount(Pair);
				try {
					expect(view.container.textContent).toBe('firstsecond');
					view.click('button');
					expect(view.container.textContent).toBe('updatedsecond');
				} finally {
					view.unmount();
				}
			});
		}
	}
	it('leaves unmarked and foreign helper modules untouched', () => {
		const compiler = createOctaneCompiler({ root: '/project' });
		const source = helperSource.replace('/** @jsxImportSource octane */', '');
		expect(compiler.transform(source, '/project/src/host.ts')?.code ?? source).toBe(source);
		const foreign = '/** @jsxImportSource react */\n' + source;
		expect(compiler.transform(foreign, '/project/src/host.ts')?.code ?? foreign).toBe(foreign);
	});
});
