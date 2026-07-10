import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates docs/parity-gaps.md — the index of EXECUTABLE `it.fails(...)`
// parity pins under packages/octane/tests. This is the real React-parity
// backlog; `// GAP` comments alone are NOT indexed because many of them are
// historical notes on since-fixed behavior. Titles (not line numbers) key the
// index so unrelated edits to a test file don't churn it.
//
//   node scripts/generate-parity-gaps.mjs           # (re)write the index
//   node scripts/generate-parity-gaps.mjs --check   # exit 1 if index is stale
//
// Wired as `pnpm parity:gaps` / `pnpm parity:gaps:check` (the latter runs in
// CI, so fixing a gap — which flips its it.fails to a plain it — forces the
// index to be regenerated in the same change).

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TESTS_ROOT = path.join(REPO, 'packages/octane/tests');
const OUT = path.join(REPO, 'docs/parity-gaps.md');
const CHECK = process.argv.includes('--check');

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(p);
		else if (entry.isFile() && entry.name.endsWith('.test.ts')) yield p;
	}
}

// Matches an executable `it.fails(` at the start of a statement and captures
// the title string that follows (same line or the next — the repo's prettier
// style wraps long titles onto their own line).
function findPins(source) {
	const pins = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trimStart();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
		const m = trimmed.match(/^it\.fails(?:<[^>]*>)?\(\s*(.*)$/);
		if (!m) continue;
		let rest = m[1];
		if (!rest) rest = (lines[i + 1] ?? '').trimStart();
		const title = rest.match(/^(['"`])((?:\\.|(?!\1).)*)\1/);
		// A GAP note directly above the pin (contiguous comment block) is the
		// authoritative diagnosis — carry the whole block into the index.
		let gap = null;
		for (let j = i - 1; j >= 0 && i - j <= 16; j--) {
			const c = lines[j].trim();
			if (!c.startsWith('//') && !c.startsWith('*') && !c.startsWith('/*') && c !== '') break;
			const g = c.match(/(?:\/\/|\*)\s*GAP:?\s*(.*)/);
			if (g) {
				// Join the GAP line with its continuation comment lines (down to
				// the pin) into one sentence-flowed note.
				const parts = [g[1].trim()];
				for (let k = j + 1; k < i; k++) {
					const cont = lines[k].trim().replace(/^(?:\/\/|\*|\/\*)\s?/, '');
					if (cont) parts.push(cont);
				}
				gap = parts.join(' ').trim();
				break;
			}
		}
		pins.push({ line: i + 1, title: title ? title[2] : '<unparsed title>', gap });
	}
	return pins;
}

const byFile = new Map();
let total = 0;
for (const file of walk(TESTS_ROOT)) {
	const pins = findPins(readFileSync(file, 'utf8'));
	if (pins.length) {
		byFile.set(path.relative(REPO, file), pins);
		total += pins.length;
	}
}

let md = `# React-parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm parity:gaps\`. -->

The **executable** parity backlog: every \`it.fails(...)\` pin under
\`packages/octane/tests\`. Each pin is a real, currently-failing divergence from
React — when the runtime is fixed the pin flips red in the suite and must be
converted to a plain \`it\`, and this index must be regenerated
(\`pnpm parity:gaps\`; CI runs \`parity:gaps:check\`).

\`// GAP\` comments in test files are NOT the backlog — many annotate
since-fixed behavior or intentional platform differences. Only the pins below
are live gaps.

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
