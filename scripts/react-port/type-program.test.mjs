import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createNativeTypeEvidenceProgram, createTypeEvidenceProgram } from './type-program.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COMPONENT = `
export function choose<Value>({ value }: { value: Value }) { return value; }
export function Label({ text }: { text: string }) @{ <span>{text as string}</span> }
`;
const CONSUMER = `import { choose, Label } from './component.tsrx';
export const selected = choose({ value: 'typed' as const });
export type Props = Parameters<typeof Label>[0];
const invalid: Props = { text: 123 };
`;

test('inspects authored TSRX exports without erasing props or generic inference', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'react-port-native-types-'));
	try {
		writeFileSync(path.join(root, 'component.tsrx'), COMPONENT);
		const entry = path.join(root, 'consumer.ts');
		writeFileSync(entry, CONSUMER);
		const program = createTypeEvidenceProgram([entry], {
			strict: true,
			noEmit: true,
			jsx: ts.JsxEmit.Preserve,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			allowImportingTsExtensions: true,
		});
		const checker = program.getTypeChecker();
		const source = program.getSourceFile(entry);
		const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source));
		const selected = exports.find((symbol) => symbol.name === 'selected');
		assert.equal(
			checker.typeToString(checker.getTypeOfSymbolAtLocation(selected, source)),
			'"typed"',
		);
		const props = checker.getDeclaredTypeOfSymbol(
			exports.find((symbol) => symbol.name === 'Props'),
		);
		assert.equal(checker.typeToString(checker.getTypeOfPropertyOfType(props, 'text')), 'string');
		assert.ok(
			program.getSemanticDiagnostics(source).some((diagnostic) => diagnostic.code === 2322),
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('inspects the same TSRX exports on the native TypeScript 7 API', () => {
	// Inside the repository, where the project resolves @tsrx/content-mapper and
	// Octane's Volar compiler.
	const cache = path.join(repositoryRoot, 'node_modules/.cache');
	mkdirSync(cache, { recursive: true });
	const root = mkdtempSync(path.join(cache, 'react-port-native-types-'));
	let evidence;
	try {
		writeFileSync(path.join(root, 'component.tsrx'), COMPONENT);
		const entry = path.join(root, 'consumer.ts');
		writeFileSync(entry, CONSUMER);
		const project = path.join(root, 'tsconfig.json');
		writeFileSync(
			project,
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					jsx: 'preserve',
					module: 'esnext',
					moduleResolution: 'bundler',
					allowImportingTsExtensions: true,
				},
			}),
		);
		evidence = createNativeTypeEvidenceProgram([entry], project);
		const { program, checker } = evidence;
		const source = program.getSourceFile(entry);
		const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(source));
		const selected = exports.find((symbol) => symbol.name === 'selected');
		assert.equal(
			checker.typeToString(checker.getTypeOfSymbolAtLocation(selected, source)),
			'"typed"',
		);
		const props = checker.getDeclaredTypeOfSymbol(
			exports.find((symbol) => symbol.name === 'Props'),
		);
		assert.equal(checker.typeToString(checker.getTypeOfPropertyOfType(props, 'text')), 'string');
		assert.ok(program.getSemanticDiagnostics(entry).some((diagnostic) => diagnostic.code === 2322));
		assert.ok(program.getSourceFile(path.join(root, 'component.tsrx')));
	} finally {
		evidence?.close();
		rmSync(root, { recursive: true, force: true });
	}
});
