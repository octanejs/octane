import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import * as Runtime from '../src/runtime.js';
import {
	STATE_MODEL_CAUSAL,
	STATE_WRITE_CONTEXT,
	markStateModel,
	stateModelOf,
} from '../src/state-model-runtime.js';
import { evaluateCompiledModule } from './_compiled-module.js';

const runtimeModules = { octane: Runtime } as const;

function causalOutputs(source: string): string[] {
	return [
		compile(source, '/src/provenance.tsx', { hmr: false, stateModel: 'causal' }).code,
		slotHooks(source, '/src/provenance.ts', { stateModel: 'causal' })?.code ?? source,
	];
}

function evaluateBoth(source: string): Record<string, any>[] {
	return causalOutputs(source).map((code) => evaluateCompiledModule(code, runtimeModules));
}

function expectAliasFailure(source: string): void {
	for (const run of [
		() => compile(source, '/src/provenance.tsx', { stateModel: 'causal' }),
		() => slotHooks(source, '/src/provenance.ts', { stateModel: 'causal' }),
	]) {
		expect(run).toThrow(
			expect.objectContaining({ code: 'OCTANE_CAUSAL_COMPONENT_ALIAS_UNRESOLVED' }),
		);
	}
}

describe('causal definition provenance', () => {
	it('marks createElement component origins through named aliases and namespace imports', () => {
		for (const module of evaluateBoth(`
import { createElement as h } from 'octane';
const implementation = () => null;
export const descriptor = h(implementation, null);
`)) {
			expect(stateModelOf(module.descriptor.type)).toBe(STATE_MODEL_CAUSAL);
		}

		for (const output of causalOutputs(`
import * as Octane from 'octane';
const implementation = () => null;
export const descriptor = Octane.createElement(implementation, null);
`)) {
			expect(output).toMatch(/markStateModel\(\s*\(\) => null,\s*1,\s*["']implementation["']/);
		}
	});

	it('does not infer createElement provenance from unrelated or shadowed bindings', () => {
		for (const source of [
			`import { createElement as h } from 'another-runtime';
const child = () => null;
export const descriptor = h(child, null);`,
			`import { createElement as h } from 'octane';
const child = () => null;
export const descriptor = ((h) => h(child, null))(foreignFactory);`,
		]) {
			for (const output of causalOutputs(source)) {
				expect(output).not.toContain('markStateModel');
			}
		}
	});

	it('marks const, conditional, and aggregate aliases at their local definitions', () => {
		const modules = evaluateBoth(`
let captured;
const root = { render(value) { captured = value; } };
const implementation = () => null;
const alternative = () => 'text';
const Chosen = true ? implementation : alternative;
const App = Chosen;
root.render(App);
export const selected = captured;
export const first = implementation;
export const second = alternative;
`);
		for (const module of modules) {
			expect(stateModelOf(module.selected)).toBe(STATE_MODEL_CAUSAL);
			expect(stateModelOf(module.first)).toBe(STATE_MODEL_CAUSAL);
			expect(stateModelOf(module.second)).toBe(STATE_MODEL_CAUSAL);
			expect(module.first.name).toBe('implementation');
			expect(module.second.name).toBe('alternative');
		}

		for (const module of evaluateBoth(`
let captured;
const root = { render(value) { captured = value; } };
const implementation = () => null;
const views = { App: implementation };
root.render(views.App);
export const selected = captured;
`)) {
			expect(stateModelOf(module.selected)).toBe(STATE_MODEL_CAUSAL);
			expect(module.selected.name).toBe('implementation');
		}
	});

	it('resolves default and uppercase export aliases without relabeling imports', () => {
		for (const source of [
			`const impl = () => null; export default impl;`,
			`const impl = () => null; export { impl as App };`,
			`const impl = () => null; const alias = impl; export { alias as default };`,
		]) {
			for (const output of causalOutputs(source)) {
				expect(output).toContain('markStateModel');
				expect(output).toMatch(/markStateModel\([^)]*\(\) => null/);
			}
		}

		for (const source of [
			`import { Legacy } from 'legacy'; export { Legacy as App };`,
			`export { default as App } from 'legacy';`,
			`import Legacy from 'legacy'; export default Legacy;`,
		]) {
			for (const output of causalOutputs(source)) {
				expect(output).not.toContain('markStateModel');
			}
		}
	});

	it('stamps callable acronym exports and accepts proven non-callable constants', () => {
		const source = [
			`const implementation = () => null;`,
			`export { implementation as PDF };`,
			`export const COMPONENT_FLAG_BOUNDARY = 1 << 0;`,
			`export const BLOCK_OPEN = '<!--[' + '-->';`,
			`export const STATIC_RECORD = { active: false };`,
			`export const STATIC_LIST = ['br'];`,
		].join('\n');

		for (const output of causalOutputs(source)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']implementation["']\)/);
			expect(output.match(/_\$markStateModel\(/g)).toHaveLength(1);
		}
	});

	it('fails closed for opaque acronym component and constant factories', () => {
		expectAliasFailure(`
function makePDF() { return (props) => { props.write(); return null; }; }
export const PDF = makePDF();
`);
		expectAliasFailure(`
function getContext() { return { active: false }; }
export const STATE_WRITE_CONTEXT = getContext();
`);
	});

	it('keeps alias lookup lexical when nested bindings and writes reuse a spelling', () => {
		for (const module of evaluateBoth(`
let captured;
const root = { render(value) { captured = value; } };
const impl = () => null;
const App = impl;
function unrelated() { let impl = 1; impl = 2; return impl; }
root.render(App);
export const selected = captured;
export const noise = unrelated();
`)) {
			expect(module.noise).toBe(2);
			expect(stateModelOf(module.selected)).toBe(STATE_MODEL_CAUSAL);
		}

		for (const output of causalOutputs(`
const impl = () => null;
const App = impl;
for (const impl of [1]) { void impl; }
switch (1) { case 1: { const impl = 2; void impl; break; } }
root.render(App);
`)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']impl["']\)/);
		}
	});

	it('fails closed for mutable or escaped aggregate component aliases', () => {
		for (const source of [
			`const Local = () => null; const Other = () => null;
const views = { App: Local }; views.App = Other; root.render(views.App);`,
			`const Local = () => null; const views = { App: Local };
mutate(views); root.render(views.App);`,
			`const Local = () => null; const views = { App: Local };
const alias = views; mutate(alias); root.render(views.App);`,
			`const Local = () => null; const views = { App: Local };
export { views }; root.render(views.App);`,
		]) {
			expectAliasFailure(source);
		}
		expectAliasFailure(`
const Local = () => null;
const views = { get App() { return Local; } };
root.render(views.App);
`);
		expectAliasFailure(`
import { createElement as h } from 'octane';
const child = () => null;
const views = { child };
mutate(views);
export function App() { return h(views.child, null); }
`);
	});

	it('marks local branches of mixed local/imported aggregates only', () => {
		for (const output of causalOutputs(`
import { remoteViews } from 'legacy';
const local = () => null;
const localViews = { App: local };
const views = condition ? localViews : remoteViews;
root.render(views.App);
`)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']local["']\)/);
			expect(output).not.toMatch(/markStateModel\([^)]*remoteViews/);
		}
	});

	it('fails closed when a direct local component origin is mutable', () => {
		expectAliasFailure(`let impl = () => null; const App = impl; root.render(App);`);
		expectAliasFailure(`const App = makeComponent(); root.render(App);`);
	});

	it('does not stamp lazy loaders and traces a statically local lazy result', () => {
		for (const output of causalOutputs(`
import { lazy } from 'octane';
const loader = () => import('./Other.js');
export const App = lazy(loader);
`)) {
			expect(output).not.toMatch(/const loader\s*=\s*(?:\/\* @__PURE__ \*\/\s*)?_\$markStateModel/);
		}

		for (const output of causalOutputs(`
import { lazy } from 'octane';
const local = () => null;
const loader = () => Promise.resolve({ default: local });
export const App = lazy(loader);
`)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']local["']\)/);
			expect(output).not.toMatch(/const loader\s*=\s*(?:\/\* @__PURE__ \*\/\s*)?_\$markStateModel/);
		}

		for (const output of causalOutputs(`
import { lazy } from 'octane';
const local = () => null;
export const App = lazy(() => import('./Other.js').then(() => local));
`)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']local["']\)/);
		}
		for (const output of causalOutputs(`
import { lazy } from 'octane';
export const App = lazy(() => import('./Other.js').then((module) => ({ default: module.Named })));
`)) {
			expect(output).not.toMatch(/markStateModel\([^)]*module/);
		}

		for (const output of causalOutputs(`
import { Hydrate, lazy } from 'octane';
export const App = lazy(() => ({
	then(resolve) { resolve({ default: Hydrate }); },
}));
`)) {
			expect(output).not.toMatch(/markStateModel\([^)]*Hydrate/);
			expect(output).not.toMatch(/then\s*=\s*(?:\/\* @__PURE__ \*\/\s*)?_\$markStateModel/);
		}

		for (const output of causalOutputs(`
import { lazy } from 'octane';
const local = () => null;
export const App = lazy(() => ({
	then(resolve) { resolve({ default: local }); },
}));
`)) {
			expect(output).toMatch(/markStateModel\(\(\) => null, 1, ["']local["']\)/);
		}

		expectAliasFailure(`
import { lazy } from 'octane';
export const App = lazy(makeLoader());
`);
		expectAliasFailure(`
import { lazy } from 'octane';
const local = () => null;
const Promise = { resolve(value) { return value; } };
export const App = lazy(() => Promise.resolve(local));
`);
		expectAliasFailure(`
import { Hydrate, lazy } from 'octane';
export const App = lazy(() => ({
	then(resolve) { const fulfill = resolve; fulfill({ default: Hydrate }); },
}));
`);
	});

	it('preserves only native NamedEvaluation sites', () => {
		for (const module of evaluateBoth(`
export const Direct = () => null;
export const Conditional = true ? (() => null) : (() => null);
export const Logical = false || (() => null);
export const Sequence = (0, () => null);
`)) {
			expect(module.Direct.name).toBe('Direct');
			expect(module.Conditional.name).toBe('');
			expect(module.Logical.name).toBe('');
			expect(module.Sequence.name).toBe('');
			for (const value of [module.Direct, module.Conditional, module.Logical, module.Sequence]) {
				expect(stateModelOf(value)).toBe(STATE_MODEL_CAUSAL);
			}
		}

		for (const module of evaluateBoth(`
let captured;
const root = { render(value) { captured = value; } };
const views = { App: () => null };
root.render(views.App);
export const selected = captured;
`)) {
			expect(module.selected.name).toBe('App');
		}
	});

	it('preserves object method identity, home object, and descriptors', () => {
		for (const module of evaluateBoth(`
const base = { useThing(value) { return 'base:' + this.prefix + ':' + value; } };
export const api = {
	__proto__: base,
	prefix: 'x',
	useThing(value) { return super.useThing(value); },
};
`)) {
			const method = Object.getOwnPropertyDescriptor(module.api, 'useThing')?.value;
			expect(method).toBe(module.api.useThing);
			expect(method.name).toBe('useThing');
			expect(Object.hasOwn(method, 'prototype')).toBe(false);
			expect(() => Reflect.construct(method, [])).toThrow(TypeError);
			expect(module.api.useThing('ok')).toBe('base:x:ok');
			expect(stateModelOf(method)).toBe(STATE_MODEL_CAUSAL);
		}
	});

	it('does not invoke unrelated accessors while stamping object methods', () => {
		for (const module of evaluateBoth(`
let reads = 0;
export const api = {
	get danger() { reads++; return () => null; },
	useThing() { return 1; },
};
export function readCount() { return reads; }
`)) {
			expect(module.readCount()).toBe(0);
			expect(stateModelOf(module.api.useThing)).toBe(STATE_MODEL_CAUSAL);
		}
	});

	it('stamps exported aggregate component methods without local JSX evidence', () => {
		for (const module of evaluateBoth(`
const implementation = () => null;
export const views = {
	App() { return null; },
	Primitive: () => 'text',
	Aliased: implementation,
};
`)) {
			expect(stateModelOf(module.views.App)).toBe(STATE_MODEL_CAUSAL);
			expect(stateModelOf(module.views.Primitive)).toBe(STATE_MODEL_CAUSAL);
			expect(stateModelOf(module.views.Aliased)).toBe(STATE_MODEL_CAUSAL);
		}
	});

	it('rejects object methods whose final descriptor can be overwritten dynamically', () => {
		for (const source of [
			`const api = { useThing() { return 1; }, ...other }; export { api };`,
			`const key = getKey(); const api = { useThing() { return 1; }, [key]: other }; export { api };`,
		]) {
			for (const run of [
				() => compile(source, '/src/method.tsx', { stateModel: 'causal' }),
				() => slotHooks(source, '/src/method.ts', { stateModel: 'causal' }),
			]) {
				expect(run).toThrow(
					expect.objectContaining({ code: 'OCTANE_CAUSAL_OBJECT_METHOD_UNSUPPORTED' }),
				);
			}
		}
	});

	it('does not relabel imported function-valued properties', () => {
		for (const output of causalOutputs(`
import { legacy } from 'legacy';
export const api = { useThing: legacy };
`)) {
			expect(output).not.toContain('markStateModel');
		}
	});
});

