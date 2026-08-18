import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/pdf/audit/test-classifications.json';
const MANIFEST = 'packages/pdf/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-framework-contract',
]);
const DISCOVERY_ROOTS = ['packages/pdf/tests', 'packages/pdf/typetests'];

function discoverPortAuthoredTests(root) {
	const discovered = [];
	for (const discoveryRoot of DISCOVERY_ROOTS) {
		const absoluteRoot = resolve(root, discoveryRoot);
		if (!existsSync(absoluteRoot)) continue;
		for (const entry of readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const absolute = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = relative(root, absolute).split(sep).join('/');
			if (!/\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) continue;
			if (discoveryRoot.endsWith('/tests')) {
				if (!/\.test\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) continue;
			} else if (discoveryRoot.endsWith('/typetests')) {
				if (!/\.test\.(?:ts|tsx|tsrx)$/.test(entry.name)) continue;
			}
			discovered.push(portable);
		}
	}
	return discovered.sort();
}

export function verifyPdfTestClassifications(root) {
	const discovered = discoverPortAuthoredTests(root);
	const configPath = resolve(root, CONFIG);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
	const declared = config.tests
		.map(function pathOf(entry) {
			return entry.path;
		})
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error(
			'every port-authored pdf test must have exactly one classification\n' +
				`discovered=${JSON.stringify(discovered)}\n` +
				`declared=${JSON.stringify(declared)}`,
		);
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason)
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			if (entry.oracle)
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
		} else if (!entry.oracle) {
			throw new Error(
				`${entry.path}: React-parity evidence requires a React oracle or upstream citation`,
			);
		}
	}
	return { tests: discovered.length, divergences: manifest.divergences.length };
}
