import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const DISPOSITIONS = new Set([
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'octane-only-audit-contract',
]);

function discoverAuthoredTests(root) {
	const roots = [
		resolve(root, 'packages/tanstack-devtools/tests'),
		resolve(root, 'packages/tanstack-devtools/audit/type-probes'),
		resolve(root, 'packages/tanstack-devtools/typetests'),
		resolve(root, 'scripts/react-parity'),
	];
	const found = [];
	for (const dir of roots) {
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const absolute = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = relative(root, absolute).split(sep).join('/');
			if (dir.endsWith(`${sep}react-parity`) || portable.includes('/scripts/react-parity/')) {
				if (!/^tanstack-devtools.*\.test\.mjs$/.test(entry.name)) continue;
			} else if (!/\.(?:test|test-d)\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) {
				continue;
			}
			if (portable.includes('/typetests/pristine/') || portable.includes('/typetests/adapted/'))
				continue;
			found.push(portable);
		}
	}
	return found.sort();
}

export function verifyTanstackDevtoolsTestClassifications(root) {
	const manifest = JSON.parse(
		readFileSync(resolve(root, 'packages/tanstack-devtools/audit/react-parity.json'), 'utf8'),
	);
	const config = JSON.parse(
		readFileSync(
			resolve(root, 'packages/tanstack-devtools/audit/test-classifications.json'),
			'utf8',
		),
	);
	const discovered = discoverAuthoredTests(root);
	const declared = config.tests.map((entry) => entry.path).sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error('every port-authored tanstack-devtools test must have one classification');
	}
	const divergenceIds = new Set(manifest.divergences.map((entry) => entry.id));
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`${entry.path}: unknown disposition`);
		}
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason) throw new Error(`${entry.path}: Octane-only tests require a reason`);
			if (entry.oracle !== undefined) throw new Error(`${entry.path}: must not claim React parity`);
		} else if (!entry.oracle) {
			throw new Error(`${entry.path}: React-parity evidence requires an oracle`);
		}
		if (entry.disposition === 'octane-only-divergence') {
			const ids = entry.divergenceIds ?? [entry.divergenceId].filter(Boolean);
			if (!ids.length) throw new Error(`${entry.path}: divergence tests require a manifest id`);
			for (const id of ids) {
				if (!divergenceIds.has(id)) throw new Error(`${entry.path}: unknown divergence ${id}`);
			}
		}
	}
	return { tests: discovered.length };
}
