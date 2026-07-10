// Build the publishable `octane` package. Dev and tests import `./src` directly (via the
// top-level `exports`), so this only runs at publish time (from `prepack`); `publishConfig`
// swaps the published entry points to `./dist`.
//
// Three steps, matching the two source shapes:
//   1. The `.ts` runtime → ESM `.js`, transpiled PER FILE (no bundling) so the module
//      structure and the `import … from '../package.json' with { type: 'json' }` attribute
//      both survive intact for a plain Node ESM consumer.
//   2. The compiler is already plain `.js` (its only deps are `@tsrx/core` + `esrap`) — copy
//      it verbatim.
//   3. Type declarations (`tsc --emitDeclarationOnly`) alongside the JS.
//
// Entry points are GLOBBED from `src/`, not hand-listed — a hand-maintained list
// silently drifted before (css.ts, server/rpc.ts, static/index.ts were missing and
// dist shipped with unresolvable imports). verify-dist.mjs backstops the build:
// every emitted module's relative imports must resolve, every publishConfig export
// must exist, and every entry point must import cleanly in plain Node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeDist, verifyDist } from './verify-dist.mjs';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(pkgDir, '..', '..');
const src = join(pkgDir, 'src');
const dist = join(pkgDir, 'dist');

rmSync(dist, { recursive: true, force: true });

// Every .ts module plus any shared plain-JS modules, except the compiler dir
// (already plain .js — copied verbatim below).
const entryPoints = readdirSync(src, { recursive: true })
	.filter(
		(f) =>
			(f.endsWith('.ts') || f.endsWith('.js')) &&
			!f.endsWith('.d.ts') &&
			!f.startsWith(`compiler${sep}`),
	)
	.map((f) => join(src, f));

await build({
	entryPoints,
	outdir: dist,
	outbase: src,
	format: 'esm',
	platform: 'neutral',
	target: 'esnext',
	bundle: false,
});

cpSync(join(src, 'compiler'), join(dist, 'compiler'), { recursive: true });
// Hand-written declarations for the plain-JS dom-tables module (tsc only emits
// declarations for the .ts sources).
cpSync(join(src, 'dom-tables.d.ts'), join(dist, 'dom-tables.d.ts'));

execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(pkgDir, 'tsconfig.build.json')], {
	stdio: 'inherit',
});

await verifyDist(pkgDir);
smokeDist(pkgDir);

console.log('octane: built dist/ (runtime JS + .d.ts + compiler) — imports verified');
