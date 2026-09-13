import { createHash } from 'node:crypto';
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
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
		expect(client).toContain('args.slice(0, 1)');
		expect(client).toContain('args[1], true');
		expect(client).not.toContain('context.viewer');
		expect(server).toContain('__registerServerFunction');
		expect(server).toContain(`id: "${hash('save')}"`);
		expect(server).toContain(`module: "${filename}"`);
		expect(server).toContain('export: "save"');
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
