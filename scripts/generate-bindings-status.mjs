import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Generates docs/bindings-status.md — the central status table for the
// @octanejs/* framework bindings. The per-package data lives in a small
// machine-readable packages/<name>/status.json next to each binding's
// package.json; this script merges those with the package.json name/version
// and renders one table so repo-level prose never has to guess at (or
// over-group) the very different maturity levels of the fourteen bindings.
//
//   node scripts/generate-bindings-status.mjs           # (re)write the table
//   node scripts/generate-bindings-status.mjs --check   # exit 1 if stale
//
// Wired as `pnpm bindings:status` / `pnpm bindings:status:check` (the latter
// runs in CI, like parity:gaps:check) — changing a binding's scope means
// updating its status.json and regenerating in the same change.
//
// status.json schema (all strings are plain markdown):
//   upstream.package   the React library this package ports (npm name)
//   upstream.version   the upstream version the port tracks
//   surface            one-liner: what is implemented vs not
//   divergences        string[] of intentional API/behavior differences ([]
//                      allowed)
//   ssr                one-liner: SSR/hydration support status
//   verified           YYYY-MM-DD of the last parity verification (an audit,
//                      differential run, or full-suite pass against the pinned
//                      upstream version — bump it when re-verifying or when
//                      the scope changes)
//   notes              optional string[] rendered as bullets in the package's
//                      detail section
//   docs               optional string[] of repo-relative paths to deeper
//                      status/plan docs

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(REPO, 'packages');
const OUT = path.join(REPO, 'docs/bindings-status.md');
const CHECK = process.argv.includes('--check');

// @octanejs/* packages that are NOT React-library bindings and therefore do
// not carry a status.json. Any other @octanejs/* package (including future
// bindings) MUST have one — that's what keeps this table complete.
const NON_BINDINGS = new Set([
	'@octanejs/vite-plugin',
	'@octanejs/adapter-vercel',
	'@octanejs/mcp-server',
]);

const errors = [];
const rows = [];

for (const dir of readdirSync(PACKAGES).sort()) {
	const pkgPath = path.join(PACKAGES, dir, 'package.json');
	if (!existsSync(pkgPath)) continue;
	const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
	if (!pkg.name?.startsWith('@octanejs/') || NON_BINDINGS.has(pkg.name)) continue;

	const statusPath = path.join(PACKAGES, dir, 'status.json');
	if (!existsSync(statusPath)) {
		errors.push(`packages/${dir} (${pkg.name}) is a binding but has no status.json`);
		continue;
	}
	let status;
	try {
		status = JSON.parse(readFileSync(statusPath, 'utf8'));
	} catch (e) {
		errors.push(`packages/${dir}/status.json is not valid JSON: ${e.message}`);
		continue;
	}

	for (const field of ['upstream', 'surface', 'divergences', 'ssr', 'verified']) {
		if (status[field] == null) errors.push(`packages/${dir}/status.json is missing "${field}"`);
	}
	if (status.upstream && (!status.upstream.package || !status.upstream.version))
		errors.push(`packages/${dir}/status.json "upstream" needs { package, version }`);
	if (status.divergences && !Array.isArray(status.divergences))
		errors.push(`packages/${dir}/status.json "divergences" must be an array`);
	if (status.verified && !/^\d{4}-\d{2}-\d{2}$/.test(status.verified))
		errors.push(`packages/${dir}/status.json "verified" must be YYYY-MM-DD`);
	for (const doc of status.docs ?? []) {
		if (!existsSync(path.join(REPO, doc)))
			errors.push(`packages/${dir}/status.json "docs" entry does not exist: ${doc}`);
	}

	rows.push({ dir, pkg, status });
}

if (errors.length) {
	console.error('bindings-status: invalid input\n  - ' + errors.join('\n  - '));
	process.exit(1);
}

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const anchor = (name) => name.replace(/[^a-z0-9-]+/g, '');
const upstreamLabel = ({ package: name, version }) =>
	version === 'unpinned' ? `\`${name}\` (unpinned)` : `\`${name}@${version}\``;

let md = `# @octanejs/\\* bindings status (generated)

<!-- GENERATED FILE — do not edit. Edit packages/<name>/status.json and
     regenerate with \`pnpm bindings:status\`. -->

The central status table for the fourteen \`@octanejs/*\` framework bindings.
Each row is sourced from that package's \`packages/<name>/status.json\` — the
machine-readable status block maintained next to the code it describes — merged
with the version in its \`package.json\`. CI runs \`pnpm bindings:status:check\`,
so a scope change that isn't reflected here fails the build.

The bindings deliberately sit at different maturity levels: some are
behaviorally complete ports verified differentially against the real React
library, others are thin bindings over a framework-agnostic core, and some are
explicitly partial or alpha. "Verified" is the date of the last parity
verification (audit, differential run, or full-suite pass) against the pinned
upstream version.

| Package | Ports | Supported surface | Known divergences | SSR / hydration | Verified |
| --- | --- | --- | --- | --- | --- |
`;

for (const { dir, pkg, status } of rows) {
	const divergences = status.divergences.length
		? status.divergences.map((d) => cell(d).replace(/\.$/, '')).join('; ')
		: 'none known';
	md += `| [\`${pkg.name}\`](#${anchor(pkg.name)}) | ${upstreamLabel(status.upstream)} | ${cell(status.surface)} | ${divergences} | ${cell(status.ssr)} | ${status.verified} |\n`;
}

for (const { dir, pkg, status } of rows) {
	md += `\n## ${pkg.name}\n\n`;
	md += `[\`packages/${dir}\`](../packages/${dir}) \`${pkg.version}\` — ports ${upstreamLabel(status.upstream)}. `;
	md += `Status data: [\`packages/${dir}/status.json\`](../packages/${dir}/status.json).\n\n`;
	md += `${status.surface}\n\n`;
	if (status.divergences.length) {
		md += `Known divergences:\n\n`;
		for (const d of status.divergences) md += `- ${d}\n`;
		md += `\n`;
	}
	md += `SSR / hydration: ${status.ssr}\n`;
	if (status.notes?.length) {
		md += `\n`;
		for (const n of status.notes) md += `- ${n}\n`;
	}
	if (status.docs?.length) {
		md += `\nSee also: ${status.docs.map((d) => `[\`${d}\`](${path.relative('docs', d)})`).join(', ')}\n`;
	}
}

if (CHECK) {
	const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
	if (current !== md) {
		console.error(
			'docs/bindings-status.md is stale — a status.json or binding package changed.\n' +
				'Run `pnpm bindings:status` and commit the result.',
		);
		process.exit(1);
	}
	console.log(`bindings-status table is current (${rows.length} binding(s)).`);
} else {
	writeFileSync(OUT, md);
	console.log(`wrote docs/bindings-status.md (${rows.length} binding(s)).`);
}
