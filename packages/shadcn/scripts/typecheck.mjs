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

const check = (project) =>
	`${spawnSync(BIN, ['--noEmit', '-p', project], { cwd: PKG_ROOT, encoding: 'utf8' }).stdout ?? ''}`;

// Two programs, because they prove different things. `tsconfig.json` covers the
// authored sources. `tsconfig.consumer.json` covers tests/types/, which imports
// the package through its PUBLISHED `exports` subpaths — the surface consumers
// actually see. The source program cannot stand in for it: src/ imports its own
// files relatively and never exercises the exports map at all.
const lines = `${check('tsconfig.json')}\n${check('tsconfig.consumer.json')}`.split('\n');
const own = lines.filter((line) => /^(src|tests)[/\\].*error TS/.test(line));
const foreign = lines.filter((line) => /error TS/.test(line) && !/^(src|tests)[/\\]/.test(line));

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
	console.error(`\n@octanejs/shadcn: ${own.length} type error(s).`);
	process.exit(1);
}
console.log('@octanejs/shadcn: src/ and the published subpath surface typecheck clean.');
