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
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(pkgDir, '..', '..');
const src = join(pkgDir, 'src');
const dist = join(pkgDir, 'dist');

rmSync(dist, { recursive: true, force: true });

await build({
	entryPoints: [
		join(src, 'index.ts'),
		join(src, 'runtime.ts'),
		join(src, 'runtime.server.ts'),
		join(src, 'constants.ts'),
		join(src, 'css.ts'),
		// Already plain JS (the DOM truth tables the verbatim-copied compiler also
		// imports, as `../dom-tables.js`) — esbuild passes it through so it lands
		// next to constants.js, where both dist consumers resolve it.
		join(src, 'dom-tables.js'),
		join(src, 'server/index.ts'),
		join(src, 'server/rpc.ts'),
		join(src, 'static/index.ts'),
	],
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

console.log('octane: built dist/ (runtime JS + .d.ts + compiler)');
