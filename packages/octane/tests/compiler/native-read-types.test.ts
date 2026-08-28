// @vitest-environment node

import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { validateNativeSignalNames } from '../../src/compiler/native-read-types.js';

const TYPES = fileURLToPath(new URL('../../src/signals/types.ts', import.meta.url));
const OCTANE = fileURLToPath(new URL('../../src/index.ts', import.meta.url));
const CLIENT_HOOKS = fileURLToPath(new URL('../../src/signals/client.ts', import.meta.url));
const SERVER_HOOKS = fileURLToPath(new URL('../../src/signals/server.ts', import.meta.url));
const ROOT = '/__octane_native_type_fixture__';
const PRELUDE = `import type { Resource, SignalHandle, WritableSignal, Query, QueryRequest } from 'octane/signals';
declare const task$: Resource<number>;
`;

function fixture(source: string, otherFiles: Record<string, string> = {}) {
	const filename = `${ROOT}/main.ts`;
	const files = new Map<string, string>([
		[filename, source],
		...Object.entries(otherFiles).map(
			([name, text]) => [`${ROOT}/${name}`, text] as [string, string],
		),
	]);
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		types: [],
		paths: {
			'octane/signals': [TYPES],
			octane: [OCTANE],
			'octane/signals/client': [CLIENT_HOOKS],
			'octane/signals/server': [SERVER_HOOKS],
		},
	};
	const host = ts.createCompilerHost(options);
	const readFile = host.readFile;
	const fileExists = host.fileExists;
	const directoryExists = host.directoryExists;
	const getSourceFile = host.getSourceFile;
	host.readFile = (path) => files.get(path) ?? readFile(path);
	host.fileExists = (path) => files.has(path) || fileExists(path);
	host.directoryExists = (path) => path === ROOT || directoryExists?.(path) === true;
	host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => {
		const text = files.get(path);
		return text === undefined
			? getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
			: ts.createSourceFile(path, text, languageVersion, true);
	};
	const program = ts.createProgram({ rootNames: [...files.keys()], options, host });
	const sourceFile = program.getSourceFile(filename)!;
	const errors = program.getSemanticDiagnostics(sourceFile);
	expect(
		errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
	).toEqual([]);
	const diagnostics = validateNativeSignalNames(program, sourceFile);
	return {
		program,
		sourceFile,
		diagnostics,
		names: diagnostics
			.filter((diagnostic) => diagnostic.code === 'OCTANE_NATIVE_SIGNAL_NAME')
			.map((diagnostic) => source.slice(diagnostic.start.offset, diagnostic.end.offset)),
	};
}

