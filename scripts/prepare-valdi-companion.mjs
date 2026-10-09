import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/valdi-companion/', import.meta.url));
const manifest = JSON.parse(readFileSync(path.join(fixture, 'upstream.json'), 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const identity = digest(
	Buffer.concat([
		readFileSync(path.join(fixture, 'upstream.json')),
		readFileSync(path.join(fixture, 'package-lock.json')),
		readFileSync(fileURLToPath(import.meta.url)),
	]),
);

function verifyFile(file, expected) {
	if (!existsSync(file)) throw new Error(`Missing Valdi companion prerequisite: ${file}`);
	if (digest(readFileSync(file)) !== expected)
		throw new Error(`Valdi companion checksum mismatch: ${file}`);
}

/** Load only a verified, explicitly prepared public companion fixture. */
export function loadValdiCompanion(directory) {
	if (!directory) {
		throw new Error(
			'Set OCTANE_VALDI_COMPANION_DIR after running scripts/prepare-valdi-companion.mjs <cache-directory>.',
		);
	}
	const readyFile = path.join(directory, 'prepared.json');
	if (!existsSync(readyFile)) throw new Error(`Valdi companion is not prepared: ${readyFile}`);
	const prepared = JSON.parse(readFileSync(readyFile, 'utf8'));
	if (prepared.identity !== identity)
		throw new Error(
			'Valdi companion cache belongs to a different source/dependency/setup pin. Prepare a fresh cache directory.',
		);
	for (const [name, expected] of Object.entries(manifest.files)) {
		verifyFile(path.join(directory, 'upstream', name), expected);
	}
	for (const name of ['package.json', 'package-lock.json']) {
		verifyFile(path.join(directory, name), digest(readFileSync(path.join(fixture, name))));
	}
	for (const [name, expected] of Object.entries(prepared.compiled))
		verifyFile(path.join(directory, name), expected);
	const require = createRequire(path.join(directory, 'package.json'));
	const dependencies = JSON.parse(
		readFileSync(path.join(fixture, 'package.json'), 'utf8'),
	).dependencies;
	for (const [name, expected] of Object.entries(dependencies)) {
		if (require(`${name}/package.json`).version !== expected)
			throw new Error(`Valdi companion requires ${name}@${expected}`);
	}
	return {
		revision: manifest.revision,
		typescript: require('typescript'),
		Workspace: require('./compiled/src/Workspace.js').Workspace,
		sourceMaps: require('./compiled/src/SourceMapUtils.js'),
	};
}

async function prepare(directory) {
	if (!directory)
		throw new Error(
			'Usage: node scripts/prepare-valdi-companion.mjs <cache-directory-outside-checkout>',
		);
	directory = path.resolve(directory);
	if (existsSync(directory)) directory = realpathSync(directory);
	const relative = path.relative(repository, directory);
	if (relative === '' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
		throw new Error('Keep the public Valdi companion cache outside the checkout.');
	}
	if (existsSync(path.join(directory, 'prepared.json'))) {
		loadValdiCompanion(directory);
		console.log(`Verified public Valdi companion ${manifest.revision} in ${directory}`);
		return;
	}
	mkdirSync(directory, { recursive: true });
	for (const name of ['package.json', 'package-lock.json']) {
		const content = readFileSync(path.join(fixture, name));
		const destination = path.join(directory, name);
		if (existsSync(destination)) verifyFile(destination, digest(content));
		else writeFileSync(destination, content);
	}
	for (const [name, expected] of Object.entries(manifest.files)) {
		const destination = path.join(directory, 'upstream', name);
		if (!existsSync(destination)) {
			const url = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.revision}/${name}`;
			const response = await fetch(url);
			if (!response.ok) throw new Error(`Valdi source download failed: ${response.status} ${url}`);
			const bytes = Buffer.from(await response.arrayBuffer());
			if (digest(bytes) !== expected)
				throw new Error(`Valdi source download checksum mismatch: ${name}`);
			mkdirSync(path.dirname(destination), { recursive: true });
			writeFileSync(destination, bytes);
		}
		verifyFile(destination, expected);
	}
	// npm verifies the public tarball SRI values in the committed lock. Preserve
	// the caller's registry/auth configuration and never execute package scripts.
	const install = spawnSync(
		process.platform === 'win32' ? 'npm.cmd' : 'npm',
		['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
		{
			cwd: directory,
			stdio: 'inherit',
		},
	);
	if (install.error) throw install.error;
	if (install.status !== 0)
		throw new Error(`Pinned Valdi dependency installation failed (${install.status}).`);
	const require = createRequire(path.join(directory, 'package.json'));
	const ts = require('typescript');
	const compiled = {};
	for (const name of Object.keys(manifest.files)) {
		if (!name.startsWith('compiler/companion/src/') || name.endsWith('.d.ts')) continue;
		const outputName = `compiled/${name.slice('compiler/companion/'.length).replace(/\.ts$/, '.js')}`;
		const source = readFileSync(path.join(directory, 'upstream', name), 'utf8');
		let output = source;
		if (name.endsWith('.ts')) {
			const result = ts.transpileModule(source, {
				fileName: name,
				compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
				reportDiagnostics: true,
			});
			if (result.diagnostics.length)
				throw new Error(`Public Valdi source could not be transpiled: ${name}`);
			output = result.outputText;
		}
		mkdirSync(path.dirname(path.join(directory, outputName)), { recursive: true });
		writeFileSync(path.join(directory, outputName), output);
		compiled[outputName] = digest(output);
	}
	writeFileSync(
		path.join(directory, 'prepared.json'),
		`${JSON.stringify({ identity, revision: manifest.revision, compiled }, null, 2)}\n`,
	);
	loadValdiCompanion(directory);
	console.log(`Prepared public Valdi companion ${manifest.revision} in ${directory}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await prepare(process.argv[2]);
}
