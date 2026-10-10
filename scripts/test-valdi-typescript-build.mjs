import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOctaneCompiler } from '../packages/octane/src/compiler/bundler.js';
import { loadValdiCompanion } from './prepare-valdi-companion.mjs';

const sdk = loadValdiCompanion(process.env.OCTANE_VALDI_COMPANION_DIR);
const ts = sdk.typescript;
const { SOURCE_MAP_PREFIX, getRawSourceMap, getSourceMap, mergeSourceMaps } = sdk.sourceMaps;
const fixture = fileURLToPath(new URL('./fixtures/valdi-typescript-build/', import.meta.url));
const project = mkdtempSync(path.join(tmpdir(), 'octane-valdi-build-'));
const artifacts = path.join(project, 'artifacts');
mkdirSync(artifacts);
writeFileSync(
	path.join(project, 'package.json'),
	JSON.stringify({ private: true, dependencies: { octane: '*' } }),
);

const compiler = createOctaneCompiler({
	root: project,
	output: 'ts',
	hmr: false,
	renderers: {
		registry: {
			valdi: {
				module: '@fixture/valdi-writer',
				target: 'valdi',
				server: 'unsupported',
				text: 'reject',
			},
		},
		default: 'valdi',
	},
});
const adapterFile = path.join(project, 'writer.d.ts');
const workspace = new sdk.Workspace(
	project,
	false,
	undefined,
	{
		target: ts.ScriptTarget.ES2019,
		module: ts.ModuleKind.CommonJS,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
		strict: true,
		declaration: true,
		noEmitOnError: true,
		inlineSourceMap: true,
		inlineSources: true,
		baseUrl: '/',
		paths: { '@fixture/valdi-writer': [adapterFile] },
	},
	undefined,
);
const names = ['Main.tsrx', 'one/Widget.tsrx', 'two/Widget.tsrx', 'useLabel.ts'];
const handoffs = new Map();

function register(name, source) {
	const filename = path.join(project, name);
	mkdirSync(path.dirname(filename), { recursive: true });
	writeFileSync(filename, source);
	compiler.invalidate(filename);
	const result = compiler.transform(source, filename);
	assert.equal(result?.lang, 'ts', `${name} must use the full TypeScript transform`);
	assert.deepEqual(result.map.sourcesContent, [source]);
	// Appending .ts lets Valdi/TypeScript resolve an unchanged ./Widget.tsrx
	// import to Widget.tsrx.ts; plain .ts helpers keep their authored module ID.
	const virtualFilename = name.endsWith('.tsrx') ? `${filename}.ts` : filename;
	const map = { ...result.map, file: virtualFilename, sources: [filename], sourceRoot: '' };
	const carrier = `${result.code}\n${SOURCE_MAP_PREFIX}${Buffer.from(JSON.stringify(map)).toString('base64')}\n`;
	// TypeScript copies an incoming inline-map comment before appending its own.
	// Keep the prior map separate: Valdi's merger reads the first map comment.
	workspace.registerInMemoryFile(virtualFilename, result.code);
	workspace.addSourceFileAtPath(virtualFilename);
	handoffs.set(name, { filename, virtualFilename, source, result, carrier });
	if (name === 'useLabel.ts') {
		const parsed = ts.createSourceFile(filename, result.code, ts.ScriptTarget.Latest, true);
		const imports = parsed.statements
			.filter(ts.isImportDeclaration)
			.map((node) => node.moduleSpecifier.text);
		assert.deepEqual([...new Set(imports)], ['@fixture/valdi-writer']);
	}
}

// A real host transformer must still run alongside Valdi's built-in transforms.
const hostTransformer = (context) => (sourceFile) => {
	const visitor = (node) => {
		if (ts.isStringLiteral(node) && node.text === 'before-transform') {
			return ts.setTextRange(
				ts.setOriginalNode(context.factory.createStringLiteral('host-transform'), node),
				node,
			);
		}
		return ts.visitEachChild(node, visitor, context);
	};
	return ts.visitNode(sourceFile, visitor);
};

function position(text, needle) {
	const offset = text.indexOf(needle);
	assert.ok(offset >= 0, `Missing mapped expression: ${needle}`);
	const before = text.slice(0, offset);
	return { line: before.split('\n').length, column: offset - before.lastIndexOf('\n') - 1 };
}

