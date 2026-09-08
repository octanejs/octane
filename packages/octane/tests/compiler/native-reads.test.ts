import { afterEach, describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const NAMING = 'OCTANE_NATIVE_SIGNAL_NAME';
const MEMO_READ = 'OCTANE_NATIVE_MEMO_READ';
const FILENAME = '/src/native-reads.tsrx';
const PREFIX = `import { createScope } from 'octane/signals';
const scope = createScope();
const count$ = scope.signal$('count', 0);
`;

function app(setup: string, module = PREFIX) {
	return `${module}
export function App() @{
  ${setup}
  <div />
}`;
}

const modes = [
	{ dev: true },
	{ dev: false, hmr: false },
	{ dev: false, hmr: false, strong: true },
	{ mode: 'server' },
] as const;

describe('native-read compiler option', () => {
	it.each(['useSignal$', 'make$'])(
		'slots a plain local-hook module with imported name %s',
		(name) => {
			const source = `import { useSignal$ as ${name} } from 'octane/signals/client';
export function useCounter$() { return ${name}(0); }`;
			const compiler = createOctaneCompiler({ root: '/project', nativeReads: true });
			expect(
				compiler.transform(source, '/project/src/use-counter.ts', { dev: true, hmr: true })?.kind,
			).toBe('slots');
		},
	);

	it('checks opted-in plain engine modules even when they have no hook import', () => {
		const source = `import { createScope } from 'octane/signals';
const scope = createScope({ scopeKey: 'plain' }); const count = scope.signal$('count', 0);`;
		const compiler = createOctaneCompiler({ root: '/project', nativeReads: true });
		expect(() => compiler.transform(source, '/project/src/store.ts')).toThrow(NAMING);
	});

	it('leaves data-only modules free of renderer initialization, including type imports', () => {
		const compiler = createOctaneCompiler({ root: '/project', nativeReads: true });
		const source = `import type { OctaneNode } from 'octane';
import { createScope } from 'octane/signals';
const scope = createScope({ scopeKey: 'plain' });
export const value$ = scope.signal$('value', 0);`;
		expect(compiler.transform(source, '/project/src/store.ts')).toMatchObject({
			code: source,
			kind: 'none',
		});
	});

	it.each([undefined, false])(
		'rejects unslotted plain local hooks when nativeReads=%s',
		(nativeReads) => {
			const source = `import { useSignal$ } from 'octane/signals/client';
export function useCounter$() { return useSignal$(0); }`;
			const compiler = createOctaneCompiler({ root: '/project', nativeReads });
			expect(() => compiler.transform(source, '/project/src/use-counter.ts')).toThrow(
				'OCTANE_NATIVE_READ_OPT_IN',
			);
			expect(() => slotHooks(source, '/project/src/use-counter.ts', { nativeReads })).toThrow(
				'OCTANE_NATIVE_READ_OPT_IN',
			);
		},
	);

	it.each([undefined, false])(
		'requires explicit opt-in for local hooks when nativeReads=%s',
		(nativeReads) => {
			const source = `import { useSignal$ } from 'octane/signals/client';
export function App() @{ const count$ = useSignal$(0); <div /> }`;
			expect(() => compile(source, FILENAME, { nativeReads })).toThrow('OCTANE_NATIVE_READ_OPT_IN');
		},
	);

	it.each(['true', 1, [], {}])('rejects a non-boolean option %j', (nativeReads) => {
		expect(() => compile(app(''), FILENAME, { nativeReads: nativeReads as any })).toThrow(
			/nativeReads.*boolean/,
		);
	});

	it.each(modes)('keeps opted-out output unchanged in %j', (options) => {
		const source = app('const value = 1;');
		const ordinary = compile(source, FILENAME, options);
		const disabled = compile(source, FILENAME, { ...options, nativeReads: false });
		expect(disabled.code).toBe(ordinary.code);
		expect(disabled.map).toEqual(ordinary.map);
	});

	it.each(['universal', 'valdi'])('rejects the unsupported %s host', (target) => {
		expect(() =>
			compile(app(''), FILENAME, {
				nativeReads: true,
				renderer: { id: 'other', module: 'other-renderer', target } as any,
			}),
		).toThrow(/nativeReads.*DOM/);
	});

	it('rejects an active non-DOM renderer boundary inside a DOM module', () => {
		const source = `import { Canvas } from '@scene/bridge';
export function App() @{ <Canvas><mesh /></Canvas> }`;
		expect(() =>
			compile(source, FILENAME, {
				nativeReads: true,
				rendererBoundaries: {
					'@scene/bridge': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'scene',
							prop: 'children',
						},
					},
				},
				rendererRegistry: { scene: { target: 'universal', module: 'scene-runtime' } },
			}),
		).toThrow('OCTANE_NATIVE_READ_TARGET');
	});

	it('rejects a deferred local derived hook with explicit-owner guidance', () => {
		const source = `import { useDerived$ } from 'octane/signals/client';
export function App() @{ <div /> }`;
		expect(() => compile(source, FILENAME, { nativeReads: true })).toThrow(
			/useDerived\$.*explicitly owned Scope/,
		);
	});
});

