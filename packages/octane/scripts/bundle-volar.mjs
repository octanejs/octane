import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { importNativeTypeScript } from '../../../scripts/octane-tsc/native.mjs';
import {
	LanguageVariant,
	ScriptTarget,
	SyntaxKind,
} from '../../../scripts/octane-tsc/native-syntax.mjs';

const { API, ModuleKind, ModuleResolutionKind } = await importNativeTypeScript('unstable/sync');
const { createScanner } = await importNativeTypeScript('unstable/ast/scanner');

const LICENSE_FILE = /^licen[cs]e(?:\.[^.]+)?$/i;

function declarationTokens(source, emitted = false) {
	const scanner = createScanner(true, LanguageVariant.Standard, source);
	const tokens = [];
	for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
		tokens.push([
			kind,
			kind === SyntaxKind.StringLiteral ? scanner.getTokenValue() : scanner.getTokenText(),
		]);
	}
	// The declaration is formatted by Prettier in source. Whitespace, comments,
	// quote spelling and optional trailing separators cannot change its contract.
	return JSON.stringify(
		tokens.filter(([kind], index) => {
			// TypeScript 7 emits `export declare function` where the source, like
			// TypeScript 5.9, writes `export function`; both are ambient in a
			// declaration file.
			if (
				emitted &&
				kind === SyntaxKind.DeclareKeyword &&
				tokens[index - 1]?.[0] === SyntaxKind.ExportKeyword
			) {
				return false;
			}
			if (
				kind === SyntaxKind.SemicolonToken &&
				tokens[index + 1]?.[0] === SyntaxKind.CloseBraceToken
			) {
				return false;
			}
			if (kind !== SyntaxKind.CommaToken) return true;
			return ![
				SyntaxKind.CloseParenToken,
				SyntaxKind.CloseBraceToken,
				SyntaxKind.CloseBracketToken,
			].includes(tokens[index + 1]?.[0]);
		}),
	);
}

function assertVolarDeclaration(packageDir) {
	const source = join(packageDir, 'src/compiler/volar.js');
	const declaration = join(packageDir, 'src/compiler/volar.d.ts');
	const api = new API({ cwd: packageDir });
	let generated;
	let diagnostics;
	try {
		const program = api.createProgram([source], {
			allowJs: true,
			declaration: true,
			emitDeclarationOnly: true,
			module: ModuleKind.ESNext,
			moduleResolution: ModuleResolutionKind.Bundler,
			target: ScriptTarget.ESNext,
			strict: true,
			types: [],
			outDir: join(packageDir, '.volar-declaration-check'),
		});
		// Only capture TypeScript's declaration for the authored entry. No compiler
		// JS, generated bundle or dependency declaration is used as a typing façade.
		const emitted = program.getDeclarationEmit([source]);
		generated = [...emitted.outputFiles].find(([fileName]) => fileName.endsWith('.d.ts'))?.[1].text;
		diagnostics = [...program.getSyntacticDiagnostics(source), ...emitted.diagnostics];
	} finally {
		api.close();
	}
	if (diagnostics.length || generated === undefined) {
		throw new Error(
			`Could not emit the authored Volar declaration: ${diagnostics
				.map((diagnostic) => diagnostic.text)
				.join('\n')}`,
		);
	}
	if (declarationTokens(readFileSync(declaration, 'utf8')) !== declarationTokens(generated, true)) {
		throw new Error(
			'volar.d.ts is stale: update it from the declaration emitted by volar.js JSDoc',
		);
	}
}

function isWithin(directory, file) {
	const path = relative(directory, file);
	return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
}

function dependencyNotice(input) {
	let directory = dirname(input);
	while (!existsSync(join(directory, 'package.json'))) {
		const parent = dirname(directory);
		if (parent === directory) throw new Error(`Volar bundle input has no package: ${input}`);
		directory = parent;
	}
	const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
	if (manifest.license !== 'MIT') {
		throw new Error(
			`Volar bundle requires license review for ${manifest.name}@${manifest.version}: ${manifest.license}`,
		);
	}
	const licenses = readdirSync(directory)
		.filter((name) => LICENSE_FILE.test(name))
		.sort()
		.map((name) => readFileSync(join(directory, name), 'utf8').trim());
	if (licenses.length === 0 || licenses.some((license) => license.length === 0)) {
		throw new Error(`Volar bundle dependency has no license notice: ${manifest.name}`);
	}
	return {
		id: `${manifest.name}@${manifest.version}`,
		text: licenses.join('\n\n'),
	};
}

