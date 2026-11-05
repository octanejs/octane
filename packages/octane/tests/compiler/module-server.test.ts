import { createHash } from 'node:crypto';
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { dataSchema } from 'octane/data';
import * as rpcRuntime from 'octane/internal/server-rpc';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { compile } from '../../src/compiler/compile.js';

const source = `
module server {
	import { basename as base } from 'node:path';
	export async function greet(name: string) {
		return 'hello ' + base(name);
	}
	export const add = (a: number, b: number) => a + b;
}

import { greet as callGreet, add } from 'server';

export function App() @{
	<button onClick={() => callGreet('/tmp/octane')}>{'Sum: ' + add(1, 2)}</button>
}
`;

const filename = '/src/App.tsrx';
const hash = (name: string) =>
	createHash('sha256')
		.update(filename + '#' + name)
		.digest('hex')
		.slice(0, 8);

describe('module server compilation', () => {
	it('emits browser RPC stubs without shipping the server implementation', () => {
		const code = compile(source, filename, { mode: 'client' }).code;
		expect(code).toContain('__serverRpc as _$__serverRpc');
		expect(code).toContain(`_$__serverRpc("${hash('greet')}", args)`);
		expect(code).toContain(`_$__serverRpc("${hash('add')}", args)`);
		// Once per module, so only pages that can call the server preload a reader.
		expect(code.match(/_\$__serverRpcPreload\(\)/g)).toHaveLength(1);
		expect(compile('export const x = 1;', filename, { mode: 'client' }).code).not.toContain(
			'__serverRpcPreload',
		);
		expect(code).not.toContain('node:path');
		expect(code).not.toContain('hello ');
	});

	it('emits a server namespace, external imports, and dev registrations', () => {
		const code = compile(source, filename, { mode: 'server' }).code;
		const output = parseModule(code, 'compiled.js');
		expect(code).toContain('export const _$_server_$_ = (() => {');
		expect(
			output.body.some(
				(node) => node.type === 'ImportDeclaration' && node.source.value === 'node:path',
			),
		).toBe(true);
		expect(code).toContain('server["greet"] = greet');
		expect(code).toContain(`set("${hash('greet')}", ["${filename}", "greet"])`);
		expect(code).toContain('const callGreet = _$_server_$_["greet"]');
	});

	it('supports aliased exports only when they resolve to local functions', () => {
		const aliased = `
module server {
	function implementation(value: string) { return value; }
	const alias = implementation;
	export { alias as invoke };
}
import { invoke } from 'server';
`;
		const client = compile(aliased, filename, { mode: 'client' }).code;
		const server = compile(aliased, filename, { mode: 'server' }).code;
		expect(client).toContain(`_$__serverRpc("${hash('invoke')}", args)`);
		expect(server).toContain('server["invoke"] = alias');

		expect(() =>
			compile(`module server { export const value = 42; }`, filename, { mode: 'server' }),
		).toThrow(/initialized with a function/);
		expect(() =>
			compile(`module server { const value = 42; export { value }; }`, filename, {
				mode: 'server',
			}),
		).toThrow(/reference local functions/);
	});

	it('registers trusted final ServerCallContext and keeps it out of browser arguments', () => {
		const contextual = `
module server {
	import type { ServerCallContext } from 'octane/server';
	export async function save(value: string, context: ServerCallContext) {
		return context.viewer ? value : 'anonymous';
	}
}
import { save } from 'server';
export function App() @{ <button onClick={() => save('draft')}>Save</button> }
`;
		const client = compile(contextual, filename, { mode: 'client' }).code;
		const server = compile(contextual, filename, { mode: 'server' }).code;
		expect(client).toContain(`_$__serverRpcStream("${hash('save')}", args.slice(0, 1), args[1])`);
		expect(client).not.toContain('context.viewer');
		expect(server).toContain('__registerServerFunction');
		expect(server).toContain(`id: "${hash('save')}"`);
		expect(server).toContain(`module: "${filename}"`);
		expect(server).toContain('export: "save"');
	});

	it('exposes local parsers to both targets and registers only functions as RPCs', () => {
		const contract = `
module server {
	import { dataSchema as s } from 'octane/data';
	import { provider } from './private.js';
	export const unused = s.object({ neverBundleThisField: s.string() });
	const id = s.integer({ minimum: -1 });
	const row = s.object({ id, starred: s.boolean(), cursor: s.nullable(s.string()), state: s.enum(['ready', 'failed']) });
	export const list = s.array(row);
	export function get() { return list.parse(provider()); }
}
import { list as files, list as again, get } from 'server';
export { files, again, get };
`;
		const browser = compile(contract, filename, { mode: 'client' }).code;
		expect(browser).not.toContain('neverBundleThisField');
		expect(browser).not.toContain('./private.js');
		const rows = [
			{ id: -1, starred: true, cursor: null, state: 'ready' },
			{ id: 0, starred: false, cursor: 'opaque', state: 'failed' },
		];
		const identities = new Set<string>();
		for (const mode of ['client', 'server'] as const) {
			const target = loadCompiledFixtureSource(contract, {
				id: filename,
				mode,
				runtimeModules: {
					'octane/data': { dataSchema },
					'octane/internal/server-rpc': rpcRuntime,
					...(mode === 'server' ? { './private.js': { provider: () => rows } } : {}),
				},
			});
			expect(target.files.parse(rows)).toEqual(rows);
			expect(typeof target.files.identity).toBe('string');
			identities.add(target.files.identity);
			expect(target.again).toBe(target.files);
			expect(() => target.files.parse([{ ...rows[0], id: -2 }])).toThrow();
			expect(() => target.files.parse([{ ...rows[0], cursor: false }])).toThrow();
			expect(() => target.files.parse([{ ...rows[0], state: 'unknown' }])).toThrow();
			if (mode === 'server') {
				expect(Object.keys(target._$_server_$_)).toEqual(['get']);
				expect(target.get()).toEqual(rows);
			}
		}
		expect(identities.size).toBe(1);
	});

	it('exposes public functions and schemas directly to their TSRX file', () => {
		const source = `module server {
			import { dataSchema as s } from 'octane/data';
			import { provider } from './private.js';
			export const page = s.object({ cursor: s.nullable(s.string()) });
			export const unused = s.object({ neverShipThisField: s.string() });
			export function search(input) { return page.parse(provider(input)); }
		}
		export const validate = (input) => page.parse(input);
		export const run = (input) => search(input);`;
		const client = compile(source, filename, { mode: 'client' }).code;
		expect(client).not.toContain('neverShipThisField');
		expect(client).not.toContain('./private.js');
		for (const mode of ['client', 'server'] as const) {
			const target = loadCompiledFixtureSource(source, {
				id: filename,
				mode,
				runtimeModules: {
					'octane/data': { dataSchema },
					'octane/internal/server-rpc': rpcRuntime,
					...(mode === 'server' ? { './private.js': { provider: (v: unknown) => v } } : {}),
				},
			});
			expect(target.validate({ cursor: null })).toEqual({ cursor: null });
			expect(() => target.validate({ cursor: false })).toThrow();
			if (mode === 'server') {
				expect(Object.keys(target._$_server_$_)).toEqual(['search']);
				expect(target.run({ cursor: 'next' })).toEqual({ cursor: 'next' });
			}
		}
	});

	it('supports ordinary file re-exports and preserves lexical shadowing and private exports', () => {
		const source = `module server {
			const privateKey = 'server-only';
			export function read() { return privateKey; }
			export function shadowed() { return privateKey; }
		}
		export { read as readFile };
		export const choose = (shadowed) => shadowed;
		export const labels = { shadowed: 'local' };`;
		const client = compile(source, filename, { mode: 'client' }).code;
		expect(client).not.toContain('server-only');
		expect(client).not.toContain('const shadowed =');
		const server = loadCompiledFixtureSource(source, { id: filename, mode: 'server' });
		expect(server.readFile()).toBe('server-only');
		expect(server.choose('caller')).toBe('caller');
		for (const mode of ['client', 'server'] as const) {
			for (const invalid of ['privateKey', 'missing']) {
				expect(() => compile(source + '\nexport { ' + invalid + ' };', filename, { mode })).toThrow(
					new RegExp(invalid),
				);
			}
		}
	});

	it('keeps only free values and real typeof queries in TypeScript output', () => {
		const block = `module server {
			import { dataSchema as s } from 'octane/data';
			export const page = s.string();
			export function read() { return 42; }
		}`;
		for (const tail of [
			'export const names = obj => obj.page + obj.read;',
			'export function use(read, page) { return read(page); }',
			'type Local = (page: string) => typeof page;',
		]) {
			const code = compile(block + tail, filename, { mode: 'client', output: 'ts' }).code;
			expect(code).not.toContain('__serverRpc');
			expect(code).not.toContain('octane/data');
		}
		const type = 'export type Input = ReturnType<typeof page.parse>;';
		const schemaOnly = compile(block + 'export const parse = page.parse;', filename, {
			mode: 'client',
		});
		expect(schemaOnly.code).toContain('octane/data');
		expect(schemaOnly.code).not.toContain('__serverRpc');
		expect(compile(block + type, filename, { mode: 'client', output: 'ts' }).code).toContain(
			'octane/data',
		);
		expect(compile(block + type, filename, { mode: 'client' }).code).not.toContain('octane/data');
	});

	it('creates RPC stubs only for lexical reads of a server function', () => {
		const block = 'module server { export function read() { return 42; } }';
		for (const source of [
			"export { foo as read } from './other.js';",
			"export * as read from './other.js';",
			'const foo = 1; export { foo as read };',
			'export class C { read() {} static read = 1; }',
			'export function x() { if (true) { var read = 1; } return read; }',
			'export function x(xs) { for (var read of xs) {} return () => read; }',
			'if (true) { var read = 1; } export const result = read;',
			'export class C { static { if (true) { var read = 1; } this.value = read; } }',
			'export const C = class read { field = read };',
			'export const object = { read() {}, get prop() { return this.read; } };',
			'export function go() { read: for (;;) { break read; } }',
		]) {
			expect(compile(block + source, filename, { mode: 'client' }).code).not.toContain(
				'__serverRpc',
			);
		}
		for (const source of [
			'export { read as fetchValue };',
			'export class C { [read()]() {} }',
			'export const object = { read };',
			'export class C { static field = read(); }',
			'class C { static { var read = 1; } } export const value = read();',
			'export function x() { class C { static { var read = 1; } } return read(); }',
			'export function x() { function nested() { var read = 1; } return read(); }',
			'export function x(defaultValue = read()) { if (true) { var read = 1; } return defaultValue; }',
		]) {
			expect(compile(block + source, filename, { mode: 'client' }).code).toContain(hash('read'));
		}
	});

	it('keeps quoted schema imports and authored names independent of generated bindings', () => {
		const contract = `
module server {
	import { 'dataSchema' as __oct_server_import$0 } from 'octane/data';
	const __octaneServerSchema = __oct_server_import$0.boolean();
	export const server = __oct_server_import$0.array(__octaneServerSchema);
	export function useSchema() { return server; }
}
import { 'server' as __oct_server_import$0, useSchema as _$_rpc_modules_$_ } from 'server';
export { __oct_server_import$0 as flags, _$_rpc_modules_$_ as useSchema };
`;
		for (const mode of ['client', 'server'] as const) {
			const target = loadCompiledFixtureSource(contract, {
				id: filename,
				mode,
				runtimeModules: { 'octane/data': { dataSchema }, 'octane/internal/server-rpc': rpcRuntime },
			});
			expect(target.flags.parse([true])).toEqual([true]);
			if (mode === 'server') expect(target.useSchema()).toBe(target.flags);
			expect(() =>
				compile(
					`module server { export function f(){} } import { f as _$_server_$_ } from 'server';`,
					filename,
					{ mode },
				),
			).toThrow(/reserved/);
		}
	});

	it('rejects executable, mutable and untrusted schema definitions on both targets', () => {
		for (const source of [
			"import { dataSchema as s } from './private'; export const page = s.string();",
			"import { dataSchema as s } from 'octane/data'; export let page = s.string();",
			"import { dataSchema as s } from 'octane/data'; export const page = s.integer({minimum: secret()});",
			"import { dataSchema as s } from 'octane/data'; export const page = s.object({get id(){return s.string()}});",
			"import { dataSchema as s } from 'octane/data'; export const page = s.object({...secret});",
			"import { dataSchema as s } from 'octane/data'; export const page = s.array(later); const later = s.string();",
			"import { dataSchema as s } from 'octane/data'; export const page = s.array(page);",
		]) {
			for (const mode of ['client', 'server'] as const) {
				expect(() =>
					compile(`module server {${source}} import {page} from 'server';`, filename, { mode }),
				).toThrow(/initialized with a function/);
			}
		}
	});

	it('only recognizes the trusted context type in final position', () => {
		const untrusted = `module server {
		interface ServerCallContext { viewer: unknown }
		export function inspect(context: ServerCallContext) { return context.viewer; }
	}`;
		expect(compile(untrusted, filename, { mode: 'server' }).code).not.toContain(
			'__registerServerFunction',
		);
		expect(() =>
			compile(
				`module server {
					import type { ServerCallContext } from 'octane/server';
					export function invalid(context: ServerCallContext, value: string) { return value; }
				}`,
				filename,
				{ mode: 'server' },
			),
		).toThrow(/final parameter/);
	});

	it('rejects invalid local server imports and duplicate submodules', () => {
		expect(() =>
			compile(`import { nope } from 'server'; export function App() @{ <p /> }`, filename),
		).toThrow(/no `module server`/);
		expect(() =>
			compile(`module server { export function ok() {} } import { nope } from 'server';`, filename),
		).toThrow(/does not export `nope`/);
		expect(() => compile(`module server {} module server {}`, filename)).toThrow(
			/Only one `module server`/,
		);
		expect(() =>
			compile(
				`import { database } from './database.js'; module server { export function save() { return database.save(); } }`,
				filename,
			),
		).toThrow(/declare or import them inside the server block/);
		expect(() =>
			compile(`function nested() { module server { export function nope() {} } }`, filename),
		).toThrow(/only be declared at module level/);
	});
});
