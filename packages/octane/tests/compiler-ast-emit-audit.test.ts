import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPILER_DIR = join(process.cwd(), 'packages/octane/src/compiler');
const BASELINE_COMPILER = 'compile-2f-baseline.js';

function collectCompilerFiles(directory = COMPILER_DIR): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectCompilerFiles(path));
		} else if (entry.name.endsWith('.js') && entry.name !== BASELINE_COMPILER) {
			files.push(path);
		}
	}
	return files.sort();
}

function displayPath(path: string) {
	return relative(COMPILER_DIR, path);
}

function locations(path: string, code: string, pattern: RegExp): string[] {
	return [...code.matchAll(pattern)].map((match) => {
		const line = code.slice(0, match.index).split('\n').length;
		return `${displayPath(path)}:${line}`;
	});
}

const sources = collectCompilerFiles().map((path) => ({
	code: readFileSync(path, 'utf8'),
	path,
}));

describe('compiler AST emit architecture', () => {
	it('keeps final JavaScript printing at the two owning emit boundaries', () => {
		const printSites: string[] = [];
		for (const { code, path } of sources) {
			for (const _match of code.matchAll(/\besrapPrint\s*\(/g)) {
				printSites.push(displayPath(path));
			}
		}

		// Volar delegates its one Program print to @tsrx/core's transform() with
		// boundaryTokens enabled. The main compiler and client-only stub are the
		// only compiler-owned Program printers.
		expect(printSites.sort()).toEqual(['client-only-server.js', 'compile.js']);
	});

	it('only parses authored module inputs', () => {
		const invalidInputs: string[] = [];
		for (const { code, path } of sources) {
			for (const call of code.matchAll(/\bparseModule\s*\(/g)) {
				const afterCall = code.slice((call.index ?? 0) + call[0].length);
				const input = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|\))/.exec(afterCall)?.[1];
				if (input !== 'source' && input !== 'authoredSource') {
					const line = code.slice(0, call.index).split('\n').length;
					invalidInputs.push(`${displayPath(path)}:${line}: ${input ?? 'expression'}`);
				}
			}
		}

		// Parsing generated fragments would create a second emit pipeline and lose
		// node identity/origins. slot-hooks.js also parses `source`, then performs
		// its documented authored-text edit without producing a source map.
		expect(invalidInputs).toEqual([]);
	});

	it('does not edit or concatenate printed code', () => {
		const violations: string[] = [];
		const patterns = [
			/\b(?!error\b)[A-Za-z_$][\w$]*\.code\s*(?:(?:[+\-*/%&|^]|&&|\|\||\?\?|<<|>>|>>>|\*\*)=|=(?!=)|\+\+|--)/g,
			/\b[A-Za-z_$][\w$]*\.code\.(?:concat|replace|replaceAll|slice|split|substring)\s*\(/g,
			/(?:\b[A-Za-z_$][\w$]*\.code\s*\+|\+\s*[A-Za-z_$][\w$]*\.code\b)/g,
			/\$\{\s*(?!(?:diagnostic|error)\b)[A-Za-z_$][\w$]*\.code\s*\}/g,
		];
		for (const { code, path } of sources) {
			for (const pattern of patterns) {
				violations.push(...locations(path, code, pattern));
			}
		}

		expect(violations).toEqual([]);
	});

	it('has no retired generated-text or source-map compatibility layer', () => {
		const retiredNames = [
			'addSourceMapNeedles',
			'applyMappedReplacements',
			'composeSourceMaps',
			'expandDomRendererRegions',
			'generatedText',
			'lowerUniversalRendererRegion',
			'originsFromSourceMap',
			'retargetRuntimeImport',
			'sourceMapFromOrigins',
		];
		const retiredProperties = [
			'__styleRemap',
			'__universalValidationRemap',
			'expressionOrigins',
			'mappingNeedles',
			'preludeOrigins',
		];
		const violations: string[] = [];

		for (const { code, path } of sources) {
			for (const name of retiredNames) {
				violations.push(
					...locations(path, code, new RegExp(`\\b${name}\\s*\\(`, 'g')).map(
						(location) => `${location}: ${name}`,
					),
				);
			}
			for (const property of retiredProperties) {
				violations.push(
					...locations(path, code, new RegExp(`\\b${property}\\b`, 'g')).map(
						(location) => `${location}: ${property}`,
					),
				);
			}
		}

		expect(violations).toEqual([]);
	});

	it('limits manual node objects to unsupported AST shapes and compiler records', () => {
		const unsupportedBuilderShapes = new Set([
			'BreakStatement',
			'ChainExpression',
			'ImportDefaultSpecifier',
			'ImportExpression',
			'MetaProperty',
			'Program',
			'ThrowStatement',
		]);
		const compilerRecordShapes = new Set([
			'ActivityStatement',
			'Block',
			'Component',
			'Element',
			'FoldedDirective',
			'FragmentEnd',
			'FragmentStart',
			'HeadHoist',
			'JSXCodeBlock',
			'JSXTryExpression',
			'TSRXExpression',
			'Template',
			'TemplateElement',
			'TemplatePart',
			'Text',
			'asset',
		]);
		const violations: string[] = [];

		for (const { code, path } of sources) {
			for (const match of code.matchAll(/\btype:\s*(['"])([^'"]+)\1/g)) {
				const type = match[2];
				if (!unsupportedBuilderShapes.has(type) && !compilerRecordShapes.has(type)) {
					const line = code.slice(0, match.index).split('\n').length;
					violations.push(`${displayPath(path)}:${line}: ${type}`);
				}
			}
		}

		expect(violations).toEqual([]);
	});
});
