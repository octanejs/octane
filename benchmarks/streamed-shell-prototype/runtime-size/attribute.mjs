import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { digest, toolchain, tree } from '../signal-chat-route/evidence.mjs';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
// Use the pinned Vite/Terser dependency chain without changing workspace links.
const terserRequire = createRequire(
	require.resolve('terser', { paths: [require.resolve('vite')] }),
);
const sourceMapRequire = createRequire(terserRequire.resolve('@jridgewell/source-map'));
const { TraceMap, decodedMappings } = sourceMapRequire('@jridgewell/trace-mapping');
const output = path.resolve(process.argv[2] ?? '');
assert.ok(process.argv[2], 'Pass the build output directory');
const provenance = JSON.parse(fs.readFileSync(path.join(output, 'provenance.json'), 'utf8'));
const experimentProvenance = JSON.parse(
	fs.readFileSync(path.join(output, 'runtime-size-provenance.json'), 'utf8'),
);
const experiment = Object.fromEntries(
	Object.entries(tree(here)).filter(([name]) => name.endsWith('.mjs')),
);
assert.deepEqual(experiment, experimentProvenance.experiment, 'Experiment changed since build');
assert.deepEqual(toolchain(repo), provenance.toolchain, 'Toolchain changed since build');
assert.deepEqual(
	tree(path.join(output, 'source')),
	provenance.source,
	'Source snapshot changed since build',
);
const build = JSON.parse(fs.readFileSync(path.join(output, 'build-report.json'), 'utf8'));
// Line bands are source-navigation aids, not separable features or savings.
const bands = [
	[1, 'runtime imports, scope and native signal support'],
	[1641, 'hydration value matching and block state'],
	[2190, 'scheduler, transitions and journals'],
	[4879, 'view transitions and staged rendering'],
	[6335, 'scheduling and effect commits'],
	[10228, 'render and cleanup'],
	[11943, 'hooks'],
	[13829, 'context and deferred hydration'],
	[16542, 'suspense and parallel use'],
	[18000, 'DOM operations and templates'],
	[18280, 'hydration cursor and adoption'],
	[20365, 'hydration helpers, host properties and events'],
	[28154, 'portals and component slots'],
	[30795, 'host and descriptor reconciliation'],
	[35441, 'suspense and activity'],
	[41060, 'keyed control flow'],
	[43689, 'root and independent activation'],
	[45190, 'resource hints'],
];
function band(line) {
	let name = bands[0][1];
	for (const [start, next] of bands) {
		if (line < start) break;
		name = next;
	}
	return name;
}
function sourceGroups(dir, variant) {
	const stats = build.stats[variant];
	assert.deepEqual(
		tree(path.join(dir, 'project/dist'), new Set()),
		stats.artifactFiles,
		'Artifacts changed',
	);
	assert.equal(
		digest(fs.readFileSync(path.join(dir, 'chunk-modules.json'))),
		stats.chunkModulesSha256,
	);
	const chunks = JSON.parse(fs.readFileSync(path.join(dir, 'chunk-modules.json'), 'utf8'));
	const totals = { emittedBytes: 0, mappedRuntimeBytes: 0, mappedOtherBytes: 0, unmappedBytes: 0 };
	const runtimeBands = {};
	const chunkSummary = [];
	for (const file of Object.keys(stats.allReachableJs.files)) {
		const codePath = path.join(dir, 'project/dist/client', file);
		const code = fs.readFileSync(codePath, 'utf8');
		const mapPath = codePath + '.map';
		// Vite's generated bootstrap and preload helper may have no source map.
		// Count those bytes as unmapped instead of inventing attribution.
		const map = fs.existsSync(mapPath)
			? new TraceMap(JSON.parse(fs.readFileSync(mapPath, 'utf8')))
			: null;
		const decoded = map === null ? [] : decodedMappings(map);
		const lines = code.split('\n');
		const contribution = {
			emittedBytes: Buffer.byteLength(code),
			mappedRuntimeBytes: 0,
			mappedOtherBytes: 0,
			unmappedBytes: Math.max(0, lines.length - 1),
		};
		for (let line = 0; line < lines.length; line++) {
			const segments = decoded[line] ?? [];
			let cursor = 0;
			for (let index = 0; index < segments.length; index++) {
				const segment = segments[index];
				const start = segment[0];
				const end = segments[index + 1]?.[0] ?? lines[line].length;
				assert.ok(
					start >= cursor && end >= start && end <= lines[line].length,
					`Invalid source map span in ${file}`,
				);
				contribution.unmappedBytes += Buffer.byteLength(lines[line].slice(cursor, start));
				const bytes = Buffer.byteLength(lines[line].slice(start, end));
				if (segment.length < 4) contribution.unmappedBytes += bytes;
				else if (
					map !== null &&
					/(?:^|\/)packages\/octane\/src\/runtime\.ts$/.test(map.sources[segment[1]])
				) {
					contribution.mappedRuntimeBytes += bytes;
					const label = band(segment[2] + 1);
					runtimeBands[label] = (runtimeBands[label] ?? 0) + bytes;
				} else contribution.mappedOtherBytes += bytes;
				cursor = end;
			}
			contribution.unmappedBytes += Buffer.byteLength(lines[line].slice(cursor));
		}
		assert.equal(
			contribution.emittedBytes,
			contribution.mappedRuntimeBytes + contribution.mappedOtherBytes + contribution.unmappedBytes,
			`Source map attribution must account for every byte: ${file}`,
		);
		for (const key of Object.keys(totals)) totals[key] += contribution[key];
		const meta = chunks[file];
		assert.ok(meta, `Missing chunk metadata for ${file}`);
		chunkSummary.push({
			file,
			sourceMapAvailable: map !== null,
			...contribution,
			modules: Object.entries(meta.modules).map(([id, value]) => ({ id, ...value })),
		});
	}
	return { totals, runtimeBands, chunks: chunkSummary };
}
const result = {
	sourceSha256: build.sourceSha256,
	toolchainSha256: build.toolchainSha256,
	experimentSha256: experimentProvenance.experimentSha256,
	buildReportSha256: digest(fs.readFileSync(path.join(output, 'build-report.json'))),
	variants: Object.fromEntries(
		['baseline', 'control', 'fallback'].map((variant) => [
			variant,
			sourceGroups(path.join(output, variant), variant),
		]),
	),
	limitations:
		'Generated source maps can be sparse or shared after inlining/minification. Runtime bands are navigation aids and cannot be summed into removable or gzip savings; shared code may serve multiple features.',
};
fs.writeFileSync(path.join(output, 'attribution.json'), JSON.stringify(result, null, 2) + '\n', {
	flag: 'wx',
});
console.log(
	JSON.stringify(
		{
			output: path.join(output, 'attribution.json'),
			variants: Object.fromEntries(
				Object.entries(result.variants).map(([variant, data]) => [
					variant,
					{ totals: data.totals, runtimeBands: data.runtimeBands },
				]),
			),
		},
		null,
		2,
	),
);