describe('causal method call boundary', () => {
	it('keeps omitted/permissive method-hook codegen on the historical thunk ABI', () => {
		const source = `
const api = { useThing() { return 1; } };
export function App() { api.useThing(); return <div />; }
`;
		const omitted = compile(source, '/src/App.tsx', { hmr: false }).code;
		const explicit = compile(source, '/src/App.tsx', {
			hmr: false,
			stateModel: 'permissive',
		}).code;
		expect(explicit).toBe(omitted);
		expect(omitted).toContain('withSlot as _$withSlot');
		expect(omitted).not.toContain('withMethodSlot');
		expect(omitted).toMatch(/_\$withSlot\([^,]+, \(\) => api\.useThing\(/);
	});

	it('enters the slot before getter and args, then attributes the method body', () => {
		const order: string[] = [];
		const caller = markStateModel(function caller() {}, STATE_MODEL_CAUSAL);
		let method!: (value: number) => number;
		const receiver = {
			get useThing() {
				order.push(STATE_WRITE_CONTEXT.source === caller ? 'get:caller' : 'get:wrong');
				return method;
			},
		};
		method = markStateModel(function useThing(value: number) {
			order.push(STATE_WRITE_CONTEXT.source === method ? 'call:method' : 'call:wrong');
			return value;
		}, STATE_MODEL_CAUSAL);
		const previous = { ...STATE_WRITE_CONTEXT };
		STATE_WRITE_CONTEXT.active = true;
		STATE_WRITE_CONTEXT.depth = 1;
		STATE_WRITE_CONTEXT.sourceModel = STATE_MODEL_CAUSAL;
		STATE_WRITE_CONTEXT.source = caller;
		try {
			const value = Runtime.withMethodSlot(Symbol('site'), receiver, 'useThing', () => {
				order.push(STATE_WRITE_CONTEXT.source === caller ? 'args:caller' : 'args:wrong');
				return [42];
			});
			expect(value).toBe(42);
		} finally {
			Object.assign(STATE_WRITE_CONTEXT, previous);
		}
		expect(order).toEqual(['get:caller', 'args:caller', 'call:method']);
	});

	it('adds the causal memo ABI only to the lexically imported factory', () => {
		const output = compile(
			`import { memo } from 'octane';
const body = () => null;
export const App = memo(body);
export function callOther(other) { const memo = other; return memo(body); }`,
			'/src/memo.tsx',
			{ stateModel: 'causal' },
		).code;
		expect(output.match(/memo\(body, undefined, 1\)/g)).toHaveLength(1);
		expect(output).toContain('return memo(body)');

		const namespace = compile(
			`import * as Octane from 'octane';
const body = () => null;
export const App = Octane.memo(body);
export function callOther(Octane) { return Octane.memo(body); }`,
			'/src/memo-namespace.tsx',
			{ stateModel: 'causal' },
		).code;
		expect(namespace.match(/Octane\.memo\(body, undefined, 1\)/g)).toHaveLength(1);
		expect(namespace).toContain('return Octane.memo(body)');

		const spread = compile(
			`import { memo } from 'octane';
const body = () => null;
const compare = [];
export const App = memo(body, ...compare);`,
			'/src/memo-spread.tsx',
			{ stateModel: 'causal' },
		).code;
		expect(spread).toMatch(/memo\(body, \.\.\.compare, undefined, 1\)/);
	});
});
