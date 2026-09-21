// @vitest-environment node
//
// U1 SPIKE — typed-token contract seam (throwaway; none of this ships).
//
// Proves KTD1 end-to-end on one fixture: a plain `.ts` contract module is read
// synchronously by a host-side resolver into serializable facts, and a
// compile()-time pass turns undeclared `var(--token)` reads inside `<style>`
// into collected diagnostics. Mirrors the existing seams:
//   - findTokenContractImportRequests ≈ findCssModuleImportRequests
//     (css-module-imports.js): authored, non-type, relative imports are the
//     candidate requests; the resolver decides which are contracts.
//   - readTokenContractModule ≈ readCssModuleExports: parse the authored
//     module, never evaluate it; accept only a statically-known shape.
//   - resolveTokenContract ≈ resolveCssModuleConstant: a CompileOptions-style
//     host callback consulted per authored request. Tri-state result:
//     facts | null (claimed but unreadable → warn) | undefined (not a
//     contract → silent).
//   - compileWithTokenContract wraps compile() exactly where bundler.js would
//     consult the callback, and appends to the SAME collected diagnostics
//     channel `_forwardCompileDiagnostics` already forwards.

import { execFileSync } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';
// Same parser the mirrored seam uses (css-module-imports.js imports
// parseModule from '@tsrx/core' for exactly this kind of host-side read).
import { parseModule } from '@tsrx/core';

const FIXTURE_DIR = fileURLToPath(new URL('./_fixture', import.meta.url));
const TOKENS_FILE = join(FIXTURE_DIR, 'tokens.ts');
const CONSUMER_FILE = join(FIXTURE_DIR, 'consumer.tsrx');
const CONSUMER_SOURCE = readFileSync(CONSUMER_FILE, 'utf8');

// ---------------------------------------------------------------------------
// Host side — what `octane analyze`, MCP `octane_compile`, and tests would
// construct: a synchronous resolver that reads the `.ts` contract directly.
// ---------------------------------------------------------------------------

type TokenContractFacts = {
	/** Literal custom-property prefix; `var(--x)` claims this contract when `--x`.startsWith(namespace). */
	readonly namespace: string;
	/** Every custom-property name the contract declares. */
	readonly names: readonly string[];
};

type TokenContractProbe = TokenContractFacts | null | undefined;
type ResolveTokenContract = (request: string, importer: string) => TokenContractProbe;

const RELATIVE_REQUEST = /^\.{1,2}\//;
const VAR_REFERENCE = /var\(\s*(--[\w-]+)/g;

/** `findCssModuleImportRequests` analogue: relative, non-type import requests. */
function findTokenContractImportRequests(program: any): Map<string, any> {
	const requests = new Map<string, any>();
	for (const statement of program?.body ?? []) {
		if (
			statement?.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.attributes?.length > 0 ||
			statement.assertions?.length > 0 ||
			typeof statement.source?.value !== 'string' ||
			!RELATIVE_REQUEST.test(statement.source.value) ||
			!statement.specifiers?.some((specifier: any) => specifier.importKind !== 'type')
		) {
			continue;
		}
		requests.set(statement.source.value, statement.source);
	}
	return requests;
}

function unwrapTs(node: any): any {
	while (
		node?.type === 'TSAsExpression' ||
		node?.type === 'TSSatisfiesExpression' ||
		node?.type === 'TSTypeAssertion' ||
		node?.type === 'ParenthesizedExpression'
	) {
		node = node.expression;
	}
	return node;
}

function propertyKey(node: any): string | undefined {
	if (node?.type === 'Identifier') return node.name;
	if (node?.type === 'Literal' || node?.type === 'StringLiteral') return String(node.value);
	return undefined;
}

/** Leaves of the declared tree become `--{prefix-}{dashed-path}` names. */
function collectNames(node: any, path: readonly string[], prefix: string, out: string[]): boolean {
	if (node?.type !== 'ObjectExpression') return false;
	for (const property of node.properties ?? []) {
		if (
			property?.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed === true ||
			property.method === true
		) {
			return false;
		}
		const key = propertyKey(property.key);
		if (key === undefined || key === '__proto__') return false;
		const value = unwrapTs(property.value);
		if (value?.type === 'ObjectExpression') {
			if (!collectNames(value, [...path, key], prefix, out)) return false;
		} else if (typeof value?.value === 'string' || typeof value?.value === 'number') {
			out.push(`--${prefix}${[...path, key].join('-')}`);
		} else {
			return false;
		}
	}
	return true;
}

/**
 * `readCssModuleExports` analogue: statically read the authored contract
 * module without evaluating it. The `defineThemeTokens` substring is the
 * cheap claim marker (mirroring the `.module.` prefilter); extraction accepts
 * only literal trees. Returns facts, `null` for a claimed module that could
 * not be read, or `undefined` when the module is not a contract.
 */
function readTokenContractModule(source: string, id: string): TokenContractProbe {
	if (!source.includes('defineThemeTokens')) return undefined;
	let ast: any;
	try {
		ast = parseModule(source, id);
	} catch {
		return null;
	}
	let probe: TokenContractProbe;
	for (const statement of ast?.body ?? []) {
		const declaration =
			statement?.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations ?? []) {
			const call = unwrapTs(item.init);
			if (
				call?.type !== 'CallExpression' ||
				call.callee?.type !== 'Identifier' ||
				call.callee.name !== 'defineThemeTokens'
			) {
				continue;
			}
			probe = extractContractFacts(call) ?? null;
		}
	}
	return probe;
}

