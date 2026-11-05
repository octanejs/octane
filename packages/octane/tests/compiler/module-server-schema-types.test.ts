// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { compileToVolarMappings } from 'octane/compiler';

describe('module server schema types', () => {
	it('preserves local parser values and derives the contextual caller type from their result', () => {
		const source = `module server {
			import { dataSchema as s } from 'octane/data';
			import type { ServerCallContext } from 'octane/server';
			export const state = s.enum(['ready', 'failed']);
			export const page = s.object({ page: s.integer({ minimum: 1 }), cursor: s.nullable(s.string()) });
			export function read(input: ReturnType<typeof page.parse>, ctx: ServerCallContext) {
				return page.parse(input).page;
			}
		}
		const request = page;
		export { read, state };`;
		const { code, errors } = compileToVolarMappings(source, 'Files.tsrx');
		expect(errors).toEqual([]);
		const root = mkdtempSync(join(tmpdir(), 'octane-schema-types-'));
		try {
			const file = join(root, 'Files.tsx');
			writeFileSync(
				file,
				code +
					`
export const firstPage: number = request.parse({page: 1, cursor: null}).page;
export const result: Promise<number> = read({page: 1, cursor: null}, {signal: new AbortController().signal});
// @ts-expect-error — a schema export is a local value
request({page: 1});
// @ts-expect-error — the raw RPC uses the parsed input type
read({page:'1', cursor: null});
export const fileState: 'ready' | 'failed' = state.parse('ready');
// @ts-expect-error — a closed enum is narrower than a string
export const invalidState: 'unknown' = state.parse('ready');
export const cursor: string | null = request.parse({page: 1, cursor: 'opaque'}).cursor;
// @ts-expect-error — a cursor must be a string or null
read({page: 1, cursor: 0});
// @ts-expect-error — a missing cursor is different from an explicit null
read({page: 1});
// @ts-expect-error — the host supplies the viewer
read({page: 1, cursor: null}, {viewer: null});
// @ts-expect-error — the RPC result retains its inferred type
export const wrong: Promise<string> = result;`,
			);
			const program = ts.createProgram([file], {
				target: ts.ScriptTarget.ESNext,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				jsx: ts.JsxEmit.Preserve,
				strict: true,
				noEmit: true,
				skipLibCheck: true,
				paths: {
					'octane/data': [fileURLToPath(new URL('../../src/data/index.ts', import.meta.url))],
					'octane/server': [fileURLToPath(new URL('../../src/server-call.ts', import.meta.url))],
				},
			});
			expect(
				ts
					.getPreEmitDiagnostics(program)
					.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
			).toEqual([]);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('reports unsupported public schema declarations at the authored export', () => {
		const source = `module server {
			import { dataSchema as s } from 'octane/data';
			import { loadPrivateLimit } from './private';
			const id = s.string();
			export { id as itemId };
			export const unsafe = s.string({ minLength: loadPrivateLimit() });
			export const files = s.array(id);
		}
		import { files as rows } from 'server';`;
		const { errors } = compileToVolarMappings(source, 'Files.tsrx');
		expect(errors.map((error) => source.slice(error.pos, error.pos + 2))).toEqual(['id', 'un']);
		expect(errors[0].message).toMatch(/export const/);
		expect(errors[1].message).toMatch(/static/);
		const untrusted = `module server {
			import { dataSchema as s } from './server-only';
			export const privateParser = s.string();
		}`;
		const invalid = compileToVolarMappings(untrusted, 'Private.tsrx').errors;
		expect(invalid.map((error) => untrusted.slice(error.pos, error.pos + 13))).toEqual([
			'privateParser',
		]);
	});
});