describe('optional native signal type validation', () => {
	it.each(['client', 'server'])(
		'recognizes handles imported only through the real %s local hook entry',
		(entry) => {
			const result = fixture(`import { useSignal$ } from 'octane/signals/${entry}';
const value = useSignal$(1);
const value$ = useSignal$(1);
const read = value$.get;
`);
			expect(result.names).toEqual(['value', 'read']);
		},
	);

	it('tracks detached native read methods as accessors and memo callbacks', () => {
		const result = fixture(`${PRELUDE}
import { useMemo } from 'octane';
const read = task$.get;
const read$ = task$.get;
const cached = useMemo(task$.get, []);
const everyRender = useMemo(read$, null);
`);
		expect(result.names).toEqual(['read']);
		expect(
			result.diagnostics.filter((diagnostic) => diagnostic.code === 'OCTANE_NATIVE_MEMO_READ'),
		).toHaveLength(1);
	});

	it('follows imported aliases using the real SignalHandle marker', () => {
		const result = fixture(
			`
import { task$ as task } from './opaque';
const other = task;
export { task as exportedTask };
`,
			{
				'opaque.ts': `import type { Resource } from 'octane/signals';
export declare const task$: Resource<number>;`,
			},
		);
		expect(result.names).toEqual(['task', 'other', 'exportedTask']);
	});

	it('follows native aliases through annotations, destructuring, unions, and generic constraints', () => {
		const result = fixture(`${PRELUDE}
type Task = Resource<number>;
const typed: Task = task$;
const { task$: renamed } = { task$ };
const [item] = [task$];
declare const optional: Task | undefined;
function expose<T extends Task>(value: T): T { return value; }
`);
		expect(result.names).toEqual(['typed', 'renamed', 'item', 'optional', 'expose', 'value']);
	});

	it('checks declared fields, method returns, object properties, and assigned properties', () => {
		const result = fixture(`${PRELUDE}
interface Props { task: Resource<number>; }
class Model {
  declare task: Resource<number>;
  get current() { return task$; }
  create() { return task$; }
}
const bag = { task: task$ };
bag.task = task$;
`);
		expect(result.names).toEqual(['task', 'task', 'current', 'create', 'task', 'task']);
	});

	it('checks factories and synchronous accessors without labeling sampled numbers', () => {
		const result = fixture(`${PRELUDE}
function createTask() { return task$; }
function makeContainer() { return { task$ }; }
const factory = () => task$;
function readTask() { return task$.get(); }
const current = task$.get();
const latest = task$.latest(0);
const snapshot = task$.snapshot();
`);
		expect(result.names).toEqual(['createTask', 'makeContainer', 'factory', 'readTask']);
	});

	it('accepts namespaced types, suffixed capabilities, data keys, and setter commands', () => {
		const result = fixture(`${PRELUDE}
import type * as Signals from 'octane/signals';
const alias$: Signals.Resource<number> = task$;
const registry = new Map<string, Signals.Resource<number>>([['draft-title', task$]]);
declare const count$: WritableSignal<number>;
const increment = () => count$.set(count$.get() + 1);
function readTask$() { return task$.get(); }
function makeTask$() { return task$; }
const { task$: other$ } = { task$ };
`);
		expect(result.diagnostics).toEqual([]);
	});

	it('does not treat request descriptions as live handles', () => {
		const result = fixture(`${PRELUDE}
declare const query: Query<string, number>;
const request: QueryRequest<number> = query('one');
function describe() { return request; }
`);
		expect(result.diagnostics).toEqual([]);
	});

	it('does not infer the native brand from an unrelated unique symbol or structural lookalike', () => {
		const result = fixture(`${PRELUDE}
declare const SIGNAL_HANDLE: unique symbol;
interface Foreign { readonly [SIGNAL_HANDLE]: number; get(): number; }
declare const foreign: Foreign;
const value = foreign;
function readForeign() { return foreign.get(); }
const structurallySimilar = { get() { return 1; }, latest() { return 1; }, snapshot() { return 1; } };
`);
		expect(result.diagnostics).toEqual([]);
	});

	it('diagnoses fixed memo reads while accepting inferred reads, explicit null, and sampled dependencies', () => {
		const result = fixture(`${PRELUDE}
import { useMemo as memo } from 'octane';
const first = memo(() => task$.get(), []);
const second = memo(() => task$.latest(0));
const third = memo(() => task$.snapshot(), [task$]);
const everyRender = memo(() => task$.get(), null);
const sample = task$.get();
const sampled = memo(() => sample, [sample]);
`);
		expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'OCTANE_NATIVE_MEMO_READ',
			'OCTANE_NATIVE_MEMO_READ',
		]);
	});

	it('accepts inferred native memo reads through named, aliased, and namespace imports', () => {
		const result = fixture(`${PRELUDE}
import { useMemo, useMemo as memo } from 'octane';
import * as Octane from 'octane';
const direct = useMemo(() => task$.get());
const alias = memo(() => task$.latest(0));
const namespace = Octane.useMemo(() => task$.snapshot());
`);
		expect(result.diagnostics).toEqual([]);
	});

	it('follows an imported accessor body without labeling its sampled result', () => {
		const result = fixture(`import { read$ as read } from './reader'; const sample = read();`, {
			'reader.ts': `${PRELUDE}export function read$() { return task$.get(); }`,
		});
		expect(result.names).toEqual(['read']);
	});

	it('rejects a stale SourceFile from another Program', () => {
		const first = fixture(`${PRELUDE}const alias$ = task$;`);
		const second = fixture(`${PRELUDE}const alias$ = task$;`);
		expect(() => validateNativeSignalNames(second.program, first.sourceFile)).toThrow(
			/current Program/,
		);
	});
});
