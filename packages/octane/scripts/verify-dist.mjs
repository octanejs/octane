// Post-build guard for the published `octane` package. The esbuild entry list in
// build.mjs used to be hand-maintained and silently drifted from `src/` (css.ts,
// server/rpc.ts, and static/index.ts went missing): dist shipped with unresolvable
// relative imports and nothing failed until a consumer imported the package. Entry
// points are now globbed, and this walker backstops the whole class of bug —
// including the verbatim-copied `dist/compiler/` — by failing the build instead of
// the consumer. Runs from build.mjs (so `prepack` can never publish a broken dist)
// and standalone against an existing dist: `node scripts/verify-dist.mjs`.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function publishedExportTargets(pkgDir) {
	const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
	const targets = new Set();
	for (const value of Object.values(pkg.publishConfig.exports)) {
		if (typeof value === 'string') targets.add(value);
		else for (const path of Object.values(value)) targets.add(path);
	}
	return [...targets];
}

export async function verifyDist(pkgDir) {
	const dist = join(pkgDir, 'dist');

	// Every publishConfig export target must exist. A missing entry module is a
	// root that nothing else imports, so the import walk below cannot see it —
	// this is exactly how the missing static/index.ts shipped unnoticed.
	const missing = publishedExportTargets(pkgDir).filter((p) => !existsSync(join(pkgDir, p)));
	if (missing.length > 0) {
		throw new Error(
			`octane dist verify: publishConfig.exports targets missing from the build:\n` +
				missing.map((p) => `  ${p}`).join('\n'),
		);
	}

	// Every relative import in every emitted .js module must resolve to a file.
	// esbuild in bundle mode is the resolver (a real parser, not a regex, and it
	// follows dynamic import() literals too): each dist module is its own entry,
	// bare specifiers stay external (they are declared dependencies, present at
	// install time), and *.json covers the `../package.json` attribute import
	// (package.json is always included in the tarball).
	const jsFiles = readdirSync(dist, { recursive: true })
		.filter((f) => f.endsWith('.js'))
		.map((f) => join(dist, f));
	try {
		await build({
			entryPoints: jsFiles,
			bundle: true,
			write: false,
			outdir: join(pkgDir, '.verify-dist-noop'), // never written (write: false); esbuild requires an outdir for multiple entries
			format: 'esm',
			platform: 'neutral',
			packages: 'external',
			external: ['*.json'],
			logLevel: 'silent',
		});
	} catch (error) {
		const details = (error.errors ?? [{ text: String(error) }])
			.map((e) => `  ${e.location ? `${e.location.file}:${e.location.line}: ` : ''}${e.text}`)
			.join('\n');
		throw new Error(`octane dist verify: unresolvable imports in dist:\n${details}`);
	}
}

// Import each published entry point in a fresh plain-Node process — the same
// resolution a consumer gets, catching anything static analysis can't (a module
// that throws at init, a bad package.json attribute import, …).
export function smokeDist(pkgDir) {
	const entries = publishedExportTargets(pkgDir).filter((p) => p.endsWith('.js'));
	for (const entry of entries) {
		const url = pathToFileURL(join(pkgDir, entry)).href;
		// Let Node exit naturally. This is also the published-runtime regression
		// guard: importing an entry must not allocate a channel, timer, listener, or
		// other host resource that keeps an otherwise-idle consumer alive.
		execFileSync(
			process.execPath,
			['--input-type=module', '-e', `await import(${JSON.stringify(url)});`],
			{ stdio: ['ignore', 'ignore', 'inherit'], cwd: pkgDir, timeout: 10_000 },
		);
	}
	return entries;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
	await verifyDist(pkgDir);
	const entries = smokeDist(pkgDir);
	console.log(`octane: dist verified (all imports resolve; smoke-imported ${entries.join(', ')})`);
}