describe('native signal capability names', () => {
	it.each([
		['created handles', `const count = scope.signal$('draft-title', 1);`],
		['aliases', 'const alias = count$;'],
		['destructured aliases', 'const { count$: count } = { count$ };'],
		['array destructuring', 'const [count] = [count$];'],
		['object fields', 'const bag = { count: count$ };'],
		['assigned fields', 'const bag = {}; bag.count = count$;'],
		['handle factories', 'function createCount() { return count$; }'],
		['aggregate factories', 'function makeCounter() { return { count$ }; }'],
		['arrow factories', 'const createCount = () => count$;'],
		['live accessor functions', 'function readCount() { return scope.get(count$); }'],
		['live accessor arrows', 'const readCount = () => scope.get(count$);'],
		[
			'live accessor aliases',
			'function readCount$() { return scope.get(count$); } const read = readCount$;',
		],
		['known read parameters', 'function read$(value) { return scope.get(value); }'],
	])('rejects missing suffixes on %s', (_label, setup) => {
		expect(() => compile(app(setup), FILENAME)).not.toThrow();
		expect(() => compile(app(setup), FILENAME, { nativeReads: true })).toThrow(NAMING);
	});

	it.each([
		['export aliases', 'export { count$ as count };'],
		[
			'imported scope factory aliases',
			`import { createScope as makeScope } from 'octane/signals';
const otherScope = makeScope();
const count = otherScope.signal$('other', 0);`,
		],
		[
			'namespace scope imports',
			`import * as signals from 'octane/signals';
const otherScope = signals.createScope();
const count = otherScope.signal$('other', 0);`,
		],
		['local hook aliases', `import { useSignal$ as useSignal } from 'octane/signals/client';`],
	])('rejects missing suffixes through %s', (_label, module) => {
		expect(() => compile(app('', PREFIX + module), FILENAME, { nativeReads: true })).toThrow(
			NAMING,
		);
	});

	it('accepts suffixed capabilities, ordinary snapshots, durable keys, and commands', () => {
		const source = app(`
const alias$ = count$;
const { count$: counter$ } = { count$ };
const [other$] = [alias$];
const values = new Map([['ordinary-data-key', counter$]]);
const durable$ = scope.signal$('draft-title', 0);
function createCounter$() { return { count$: durable$ }; }
function readCount$() { return scope.get(count$); }
const value = scope.get(count$);
const snapshot = count$.snapshot();
const latest = count$.latest(0);
function increment() { scope.set(count$, value + 1); }
const reset = () => scope.set(count$, 0);
`);
		expect(() => compile(source, FILENAME, { nativeReads: true })).not.toThrow();
	});

	it('does not give shadowed or unrelated APIs native semantics', () => {
		const source = app(`
const unrelated = { signal$(value) { return value; }, get(value) { return value; } };
const result = unrelated.signal$(1);
function shadow(createScope) {
  const scope = createScope();
  const value = scope.signal$('field', 1);
  return value;
}
`);
		expect(() => compile(source, FILENAME, { nativeReads: true })).not.toThrow();
	});

	it.each(modes)('reports the authored binding in %j', (options) => {
		const source = app('const wrong = count$;');
		const start = source.indexOf('wrong');
		let diagnostic: any;
		try {
			compile(source, FILENAME, { ...options, nativeReads: true });
		} catch (error) {
			diagnostic = (error as any).diagnostic;
		}
		expect(diagnostic).toMatchObject({
			code: NAMING,
			severity: 'error',
			start: { offset: start },
			end: { offset: start + 5 },
		});
		const editor = compileToVolarMappings(source, FILENAME, { nativeReads: true });
		expect(editor.diagnostics).toContainEqual(diagnostic);
	});
});