function build(round) {
	const directory = path.join(artifacts, `round-${round}`);
	const adapterDirectory = path.join(directory, 'node_modules/@fixture/valdi-writer');
	mkdirSync(adapterDirectory, { recursive: true });
	const recorderSource = readFileSync(
		new URL('../packages/octane/tests/_valdi-writer.ts', import.meta.url),
		'utf8',
	);
	writeFileSync(
		path.join(directory, 'recorder.cjs'),
		ts.transpileModule(recorderSource, {
			compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
		}).outputText,
	);
	writeFileSync(
		path.join(adapterDirectory, 'index.js'),
		readFileSync(path.join(fixture, 'writer.cjs')),
	);
	const maps = {};
	for (const [name, handoff] of handoffs) {
		const diagnostics = workspace.getDiagnosticsSync(handoff.virtualFilename);
		assert.equal(diagnostics.hasError, false, JSON.stringify({ name, diagnostics }, null, 2));
		const result = workspace.doEmitFile(handoff.virtualFilename, undefined, {
			before: [hostTransformer],
		});
		assert.equal(result.emitted, true);
		const javascript = result.entries.find((entry) => entry.fileName.endsWith('.js'));
		const declaration = result.entries.find((entry) => entry.fileName.endsWith('.d.ts'));
		assert.ok(javascript && declaration, `${name} must produce JavaScript and declarations`);
		assert.equal(javascript.content.split(SOURCE_MAP_PREFIX).length, 2);
		assert.deepEqual(getRawSourceMap(javascript.content).sourcesContent, [handoff.result.code]);
		const code = mergeSourceMaps(handoff.carrier, javascript.content);
		const map = getRawSourceMap(code);
		assert.deepEqual(map.sources, [handoff.filename]);
		assert.deepEqual(map.sourcesContent, [handoff.source]);
		assert.equal(code.split(SOURCE_MAP_PREFIX).length, 2);
		const output = path.join(directory, path.relative(project, javascript.fileName));
		mkdirSync(path.dirname(output), { recursive: true });
		writeFileSync(output, code);
		writeFileSync(
			path.join(directory, path.relative(project, declaration.fileName)),
			declaration.content,
		);
		writeFileSync(`${output}.map.json`, JSON.stringify(map, null, 2));
		maps[name] = { sources: map.sources, sourcesContentMatches: true };
		if (name === 'Main.tsrx') {
			const needle = 'new Error(props.label)';
			const generated = position(code, needle);
			const original = getSourceMap(code).originalPositionFor(generated);
			assert.equal(original.source, handoff.filename);
			assert.equal(original.line, position(handoff.source, needle).line);
			assert.equal(original.column, position(handoff.source, needle).column);
			maps[name].probe = { generated, original };
		}
	}
	const require = createRequire(path.join(directory, 'entry.cjs'));
	const module = require('./Main.tsrx.js');
	const writer = require('@fixture/valdi-writer');
	assert.equal(module.buildMarker, 'host-transform');
	const first = writer.render(module.Main, { label: 'hello' });
	const values = (nodes) => nodes[0].children.map((node) => node.props.value);
	assert.deepEqual(values(first), [
		`${round === 1 ? 'one' : 'updated'}:hello`,
		'two:hello',
		'hello',
	]);
	first[0].children[2].props.onTap();
	const updated = writer.render(module.Main, { label: 'hello' });
	assert.deepEqual(values(updated), [
		`${round === 1 ? 'one' : 'updated'}:edited`,
		'two:edited',
		'edited',
	]);
	const log = [];
	const previousLog = console.log;
	const previousRuntime = globalThis.runtime;
	try {
		console.log = (value) => log.push(value);
		globalThis.runtime = { isLoggingEnabled: false };
		assert.equal(module.trace({ label: 'silent' }), 'silent');
		assert.deepEqual(log, []);
		globalThis.runtime.isLoggingEnabled = true;
		module.trace({ label: 'visible' });
		assert.deepEqual(log, ['visible']);
	} finally {
		console.log = previousLog;
		globalThis.runtime = previousRuntime;
	}
	assert.throws(() => module.mappedFailure({ label: 'mapped failure' }), /mapped failure/);
	return {
		initial: values(first),
		updated: values(updated),
		maps,
		hostTransformer: module.buildMarker,
		logging: log,
	};
}

try {
	workspace.initialize();
	// Workspace owns a virtual filesystem. Register the actual package metadata
	// and public declaration so Node10 resolves its typesVersions entry normally.
	for (const name of ['package.json', 'src/compiler/valdi.d.ts']) {
		workspace.registerDiskFile(
			path.join(project, 'node_modules/octane', name),
			fileURLToPath(new URL(`../packages/octane/${name}`, import.meta.url)),
		);
	}
	// Reuse the packed-package consumer to validate the complete type contract
	// with the SDK's TypeScript version, without emitting or executing assertions.
	const contractFile = path.join(project, 'compiler-valdi-adapter.test-d.ts');
	workspace.registerDiskFile(
		contractFile,
		fileURLToPath(
			new URL('../packages/octane/typetests/compiler-valdi-adapter.test-d.ts', import.meta.url),
		),
	);
	workspace.addSourceFileAtPath(contractFile);
	const contract = workspace.getOpenedFile(contractFile);
	// The companion's separate runtime-module validator does not resolve type-only
	// npm package entries. Check this diagnostic-only consumer in its SDK Program.
	const contractDiagnostics = ts.getPreEmitDiagnostics(
		contract.workspaceProject.program,
		contract.sourceFile,
	);
	assert.deepEqual(
		contractDiagnostics.map((diagnostic) => ({
			code: diagnostic.code,
			message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
		})),
		[],
	);
	workspace.registerInMemoryFile(
		adapterFile,
		readFileSync(path.join(fixture, 'writer.d.ts'), 'utf8'),
	);
	workspace.addSourceFileAtPath(adapterFile);
	for (const name of names) register(name, readFileSync(path.join(fixture, name), 'utf8'));
	const first = build(1);
	const symbols = await workspace.dumpSymbolsWithComments(
		handoffs.get('Main.tsrx').virtualFilename,
	);
	const model = symbols.dumpedSymbols.find((symbol) => symbol.text === 'Props');
	assert.ok(model?.leadingComments?.text.includes('@ExportModel'));
	assert.equal(model.interface.members[0].name, 'label');
	assert.equal(model.interface.members[0].type.name, 'string');
	register(
		'one/Widget.tsrx',
		handoffs.get('one/Widget.tsrx').source.replace("'one:'", "'updated:'"),
	);
	register('Main.tsrx', `\n\n\n${handoffs.get('Main.tsrx').source}`);
	const second = build(2);
	const report = {
		valdiRevision: sdk.revision,
		typescript: ts.version,
		nativeModelMetadata: model,
		rounds: [first, second],
	};
	writeFileSync(path.join(artifacts, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
	console.log(`Valdi TypeScript build passed: public SDK ${sdk.revision}; artifacts ${artifacts}`);
} finally {
	workspace.destroy();
}
