// Build the publishable `octane` package. Dev and tests import `./src` directly (via the
// top-level `exports`), so this only runs at publish time (from `prepack`); `publishConfig`
// swaps the published entry points to `./dist`.
//
// Three steps, matching the two source shapes:
//   1. The `.ts` runtime → `.js`, transpiled PER FILE (no bundling) so the module
//      structure and generated package-version literal remain intact for a plain Node
//      consumer. build-runtime.mjs emits the bundler ESM tree, the `node`-condition
//      ESM tree, and CommonJS.
//   2. The compiler and its separately imported Node adapters are already plain
//      `.js` — copy them and their hand-written declarations. Bundle only the
//      Volar entry's third-party graph so published typechecks use the audited
//      parser/printer versions; Octane's own compiler modules remain shared.
//   3. Type declarations (`tsc --emitDeclarationOnly`) alongside the JS.
//
// Entry points are GLOBBED from `src/`, not hand-listed — a hand-maintained list
// silently drifted before (css.ts, server/rpc.ts, static/index.ts were missing and
// dist shipped with unresolvable imports). verify-dist.mjs backstops the build:
// every emitted module's relative imports must resolve, every publishConfig export
// must exist, and every entry point must import cleanly in plain Node.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPublishedRuntime } from './build-runtime.mjs';
import { bundleVolarCompiler } from './bundle-volar.mjs';
import { smokeDist, verifyDist } from './verify-dist.mjs';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(pkgDir, '..', '..');
const src = join(pkgDir, 'src');
const dist = join(pkgDir, 'dist');

execFileSync(process.execPath, [join(pkgDir, 'scripts', 'generate-version.mjs'), '--check'], {
	stdio: 'inherit',
});

rmSync(dist, { recursive: true, force: true });

await buildPublishedRuntime(pkgDir);

cpSync(join(src, 'compiler'), join(dist, 'compiler'), { recursive: true });
await bundleVolarCompiler({ packageDir: pkgDir, outdir: join(dist, 'compiler') });
// Hand-written declarations for the plain-JS dom-tables module (tsc only emits
// declarations for the .ts sources). The JSX runtime is likewise a type-only
// input declaration: compiled Octane JSX never imports a runtime module.
cpSync(join(src, 'dom-tables.d.ts'), join(dist, 'dom-tables.d.ts'));
cpSync(join(src, 'style-values.d.ts'), join(dist, 'style-values.d.ts'));
cpSync(join(src, 'event-names.d.ts'), join(dist, 'event-names.d.ts'));
cpSync(join(src, 'html-tree-validation.d.ts'), join(dist, 'html-tree-validation.d.ts'));
cpSync(join(src, 'jsx-runtime.d.ts'), join(dist, 'jsx-runtime.d.ts'));
cpSync(join(src, 'jsx-runtime-strong.d.ts'), join(dist, 'jsx-runtime-strong.d.ts'));

execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(pkgDir, 'tsconfig.build.json')], {
	stdio: 'inherit',
});

await verifyDist(pkgDir);
smokeDist(pkgDir);
execFileSync(process.execPath, ['--test', join(pkgDir, 'scripts', 'published-errors.test.mjs')], {
	stdio: 'inherit',
});

const packageVersion = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
const { version: publishedVersion } = await import(pathToFileURL(join(dist, 'index.js')).href);
if (publishedVersion !== packageVersion) {
	throw new Error(
		`octane: published version ${JSON.stringify(publishedVersion)} does not match package.json version ${JSON.stringify(packageVersion)}`,
	);
}

console.log('octane: built dist/ (runtime JS + .d.ts + compiler) — imports verified');
