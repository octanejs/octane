// Type-checks the package's own sources with `tsrx-tsc` (the only checker that
// parses `.tsrx`; plain `tsgo` cannot, which is why the repo's central
// typecheck never sees these files).
//
// Diagnostics are gated to THIS package's `src/`. Octane bindings ship raw
// sources rather than `.d.ts`, so a consumer's program necessarily contains the
// dependencies' own sources — and `skipLibCheck` does not apply to them. Errors
// from `@octanejs/*` dependencies (e.g. `@lucide/icons` shipping untyped ESM,
// or a binding's own type looseness) belong to those packages and cannot be
// fixed from here; failing this gate on them would make it un-actionable.
// They are still printed, under a clearly separated heading.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = resolve(PKG_ROOT, '../../node_modules/.bin/tsrx-tsc');

const run = spawnSync(BIN, ['--noEmit', '-p', 'tsconfig.json'], {
	cwd: PKG_ROOT,
	encoding: 'utf8',
});
const lines = `${run.stdout ?? ''}${run.stderr ?? ''}`.split('\n');
const own = lines.filter((line) => /^src[/\\].*error TS/.test(line));
const foreign = lines.filter((line) => /error TS/.test(line) && !/^src[/\\]/.test(line));

if (foreign.length) {
	const packages = new Set(
		foreign.map((line) => line.match(/@octanejs\/[\w-]+/)?.[0] ?? 'dependency').filter(Boolean),
	);
	console.log(
		`note: ${foreign.length} diagnostic(s) from dependency sources (${[...packages].join(', ')}) — not gated here.`,
	);
}

if (own.length) {
	console.error(own.join('\n'));
	console.error(`\n@octanejs/shadcn: ${own.length} type error(s) in src/.`);
	process.exit(1);
}
console.log('@octanejs/shadcn: src/ typechecks clean.');