function extractContractFacts(call: any): TokenContractFacts | undefined {
	const tree = unwrapTs(call.arguments?.[0]);
	if (tree?.type !== 'ObjectExpression') return undefined;
	let prefix = '';
	const options = unwrapTs(call.arguments?.[1]);
	if (options !== undefined) {
		if (options?.type !== 'ObjectExpression') return undefined;
		for (const property of options.properties ?? []) {
			if (property?.type !== 'Property' || property.computed === true) return undefined;
			if (propertyKey(property.key) !== 'prefix') continue;
			const value = unwrapTs(property.value);
			if (typeof value?.value !== 'string') return undefined;
			prefix = value.value === '' ? '' : `${value.value}-`;
		}
	}
	const names: string[] = [];
	if (!collectNames(tree, [], prefix, names)) return undefined;
	return { namespace: `--${prefix}`, names };
}

function createSyncTokenContractResolver(
	readFile: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): { resolve: ResolveTokenContract; reads: string[] } {
	const cache = new Map<string, TokenContractProbe>();
	const reads: string[] = [];
	return {
		reads,
		resolve(request, importer) {
			const base = resolvePath(dirname(importer), request);
			const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.tsrx`, `${base}.js`].find(
				existsSync,
			);
			if (file === undefined) return undefined;
			if (!cache.has(file)) {
				reads.push(file);
				cache.set(file, readTokenContractModule(readFile(file), file));
			}
			return cache.get(file);
		},
	};
}

// ---------------------------------------------------------------------------
// Compile side — the prototype of the U10 pass, standing in for a check that
// would run inside compile() where bundler.js already hands host facts in.
// ---------------------------------------------------------------------------

function positionAt(source: string, offset: number) {
	let line = 1;
	let column = 0;
	for (let index = 0; index < offset; index++) {
		if (source.charCodeAt(index) === 10) {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { offset, line, column };
}

function collectStyleElements(node: any, out: any[] = []): any[] {
	if (!node || typeof node !== 'object') return out;
	if (node.type === 'JSXStyleElement') out.push(node);
	for (const key of Object.keys(node)) {
		if (key === 'loc' || key === 'metadata' || key === 'parent' || key === 'css') continue;
		const child = node[key];
		if (Array.isArray(child)) for (const item of child) collectStyleElements(item, out);
		else collectStyleElements(child, out);
	}
	return out;
}

function collectTokenDiagnostics(
	program: any,
	source: string,
	filename: string,
	resolveTokenContract: ResolveTokenContract | undefined,
) {
	const diagnostics: any[] = [];
	if (typeof resolveTokenContract !== 'function') return diagnostics;
	const requests = findTokenContractImportRequests(program);
	if (requests.size === 0) return diagnostics;
	const contracts: TokenContractFacts[] = [];
	for (const [request, sourceNode] of requests) {
		const probe = resolveTokenContract(request, filename);
		if (probe === null) {
			diagnostics.push({
				code: 'octane-style-token-contract-unresolved',
				severity: 'warning',
				filename,
				start: positionAt(source, sourceNode.start ?? 0),
				end: positionAt(source, sourceNode.end ?? 0),
				message:
					`token contract ${JSON.stringify(request)} could not be read — ` +
					`token references in this file are unverified`,
			});
			continue;
		}
		if (probe !== undefined) contracts.push(probe);
	}
	for (const styleElement of collectStyleElements(program)) {
		const sheet = (styleElement.children ?? []).find((c: any) => c?.type === 'StyleSheet');
		const bodyStart = sheet?.sourceStart ?? styleElement.openingElement?.end;
		if (typeof bodyStart !== 'number') continue;
		const visit = (node: any): void => {
			if (!node || typeof node !== 'object') return;
			if (node.type === 'Declaration' && typeof node.value === 'string') {
				const localStart = source
					.slice(bodyStart + (node.start ?? 0), bodyStart + (node.end ?? 0))
					.indexOf(node.value);
				const valueStart = bodyStart + (node.start ?? 0) + Math.max(localStart, 0);
				for (const match of node.value.matchAll(VAR_REFERENCE)) {
					const name = match[1];
					const contract = contracts.find((c) => name.startsWith(c.namespace));
					if (contract === undefined || contract.names.includes(name)) continue;
					const start = valueStart + (match.index ?? 0) + match[0].length - name.length;
					diagnostics.push({
						code: 'octane-style-token-undeclared',
						severity: 'error',
						filename,
						start: positionAt(source, start),
						end: positionAt(source, start + name.length),
						message:
							`token ${name} is not declared by the token contract ` +
							`(declares ${contract.names.join(', ')})`,
					});
				}
				return;
			}
			for (const key of Object.keys(node)) {
				if (key === 'loc' || key === 'metadata' || key === 'parent') continue;
				const child = node[key];
				if (Array.isArray(child)) for (const item of child) visit(item);
				else visit(child);
			}
		};
		visit(sheet);
	}
	return diagnostics;
}

/** The spike's compile() seam: facts callback in, collected diagnostics out. */
function compileWithTokenContract(
	source: string,
	filename: string,
	options: { resolveTokenContract?: ResolveTokenContract } & Record<string, unknown> = {},
) {
	// The option is the spike's own input — since U10 shipped, compile() runs
	// the real check itself when it sees resolveTokenContract, which would
	// double-count against the spike collector this file exists to prove.
	const { resolveTokenContract, ...compileOptions } = options;
	const result = compile(source, filename, compileOptions);
	const diagnostics = collectTokenDiagnostics(
		parseModule(source, filename),
		source,
		filename,
		resolveTokenContract,
	);
	return { ...result, diagnostics: [...result.diagnostics, ...diagnostics] };
}

// ---------------------------------------------------------------------------

describe('U1 spike — token contract seam', () => {
	it('reads the .ts contract module synchronously into namespaced facts', () => {
		const { resolve, reads } = createSyncTokenContractResolver();
		const facts = resolve('./tokens', CONSUMER_FILE);
		expect(reads).toEqual([TOKENS_FILE]);
		expect(facts).toEqual({
			namespace: '--app-',
			names: ['--app-colors-primary', '--app-colors-surface', '--app-space-sm', '--app-space-md'],
		});
		// Not a contract → undefined, not a warning.
		expect(resolve('./does-not-exist', CONSUMER_FILE)).toBeUndefined();
	});

	it('accepts declared var(--token) references and leaves emit byte-identical', () => {
		const { resolve } = createSyncTokenContractResolver();
		const withContract = compileWithTokenContract(CONSUMER_SOURCE, CONSUMER_FILE, {
			resolveTokenContract: resolve,
		});
		expect(withContract.diagnostics).toEqual([]);
		expect(withContract.code).toBe(compile(CONSUMER_SOURCE, CONSUMER_FILE).code);
	});

	it('fails an undeclared claimed token with a collected octane-* diagnostic', () => {
		const bad = CONSUMER_SOURCE.replace('var(--app-colors-primary)', 'var(--app-colors-primay)');
		const { resolve } = createSyncTokenContractResolver();
		const result = compileWithTokenContract(bad, CONSUMER_FILE, {
			resolveTokenContract: resolve,
		});
		expect(result.diagnostics).toHaveLength(1);
		const diagnostic = result.diagnostics[0]!;
		expect(diagnostic.code).toBe('octane-style-token-undeclared');
		expect(diagnostic.severity).toBe('error');
		expect(diagnostic.message).toContain('--app-colors-primay');
		expect(diagnostic.message).toContain('--app-colors-primary');
		expect(bad.slice(diagnostic.start.offset, diagnostic.end.offset)).toBe('--app-colors-primay');
	});

	it('keeps raw var(--*) outside the contract namespace legal', () => {
		// `class="x"` keeps `.x` matched so the run carries no U2 unused-selector
		// warning: this test asserts only on the token diagnostics surface.
		const source = `import { tokens } from './tokens';
export function Badge() @{ <div><style>.x { margin: var(--legacy-gutter); border-color: var(--other-x); }</style><span class="x" /></div> }`;
		const { resolve } = createSyncTokenContractResolver();
		expect(
			compileWithTokenContract(source, CONSUMER_FILE, { resolveTokenContract: resolve })
				.diagnostics,
		).toEqual([]);
	});

	it('warns "unresolved — unverified" when the claimed contract cannot be read', () => {
		// The host resolved './tokens' to a contract module but could not read
		// it (unparseable, non-literal shape, read failure): `null` = claimed but
		// unverified, distinct from `undefined` = not a contract.
		const unreadable: ResolveTokenContract = (request) =>
			request === './tokens' ? null : undefined;
		const result = compileWithTokenContract(CONSUMER_SOURCE, CONSUMER_FILE, {
			resolveTokenContract: unreadable,
		});
		expect(result.diagnostics).toHaveLength(1);
		const diagnostic = result.diagnostics[0]!;
		expect(diagnostic.code).toBe('octane-style-token-contract-unresolved');
		expect(diagnostic.severity).toBe('warning');
		expect(diagnostic.message).toContain('./tokens');
		expect(diagnostic.message).toContain('unverified');
		expect(CONSUMER_SOURCE.slice(diagnostic.start.offset, diagnostic.end.offset)).toBe(
			"'./tokens'",
		);
	});

	it('emits no token diagnostics when no resolver is configured', () => {
		const bad = CONSUMER_SOURCE.replace('var(--app-colors-primary)', 'var(--app-colors-primay)');
		expect(compileWithTokenContract(bad, CONSUMER_FILE).diagnostics).toEqual([]);
	});

	it('produces identical diagnostics from the Volar sourceAst (editor path)', () => {
		const bad = CONSUMER_SOURCE.replace('var(--app-colors-primary)', 'var(--app-colors-primay)');
		const { resolve } = createSyncTokenContractResolver();
		const fromVolar = collectTokenDiagnostics(
			compileToVolarMappings(bad, CONSUMER_FILE).sourceAst,
			bad,
			CONSUMER_FILE,
			resolve,
		);
		const fromCompile = collectTokenDiagnostics(
			parseModule(bad, CONSUMER_FILE),
			bad,
			CONSUMER_FILE,
			resolve,
		);
		expect(fromVolar).toEqual(fromCompile);
		expect(fromVolar).toHaveLength(1);
	});

	it('typechecks the contract module and its consumers under tsrx-tsc', () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-token-seam-'));
		const tsc = fileURLToPath(
			new URL('../../../../node_modules/@tsrx/typescript-plugin/dist/tsc.js', import.meta.url),
		);
		const run = (config: string) => {
			try {
				execFileSync(process.execPath, [tsc, '--noEmit', '-p', join(root, config)], {
					cwd: root,
					encoding: 'utf8',
					timeout: 60_000,
				});
				return '';
			} catch (error) {
				return String((error as { stdout?: string }).stdout ?? error);
			}
		};
		const writeConfig = (name: string, include: string[]) =>
			writeFileSync(
				join(root, name),
				JSON.stringify({
					compilerOptions: {
						target: 'esnext',
						module: 'esnext',
						moduleResolution: 'bundler',
						strict: true,
						noEmit: true,
						skipLibCheck: true,
						jsx: 'react-jsx',
						jsxImportSource: 'octane',
						types: ['node'],
					},
					tsrx: { compiler: 'octane/compiler/volar' },
					include,
				}),
			);
		try {
			mkdirSync(join(root, 'node_modules'));
			symlinkSync(
				fileURLToPath(new URL('../../', import.meta.url)),
				join(root, 'node_modules/octane'),
				'dir',
			);
			// `@types/node` gives theme-tokens.ts its `process.env.NODE_ENV` read.
			symlinkSync(
				fileURLToPath(new URL('../../../../node_modules/@types', import.meta.url)),
				join(root, 'node_modules/@types'),
				'dir',
			);
			writeFileSync(
				join(root, 'package.json'),
				JSON.stringify({
					name: 'token-seam-check',
					type: 'module',
					dependencies: { octane: '*' },
				}),
			);
			copyFileSync(TOKENS_FILE, join(root, 'tokens.ts'));
			copyFileSync(CONSUMER_FILE, join(root, 'App.tsrx'));
			writeFileSync(
				join(root, 'Bad.tsrx'),
				`import { tokens } from './tokens';
export function Bad() @{ <span>{tokens.colors.primay}</span> }
`,
			);
			// The .ts contract-side violations live in a tsrx-free program: the
			// plugin's tsc wrapper drops plain-.ts diagnostics when a sibling
			// .tsrx in the same program errors (observed spike limitation).
			writeFileSync(
				join(root, 'bad.ts'),
				`import { tokens } from './tokens';
import { defineThemeTokens } from 'octane/theme-tokens';
const misspelled = tokens.vars.colors.primay;
const wrongType: number = tokens.raw.colors.primary;
defineThemeTokens(tokens.raw, { variants: { bad: { values: { colors: { bgg: '#000' } } } } });
`,
			);
			// 1. The real consumer + contract typecheck clean.
			writeConfig('tsconfig.ok.json', ['App.tsrx', 'tokens.ts']);
			expect(run('tsconfig.ok.json')).not.toContain('error TS');
			// 2. A misspelled token read inside .tsrx fails the typecheck gate.
			writeConfig('tsconfig.tsrx.json', ['Bad.tsrx', 'tokens.ts']);
			const tsrxErrors = run('tsconfig.tsrx.json')
				.split('\n')
				.filter((line) => line.includes('error TS'));
			expect(tsrxErrors.length).toBe(1);
			expect(tsrxErrors[0]).toMatch(/Bad\.tsrx\(2,\d+\): error TS2551.*primay/);
			// 3. Plain-.ts consumers and variant declarations fail the same gate.
			writeConfig('tsconfig.ts.json', ['bad.ts', 'tokens.ts']);
			const tsErrors = run('tsconfig.ts.json')
				.split('\n')
				.filter((line) => line.includes('error TS'));
			expect(tsErrors.length).toBe(3);
			expect(tsErrors.every((line) => /(^|\/)bad\.ts\(\d+,\d+\): error TS/.test(line))).toBe(true);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}, 90_000);
});
