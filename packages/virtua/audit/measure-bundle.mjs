import { gzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exportsList = ['VList', 'Virtualizer', 'WindowVirtualizer', 'experimental_VGrid'];

async function measure(label, plugins = []) {
	const result = await build({
		configFile: false,
		root: packageRoot,
		logLevel: 'silent',
		plugins,
		build: {
			write: false,
			minify: 'esbuild',
			lib: {
				entry: resolve(packageRoot, `audit/${label}-entry.${label === 'react' ? 'js' : 'ts'}`),
				formats: ['es'],
			},
			rollupOptions: {
				external(id) {
					return /^(?:react|react-dom|octane)(?:\/|$)/.test(id);
				},
			},
		},
	});
	const chunks = (Array.isArray(result) ? result : [result]).flatMap((output) =>
		output.output.filter((entry) => entry.type === 'chunk'),
	);
	const code = chunks.map((chunk) => chunk.code).join('\n');
	const exported = [...new Set(chunks.flatMap((chunk) => chunk.exports))].sort();
	if (JSON.stringify(exported) !== JSON.stringify([...exportsList].sort())) {
		throw new Error(`${label} bundle exports changed: ${exported.join(', ')}`);
	}
	return { label, bytes: Buffer.byteLength(code), gzip: gzipSync(code).byteLength };
}

const react = await measure('react');
const octaneBundle = await measure('octane', [octane()]);
const delta = octaneBundle.gzip - react.gzip;
const maxGzipRatio = 1.25;

console.log(JSON.stringify({ react, octane: octaneBundle, gzipDelta: delta }, null, 2));
// Reason: Octane's authored-source entry includes compiler-owned hook-slot metadata;
// keep the initial full-surface budget explicit and tighten it as that metadata shrinks.
if (octaneBundle.gzip > react.gzip * maxGzipRatio) {
	throw new Error(`Octane adapter gzip regression exceeds 25%: ${delta} bytes`);
}
