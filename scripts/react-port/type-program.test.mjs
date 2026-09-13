import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { createTypeEvidenceProgram } from './type-program.mjs';

test('inspects authored TSRX exports without erasing props or generic inference', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'react-port-native-types-'));
	try {
		writeFileSync(
			path.join(root, 'component.tsrx'),
			`
export function choose<Value>({ value }: { value: Value }) { return value; }
export function Label({ text }: { text: string }) @{ <span>{text as string}</span> }
`,
		);
		const entry = path.join(root, 'consumer.ts');
		writeFileSync(
			entry,
			`import { choose, Label } from './component.tsrx';
export const selected = choose({ value: 'typed' as const });
export type Props = Parameters<typeof Label>[0];
const invalid: Props = { text: 123 };
`,
		);
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

test('loads a TSRX public witness as a program root without a consumer import', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'react-port-root-types-'));
	try {
		const entry = path.join(root, 'server.tsrx');
		writeFileSync(
			entry,
			'export function Label({ text }: { text: string }) @{ <span>{text as string}</span> }',
		);
		const program = createTypeEvidenceProgram([entry], {
			strict: true,
			noEmit: true,
			jsx: ts.JsxEmit.Preserve,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
		});
		const source = program.getSourceFile(entry);
		assert.ok(source, 'the authenticated TSRX witness must be loaded');
		const checker = program.getTypeChecker();
		const module = checker.getSymbolAtLocation(source);
		assert.ok(module, 'the witness must expose its real module symbol');
		const label = checker.getExportsOfModule(module).find((symbol) => symbol.name === 'Label');
		const signature = checker.getTypeOfSymbolAtLocation(label, source).getCallSignatures()[0];
		const props = checker.getTypeOfSymbolAtLocation(signature.parameters[0], source);
		assert.equal(checker.typeToString(checker.getTypeOfPropertyOfType(props, 'text')), 'string');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
