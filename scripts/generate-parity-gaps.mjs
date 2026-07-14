import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFailsPins } from './parity-gaps-lib.mjs';

// Generates docs/parity-gaps.md — the index of executable `it.fails(...)` and
// `test.fails(...)`
// parity pins under packages/octane/tests. Repository policy requires this
// audit to remain empty; `// GAP` comments alone are NOT indexed because many
// are historical notes on since-fixed behavior. Titles (not line numbers) key
// the index so unrelated edits to a test file don't churn it.
//
//   node scripts/generate-parity-gaps.mjs           # (re)write the index
//   node scripts/generate-parity-gaps.mjs --check   # exit 1 if index is stale
//
// Wired as `pnpm parity:gaps` / `pnpm parity:gaps:check` (the latter runs in
// CI alongside the zero-marker policy check).

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_ROOT = path.join(REPO, 'packages/octane/tests');
const OUT = path.join(REPO, 'docs/parity-gaps.md');
const CHECK = process.argv.includes('--check');

const { byFile, total } = collectFailsPins(TESTS_ROOT, REPO);

let md = `# React-parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm parity:gaps\`. -->

This is a compatibility audit for executable \`it.fails(...)\` and
\`test.fails(...)\` pins under \`packages/octane/tests\`. Committed tests must
run normally, so repository policy requires this index to remain at zero. Fix
genuine gaps before landing their tests; assert intentional divergences as plain
passing tests.

\`// GAP\` comments in test files are NOT the backlog — many annotate
since-fixed behavior or intentional platform differences.

**${total} active pin(s).**
`;

for (const [file, pins] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
	md += `\n## ${file}\n\n`;
	for (const pin of pins) {
		md += `- **${pin.title}**\n`;
		if (pin.gap) md += `  - GAP: ${pin.gap}\n`;
	}
}

if (CHECK) {
	const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (current !== md) {
		console.error(
			'docs/parity-gaps.md is stale — the set of executable it.fails pins changed.\n' +
				'Run `pnpm parity:gaps` and commit the result.',
		);
		process.exit(1);
	}
	console.log(`parity-gaps index is current (${total} pin(s)).`);
} else {
	writeFileSync(OUT, md);
	console.log(`wrote docs/parity-gaps.md (${total} pin(s) across ${byFile.size} file(s)).`);
}