/**
 * Freeze only the IDE/typecheck compiler's third-party graph at publication.
 * @tsrx/core 0.1.60's ArrayPattern printer assumes esrap 2.3.2; resolving its
 * compatible range to 2.3.6 prints tuple parameter annotations twice. A package
 * manager override in this repository cannot protect published consumers.
 *
 * Bundle the audited build graph, not transformed application source. Octane's
 * analysis modules stay shared with the runtime compiler. The parser adapters
 * join the bundle so their @tsrx/core imports use the audited parser too. Virtual TSX still
 * comes from the same single AST print with its original mappings. Runtime
 * entries and application output are untouched. This costs about 210 KiB gzip
 * of compiler tooling, not application JavaScript. No compiler-source map is
 * needed: authored-source mappings are produced by the compiler itself.
 */
export async function bundleVolarCompiler({ packageDir, outdir }) {
	const root = resolve(packageDir);
	assertVolarDeclaration(root);
	const compilerDirectory = join(root, 'src/compiler');
	const entryPoint = join(compilerDirectory, 'volar.js');
	const parserModules = new Set(
		['parser.browser.js', 'parser-output.js'].map((name) => join(compilerDirectory, name)),
	);
	const outputDirectory = resolve(outdir);
	const result = await build({
		absWorkingDir: root,
		entryPoints: [entryPoint],
		outfile: join(outputDirectory, 'volar.js'),
		bundle: true,
		write: false,
		metafile: true,
		format: 'esm',
		platform: 'neutral',
		target: 'esnext',
		legalComments: 'inline',
		banner: { js: '// Bundled compiler dependency notices: ./volar.LICENSES.txt' },
		plugins: [
			{
				name: 'preserve-octane-compiler-modules',
				setup(buildApi) {
					buildApi.onResolve({ filter: /^\./ }, ({ path, importer }) => {
						if (
							isWithin(compilerDirectory, importer) &&
							!parserModules.has(resolve(dirname(importer), path))
						)
							return { path, external: true };
					});
				},
			},
		],
	});
	const output = Object.values(result.metafile.outputs).find((file) => file.entryPoint);
	for (const dependency of output.imports) {
		if (!dependency.external || !dependency.path.startsWith('./')) {
			throw new Error(`Volar bundle left an unexpected dependency: ${dependency.path}`);
		}
	}
	const notices = new Map();
	// Use emitted inputs, not the pre-tree-shaking dependency graph: unused
	// imports need no redistribution, and every byte we do ship needs its notice.
	for (const [input, metadata] of Object.entries(output.inputs)) {
		if (metadata.bytesInOutput === 0) continue;
		const file = resolve(root, input);
		if (file === entryPoint || parserModules.has(file)) continue;
		if (isWithin(join(root, 'src'), file)) {
			throw new Error(`Volar bundle must not duplicate an Octane module: ${input}`);
		}
		const notice = dependencyNotice(file);
		notices.set(notice.id, notice.text);
	}
	const sortedNotices = [...notices].sort(([left], [right]) =>
		left < right ? -1 : left > right ? 1 : 0,
	);
	const licenseText = sortedNotices.map(([id, text]) => `${id}\n\n${text}\n`).join('\n');
	// Validate the graph and licenses before replacing the copied compiler file.
	mkdirSync(outputDirectory, { recursive: true });
	for (const file of result.outputFiles) writeFileSync(file.path, file.contents);
	writeFileSync(join(outputDirectory, 'volar.LICENSES.txt'), licenseText);
	return { metafile: result.metafile, dependencies: sortedNotices.map(([id]) => id) };
}
