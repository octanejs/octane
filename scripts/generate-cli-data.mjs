// Snapshot the repository's own binding and error-code catalogs into a single
// JSON file that ships inside @octanejs/cli.
//
// The CLI runs against arbitrary user projects, so it cannot read this
// repository at runtime. Generating the snapshot from the same sources that
// produce docs/bindings-status.md keeps `octane bindings`, `octane add`, and
// `octane explain` from drifting into a hand-maintained second copy.
//
// Regenerate with `pnpm cli:data`; CI runs `pnpm cli:data:check`.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { KNOWN_BINDINGS } from '../packages/octane-mcp-server/src/bridge.js';
import { readEcosystemCatalogs } from './workspace-packages.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(REPO, 'packages/cli/src/data/octane-data.json');

/**
 * @param {string} file
 * @returns {any}
 */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function buildBindings() {
	const categories = new Map();
	for (const group of readEcosystemCatalogs().bindingCategories) {
		for (const binding of group.packages) categories.set(binding.packageName, group.title);
	}

	const bindings = [];
	for (const dir of readdirSync(path.join(REPO, 'packages')).sort()) {
		const base = path.join(REPO, 'packages', dir);
		let manifest;
		let status;
		try {
			manifest = readJson(path.join(base, 'package.json'));
			status = readJson(path.join(base, 'status.json'));
		} catch {
			continue;
		}
		if (manifest.private) continue;

		bindings.push({
			name: manifest.name,
			version: manifest.version,
			category: categories.get(manifest.name) ?? 'Uncategorized',
			upstream: status.upstream ?? null,
			surface: status.surface ?? '',
			divergences: status.divergences ?? [],
			ssr: status.ssr ?? '',
			verified: status.verified ?? null,
		});
	}
	return bindings;
}

function buildErrorCodes() {
	const catalog = readJson(path.join(REPO, 'packages/octane/error-codes/codes.json'));
	return Object.fromEntries(
		Object.entries(catalog.codes).map(([code, entry]) => [
			code,
			{ message: entry.message, runtime: entry.runtime, status: entry.status },
		]),
	);
}

const data = {
	bindings: buildBindings(),
	reactPackages: Object.fromEntries(
		Object.entries(KNOWN_BINDINGS).sort(([a], [b]) => a.localeCompare(b)),
	),
	errorCodes: buildErrorCodes(),
};

// Formatted through prettier, because generated baselines share the repo-wide
// `pnpm format:check` gate. Emitting hand-chosen indentation here would make the
// two gates contradict each other.
const serialized = await format(JSON.stringify(data), {
	...(await resolveConfig(OUTPUT)),
	filepath: OUTPUT,
});

if (process.argv.includes('--check')) {
	let current = '';
	try {
		current = readFileSync(OUTPUT, 'utf8');
	} catch {
		// Treated as a mismatch below.
	}
	if (current !== serialized) {
		console.error(`${path.relative(REPO, OUTPUT)} is out of date. Run \`pnpm cli:data\`.`);
		process.exit(1);
	}
	console.log(`${path.relative(REPO, OUTPUT)} is up to date.`);
} else {
	writeFileSync(OUTPUT, serialized);
	console.log(
		`Wrote ${path.relative(REPO, OUTPUT)}: ${data.bindings.length} bindings, ` +
			`${Object.keys(data.reactPackages).length} React packages, ` +
			`${Object.keys(data.errorCodes).length} error codes.`,
	);
}
