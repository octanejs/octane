// Emits the per-base coverage table into README.md, between the COVERAGE markers.
//
// Generated rather than hand-written because families land ONE AT A TIME: a table maintained by
// hand is wrong the moment the next one lands, and a wrong coverage table is worse than none —
// it is the thing people read to decide what to work on.
//
// Coverage itself is read from the filesystem (which families each base actually ships). The only
// authored input is WHY a family is absent from a base, which no directory listing can tell you.
//
// Usage: node scripts/build-coverage-table.mjs [--check]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(PKG_ROOT, 'README.md');
const BEGIN = '<!-- BEGIN COVERAGE -->';
const END = '<!-- END COVERAGE -->';

const BASES = [
	{ dir: 'radix', label: 'Radix', style: 'radix-nova' },
	{ dir: 'react-aria', label: 'React Aria', style: 'aria-nova' },
	{ dir: 'base-ui', label: 'Base UI', style: 'base-nova' },
];

// Why a family is absent, keyed `<base>/<family>`. Anything absent and unlisted is simply not
// ported yet and is fair game to pick up — which is the point of the table.
//
// Keep this list SHORT and true: a wrong "blocked" note stops someone porting a family that is
// actually portable. `badge`/`breadcrumb`/`item`/`sidebar` are deliberately NOT listed — they
// need only radix's `Slot`, and Base UI's `render` prop covers that.
const BLOCKED = {
	'base-ui/navigation-menu': '@octanejs/base-ui has no navigation-menu primitive',
	'base-ui/scroll-area': '@octanejs/base-ui has no scroll-area primitive',
	'base-ui/select': '@octanejs/base-ui has no select primitive',
	'base-ui/tabs': '@octanejs/base-ui has no tabs primitive',
	'base-ui/sonner': 'needs next-themes, which has no octane binding',
	'react-aria/hover-card': 'no counterpart in upstream’s aria base',
	'react-aria/menubar': 'no counterpart in upstream’s aria base',
	'react-aria/navigation-menu': 'no counterpart in upstream’s aria base',
	'react-aria/context-menu': 'no counterpart in upstream’s aria base',
	'react-aria/dropdown-menu': 'no counterpart in upstream’s aria base',
	'react-aria/progress': 'no counterpart in upstream’s aria base',
	'react-aria/select': 'needs input-group',
	'react-aria/sidebar': 'no counterpart in upstream’s aria base',
	'react-aria/sonner': 'needs next-themes, which has no octane binding',
	'react-aria/toggle-group': 'no counterpart in upstream’s aria base',
	'react-aria/tooltip': 'no counterpart in upstream’s aria base',
};

async function familiesOf(dir) {
	const entries = await readdir(join(PKG_ROOT, 'src', 'bases', dir, 'ui'));
	return new Set(entries.filter((f) => f.endsWith('.tsrx')).map((f) => f.slice(0, -5)));
}

const coverage = new Map();
for (const base of BASES) coverage.set(base.dir, await familiesOf(base.dir));

const families = [...new Set([...coverage.values()].flatMap((s) => [...s]))].sort();

const cell = (baseDir, family) => {
	if (coverage.get(baseDir).has(family)) return '✅';
	return BLOCKED[`${baseDir}/${family}`] ? '⛔' : '—';
};

const counts = BASES.map((b) => `${b.label} ${coverage.get(b.dir).size}/${families.length}`).join(
	' · ',
);

const lines = [
	BEGIN,
	'',
	`**${families.length} families** — ${counts}`,
	'',
	'✅ ported · — not ported yet (fair game) · ⛔ blocked, see notes below',
	'',
	`| Family | ${BASES.map((b) => b.label).join(' | ')} |`,
	`| --- | ${BASES.map(() => ':---:').join(' | ')} |`,
	...families.map((f) => `| \`${f}\` | ${BASES.map((b) => cell(b.dir, f)).join(' | ')} |`),
	'',
];

const blockedRows = Object.entries(BLOCKED)
	.filter(([key]) => {
		const [baseDir, family] = key.split('/');
		return families.includes(family) && !coverage.get(baseDir).has(family);
	})
	.sort();

if (blockedRows.length) {
	lines.push(
		'**Blocked**',
		'',
		'| Base | Family | Reason |',
		'| --- | --- | --- |',
		...blockedRows.map(([key, why]) => {
			const [baseDir, family] = key.split('/');
			const label = BASES.find((b) => b.dir === baseDir).label;
			return `| ${label} | \`${family}\` | ${why} |`;
		}),
		'',
	);
}

lines.push(END);
const table = lines.join('\n');

const readme = await readFile(README, 'utf8');
const start = readme.indexOf(BEGIN);
const stop = readme.indexOf(END);
if (start === -1 || stop === -1) {
	console.error(`README.md is missing the ${BEGIN} / ${END} markers`);
	process.exit(1);
}

const next = readme.slice(0, start) + table + readme.slice(stop + END.length);

if (process.argv.includes('--check')) {
	if (next !== readme) {
		console.error('README coverage table is stale — run: node scripts/build-coverage-table.mjs');
		process.exit(1);
	}
	console.log(`coverage table is current (${families.length} families).`);
} else {
	await writeFile(README, next);
	console.log(`wrote README coverage table (${families.length} families; ${counts}).`);
}
