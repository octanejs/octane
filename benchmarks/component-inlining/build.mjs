import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import ts from 'typescript';
import { writeStaticSources } from './generate.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const { values } = parseArgs({
	options: {
		'source-root': { type: 'string' },
		out: { type: 'string' },
		mode: { type: 'string', default: 'work' },
	},
});
assert(values['source-root'] && values.out, 'Pass --source-root and --out');
assert(['work', 'timing'].includes(values.mode), 'Expected --mode work|timing');
const sourceRoot = fs.realpathSync(values['source-root']);
const out = path.resolve(values.out);
assert(!fs.existsSync(out), 'Use a new output directory');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'sources'));
const fixtureRoot = fs.realpathSync(path.join(out, 'sources'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const digest = (file) => hash(fs.readFileSync(file));
const packageRoot = path.join(sourceRoot, 'packages/octane');
const runtimeRoot = path.join(packageRoot, 'src');
const compilerFile = path.join(runtimeRoot, 'compiler/vite.js');
const { octane } = await import(pathToFileURL(compilerFile).href);
const packageJSON = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
// The selected snapshot may share dependencies with another checkout. Every
// Octane entry must still resolve to this snapshot's authored source.
const alias = Object.entries(packageJSON.exports).flatMap(([key, value]) => {
	const target = typeof value === 'string' ? value : value.default;
	if (!target) return [];
	const name = key === '.' ? 'octane' : 'octane' + key.slice(1);
	return [
		{
			find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
			replacement: path.resolve(packageRoot, target),
		},
	];
});
function files(directory) {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const file = path.join(directory, entry.name);
			return entry.isDirectory() ? files(file) : [file];
		})
		.sort();
}
const sourceInputs = Object.fromEntries(
	[...files(runtimeRoot), path.join(packageRoot, 'package.json')].map((file) => [
		path.relative(sourceRoot, file),
		digest(file),
	]),
);
const scenarios = writeStaticSources(path.join(fixtureRoot, 'cases'));
fs.copyFileSync(path.join(here, 'client.ts'), path.join(fixtureRoot, 'client.ts'));
fs.writeFileSync(
	path.join(fixtureRoot, 'main.ts'),
	"import { install } from './client';\nimport { cases } from './cases/registry';\ninstall(cases);\n",
);
fs.writeFileSync(
	path.join(fixtureRoot, 'index.html'),
	'<!doctype html><meta charset="utf-8"><div id="mount"></div><script type="module" src="./main.ts"></script>',
);
const authored = Object.fromEntries(
	files(fixtureRoot).map((file) => [path.relative(fixtureRoot, file), digest(file)]),
);
const compiled = [];
let runtimeInputs = [];
const options = {
	hmr: false,
	profile: false,
	minify: values.mode === 'timing' ? 'esbuild' : false,
	target: 'esnext',
};
await build({
	configFile: false,
	root: fixtureRoot,
	logLevel: 'warn',
	resolve: { alias },
	plugins: [
		octane({ hmr: options.hmr, profile: options.profile }),
		{
			name: 'component-inlining-evidence',
			enforce: 'post',
			transform(code, id) {
				if (id.startsWith(fixtureRoot + path.sep) && id.endsWith('.tsrx'))
					compiled.push({ file: path.relative(fixtureRoot, id), code });
				return null;
			},
			generateBundle() {
				const ids = [...this.getModuleIds()].filter((id) => id.includes('/packages/octane/src/'));
				assert(
					ids.includes(path.join(runtimeRoot, 'runtime.ts')),
					'Selected runtime must be loaded',
				);
				assert(
					ids.every((id) => id.startsWith(runtimeRoot + path.sep)),
					'Foreign Octane source',
				);
				runtimeInputs = ids
					.filter((id) => fs.existsSync(id))
					.sort()
					.map((id) => ({ file: path.relative(sourceRoot, id), sha256: digest(id) }));
			},
		},
	],
	define: { 'process.env.NODE_ENV': JSON.stringify('production') },
	build: {
		outDir: path.join(out, 'dist'),
		emptyOutDir: false,
		target: options.target,
		minify: options.minify,
		sourcemap: 'hidden',
	},
});
// Output counts describe code generation, never executed body counts.
function analyze(code, file) {
	const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
	const aliases = new Map();
	for (const statement of ast.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings))
			for (const item of bindings.elements)
				aliases.set(item.name.text, item.propertyName?.text ?? item.name.text);
	}
	const calls = {},
		templates = [];
	function walk(node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const name = aliases.get(node.expression.text);
			if (name) {
				calls[name] = (calls[name] ?? 0) + 1;
				if (name === 'template' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
					templates.push(node.arguments[0].text);
			}
		}
		ts.forEachChild(node, walk);
	}
	walk(ast);
	return { bytes: Buffer.byteLength(code), calls, templates };
}
const modules = compiled
	.sort((a, b) => a.file.localeCompare(b.file))
	.map(({ file, code }) => {
		const target = path.join(out, 'compiled', file + '.js');
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, code);
		return {
			file,
			authoredSHA256: authored[file],
			compiledSHA256: hash(code),
			...analyze(code, file),
		};
	});
assert.equal(modules.length, 15, 'All six applications and nine imported components compiled');
const assets = files(path.join(out, 'dist')).map((file) => {
	const data = fs.readFileSync(file);
	return {
		file: path.relative(path.join(out, 'dist'), file),
		sha256: hash(data),
		bytes: data.length,
		...(file.endsWith('.js') ? { gzipBytes: gzipSync(data, { level: 9 }).length } : {}),
	};
});
for (const [file, expected] of Object.entries(sourceInputs))
	assert.equal(
		digest(path.join(sourceRoot, file)),
		expected,
		'Source changed during build: ' + file,
	);
const require = createRequire(import.meta.url);
const tools = Object.fromEntries(
	['vite', 'esbuild', 'typescript', 'playwright'].map((name) => [
		name,
		JSON.parse(fs.readFileSync(require.resolve(name + '/package.json'))).version,
	]),
);
const scripts = Object.fromEntries(
	['build.mjs', 'generate.mjs', 'client.ts'].map((file) => [file, digest(path.join(here, file))]),
);
const js = assets.filter((asset) => asset.file.endsWith('.js'));
const manifest = {
	sourceRoot,
	node: process.version,
	tools,
	options,
	scripts,
	sourceInputs,
	authored,
	scenarios,
	modules,
	runtimeInputs,
	assets,
	totalJS: {
		raw: js.reduce((n, item) => n + item.bytes, 0),
		gzip: js.reduce((n, item) => n + item.gzipBytes, 0),
	},
};
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(
	JSON.stringify({
		out,
		mode: values.mode,
		scenarios: scenarios.length,
		modules: modules.length,
		totalJS: manifest.totalJS,
	}),
);
