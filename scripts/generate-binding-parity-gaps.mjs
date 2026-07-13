import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { collectFailsPins } from './parity-gaps-lib.mjs';
import { getBindingPackages, REPO_ROOT } from './workspace-packages.mjs';

const OUT = path.join(REPO_ROOT, 'docs/binding-parity-gaps.md');
const CHECK = process.argv.includes('--check');
const packages = getBindingPackages();
const rows = packages.map((pkg) => ({
	...pkg,
	...collectFailsPins(path.join(pkg.directory, 'tests'), REPO_ROOT),
}));
const total = rows.reduce((sum, row) => sum + row.total, 0);

let md = `# Binding parity gaps (generated)

<!-- GENERATED FILE — do not edit. Regenerate with \`pnpm binding-parity:gaps\`. -->

This is the executable failure-pin backlog for every framework binding discovered
from the workspace inventory. It includes \`it.fails(...)\` and
\`test.fails(...)\` across JavaScript, TypeScript, TSX, and TSRX test files.

Zero pins means only that a package has no executable expected-failure marker;
it does **not** imply complete upstream parity. Consult
[\`docs/bindings-status.md\`](bindings-status.md) for each binding's supported
surface and evidence.

**${total} active pin(s) across ${packages.length} binding package(s).**

| Package | Active pins |
| --- | ---: |
`;

for (const row of rows) md += `| \`${row.name}\` | ${row.total} |\n`;

for (const row of rows.filter((entry) => entry.total > 0)) {
	md += `\n## ${row.name}\n`;
	for (const [file, pins] of [...row.byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		md += `\n### ${file}\n\n`;
		for (const pin of pins) {
			md += `- **${pin.title}**\n`;
			if (pin.gap) md += `  - GAP: ${pin.gap}\n`;
		}
	}
}

if (CHECK) {
	const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (current !== md) {
		console.error(
			'docs/binding-parity-gaps.md is stale — run `pnpm binding-parity:gaps` and commit the result.',
		);
		process.exit(1);
	}
	console.log(`binding parity-gap index is current (${total} pin(s)).`);
} else {
	writeFileSync(OUT, md);
	console.log(`wrote docs/binding-parity-gaps.md (${total} pin(s)).`);
}
