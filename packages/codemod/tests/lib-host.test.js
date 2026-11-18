import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { libCachingHost } from '../dist/lib-host.js';

const dirs = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function entry(code) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemod-lib-host-'));
	dirs.push(dir);
	const file = path.join(dir, 'entry.ts');
	fs.writeFileSync(file, code);
	return file.split(path.sep).join('/');
}

function program(file, options) {
	return ts.createProgram([file], options, libCachingHost(options));
}

const es5Lib = ts.getDefaultLibFilePath({}).replace(/[^/\\]+$/, 'lib.es5.d.ts');

describe('libCachingHost', () => {
	it("shares TypeScript's library files between programs", () => {
		const file = entry('export const first = [1].at(0);');
		const options = { target: ts.ScriptTarget.ES2022, strict: true, noEmit: true };
		const one = program(file, options).getSourceFile(es5Lib);
		const two = program(file, { ...options, noUncheckedIndexedAccess: true }).getSourceFile(es5Lib);
		expect(one).toBeDefined();
		expect(two).toBe(one);
	});

	it('reads project files afresh for every program', () => {
		const file = entry('export const value = 1;');
		const options = { target: ts.ScriptTarget.ES2022, noEmit: true };
		expect(program(file, options).getSourceFile(file)?.text).toBe('export const value = 1;');
		fs.writeFileSync(file, 'export const value = 2;');
		expect(program(file, options).getSourceFile(file)?.text).toBe('export const value = 2;');
	});

	it('parses a library again for other parse settings', () => {
		const file = entry('export {};');
		const esnext = program(file, { target: ts.ScriptTarget.ESNext, noEmit: true });
		const es5 = program(file, { target: ts.ScriptTarget.ES5, noEmit: true });
		expect(es5.getSourceFile(es5Lib)).not.toBe(esnext.getSourceFile(es5Lib));
	});

	it('types each program against its own libraries', () => {
		const file = entry('export const first = [1].at(0);');
		const errors = (lib) =>
			ts
				.getPreEmitDiagnostics(
					program(file, {
						target: ts.ScriptTarget.ES2022,
						lib,
						types: [],
						strict: true,
						noEmit: true,
					}),
				)
				.map((d) => d.code);
		// Array.prototype.at is an ES2022 member.
		expect(errors(['lib.es2022.d.ts'])).toEqual([]);
		expect(errors(['lib.es5.d.ts'])).toContain(2550);
		expect(errors(['lib.es2022.d.ts'])).toEqual([]);
	});
});