describe('native reads and ordinary hook dependencies', () => {
	it.each([', []', ', [count$]'])('diagnoses a live read in useMemo%s', (deps) => {
		const source = app(
			`const value = useMemo(() => scope.get(count$)${deps});`,
			`import { useMemo } from 'octane';\n${PREFIX}`,
		);
		expect(() => compile(source, FILENAME, { nativeReads: true })).toThrow(MEMO_READ);
	});

	it('diagnoses a helper read and a memo import alias without relying on dollar spelling', () => {
		const source = app(
			`const value = memo(readCount$, []);`,
			`
import { useMemo as memo } from 'octane';
${PREFIX}
function readCount$() { return scope.get(count$); }
`,
		);
		expect(() => compile(source, FILENAME, { nativeReads: true })).toThrow(MEMO_READ);
	});

	it.each(modes)('accepts inferred native memo reads in %j', (options) => {
		const source = app(
			`const value = useMemo(() => scope.get(count$));
const alias = memo(readCount$);
const namespace = Octane.useMemo(() => count$.latest(0));`,
			`import { useMemo, useMemo as memo } from 'octane';
import * as Octane from 'octane';
${PREFIX}
function readCount$() { return scope.get(count$); }`,
		);
		expect(() => compile(source, FILENAME, { ...options, nativeReads: true })).not.toThrow();
	});

	it('diagnoses a live read inside a memoized JSX result', () => {
		const source = app(
			'const value = useMemo(() => <span>{count$.get() as string}</span>, []);',
			`import { useMemo } from 'octane';\n${PREFIX}`,
		);
		expect(() => compile(source, FILENAME, { nativeReads: true })).toThrow(MEMO_READ);
	});

	it('keeps sampled dependencies and effect callbacks under their ordinary contract', () => {
		const source = app(
			`
const count = scope.get(count$);
const value = useMemo(() => count, [count]);
const once = useMemo(() => count, []);
const inferred = useMemo(() => count);
const always = useMemo(() => count, null);
const liveEveryRender = useMemo(() => scope.get(count$), null);
useEffect(() => { console.log(scope.get(count$)); }, []);
`,
			`import { useMemo, useEffect } from 'octane';\n${PREFIX}`,
		);
		expect(() => compile(source, FILENAME, { nativeReads: true })).not.toThrow();
	});

	it('does not classify a shadowed useMemo as an Octane hook', () => {
		const source = app(`
const useMemo = (callback) => callback();
const value = useMemo(() => scope.get(count$));
`);
		expect(() => compile(source, FILENAME, { nativeReads: true })).not.toThrow();
	});
});

describe('native-read AST ownership', () => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	afterEach(() => {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	});

	it.each(modes)('does not mutate a frozen parser tree in %j', (options) => {
		const source = `${PREFIX}
function readCount$() { return scope.get(count$); }
export function App(props) @{
  const value = readCount$();
  <ul>
    @for (const item of props.items; key item.id) {
      @if (item.visible) {
        <li>{(value + item.label) as string}</li>
      }
    }
  </ul>
}`;
		process.env.OCTANE_COMPILE_FROZEN_AST = '1';
		const frozen = compile(source, FILENAME, { ...options, nativeReads: true });
		delete process.env.OCTANE_COMPILE_FROZEN_AST;
		const ordinary = compile(source, FILENAME, { ...options, nativeReads: true });
		expect(frozen.code).toBe(ordinary.code);
		expect(frozen.map).toEqual(ordinary.map);
	});
});
