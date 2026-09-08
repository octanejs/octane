import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, realpath, readlink, symlink, rename } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const provenance = JSON.parse(await readFile(path.join(here, 'provenance.json'), 'utf8'));
if (!process.argv[2]) {
	throw new Error('Usage: node materialize.mjs /absolute/react-dom/package [output-directory]');
}
const sourceDir = await realpath(process.argv[2]);
async function resolveDestination(candidate) {
	try {
		return await realpath(candidate);
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
		return path.join(await resolveDestination(path.dirname(candidate)), path.basename(candidate));
	}
}
const outputDir = await resolveDestination(
	path.resolve(process.argv[3] ?? path.join(here, 'generated')),
);
if (outputDir === sourceDir || outputDir.startsWith(sourceDir + path.sep)) {
	throw new Error('Output must not modify the installed React DOM package.');
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}
function replaceOnce(source, needle, replacement, label) {
	const index = source.indexOf(needle);
	if (index < 0 || source.indexOf(needle, index + needle.length) >= 0) {
		throw new Error(`Expected one exact ${label} seam; refusing to patch.`);
	}
	return source.slice(0, index) + replacement + source.slice(index + needle.length);
}

// Verify every input before producing any output. The hashes were independently
// checked against the npm tarball with the SRI recorded in provenance.json.
const inputs = new Map();
for (const [relative, expected] of Object.entries(provenance.files)) {
	const bytes = await readFile(path.join(sourceDir, relative));
	if (sha256(bytes) !== expected) {
		throw new Error(`Unrecognized ${relative}; expected exact react-dom@19.2.7 artifact.`);
	}
	inputs.set(relative, bytes.toString('utf8'));
}
const fragment = await readFile(path.join(here, 'commit-admission.inc.js'), 'utf8');
const sourceRequire = createRequire(path.resolve(sourceDir, 'package.json'));
const runtimePackages = {};
for (const name of ['react', 'react-dom', 'scheduler']) {
	const packageJson = sourceRequire.resolve(`${name}/package.json`);
	const info = JSON.parse(await readFile(packageJson, 'utf8'));
	if ((name === 'react' || name === 'react-dom') && info.version !== provenance.version) {
		throw new Error(`Runtime ${name} must be exactly ${provenance.version}.`);
	}
	runtimePackages[name] = {
		version: info.version,
		directory: await realpath(path.dirname(packageJson)),
	};
}
const output = new Map();
const patches = [];
for (const mode of ['development', 'production']) {
	const relative = `cjs/react-dom-client.${mode}.js`;
	let source = inputs.get(relative);
	const signature =
		mode === 'development' ? '    function commitRoot(\n' : 'function commitRoot(\n';
	source = replaceOnce(source, signature, fragment + '\n' + signature, `${mode} helper insertion`);
	const start = source.indexOf(signature);
	const body = source.indexOf(') {\n', start) + 4;
	const cancelLine =
		mode === 'development'
			? '      root.cancelPendingCommit = null;'
			: '  root.cancelPendingCommit = null;';
	if (source.slice(body, body + cancelLine.length) !== cancelLine) {
		throw new Error(`Unexpected ${mode} commitRoot body; refusing to patch.`);
	}
	source =
		source.slice(0, body) +
		'  if (__octaneMaybeHoldCommit(arguments)) return;\n' +
		source.slice(body);
	source = replaceOnce(
		source,
		'return new ReactDOMRoot(options);',
		'return __octaneTrackCreatedRoot(new ReactDOMRoot(options));',
		`${mode} root tracking`,
	);
	source = replaceOnce(
		source,
		'exports.createRoot = function (container, options) {',
		'exports.attachCommitGate = __octaneAttachCommitGate;\nexports.createRoot = function (container, options) {',
		`${mode} experimental export`,
	);
	output.set(`react-dom-client.${mode}.cjs`, source);
	patches.push({
		source: relative,
		output: `react-dom-client.${mode}.cjs`,
		sha256: sha256(source),
	});
}
output.set('LICENSE', inputs.get('LICENSE'));
output.set(
	'client.cjs',
	`'use strict';\nmodule.exports = process.env.NODE_ENV === 'production'\n  ? require('./react-dom-client.production.cjs')\n  : require('./react-dom-client.development.cjs');\n`,
);
output.set(
	'manifest.json',
	JSON.stringify(
		{
			...provenance,
			fragmentSha256: sha256(fragment),
			runtimePackages,
			patches,
			experimental: true,
			capability: 'single-root-completed-commit-admission-only',
		},
		null,
		2,
	) + '\n',
);
await mkdir(outputDir, { recursive: true });
// pnpm does not expose the transitive scheduler dependency at repository root.
// Reuse this exact installation's dependencies without installing or copying
// them; React must resolve to the same module instance as the fixture imports.
await mkdir(path.join(outputDir, 'node_modules'), { recursive: true });
for (const [name, info] of Object.entries(runtimePackages)) {
	const link = path.join(outputDir, 'node_modules', name);
	try {
		await symlink(info.directory, link, 'dir');
	} catch (error) {
		if (error.code !== 'EEXIST' || (await readlink(link)) !== info.directory) throw error;
	}
}
for (const [filename, contents] of output) {
	// Atomic replacement avoids following an existing output-file symlink into
	// an installed package. All temporary paths are confined to outputDir.
	const temporary = path.join(outputDir, `.${filename}.${process.pid}.tmp`);
	await writeFile(temporary, contents, { flag: 'wx' });
	await rename(temporary, path.join(outputDir, filename));
}
console.log(JSON.stringify({ outputDir, patches }, null, 2));
