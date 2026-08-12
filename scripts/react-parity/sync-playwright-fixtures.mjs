#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const scriptPath = fileURLToPath(import.meta.url);

function yamlScalar(value) {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function lockedImporterVersions(lockfile, importer) {
	const lines = lockfile.split(/\r?\n/u);
	const importersIndex = lines.findIndex((line) => line === 'importers:');
	if (importersIndex === -1) throw new Error('dependency source lockfile has no importers');
	const importerIndex = lines.findIndex(
		(line, index) => index > importersIndex && line === `  ${importer}:`,
	);
	if (importerIndex === -1) {
		throw new Error(`dependency source lockfile has no ${importer} importer`);
	}

	const versions = new Map();
	let dependencySection = false;
	let dependencyName;
	for (let index = importerIndex + 1; index < lines.length; index++) {
		const line = lines[index];
		if (/^  \S/u.test(line)) break;
		if (/^    (?:dependencies|devDependencies):$/u.test(line)) {
			dependencySection = true;
			dependencyName = undefined;
			continue;
		}
		if (/^    \S/u.test(line)) {
			dependencySection = false;
			dependencyName = undefined;
			continue;
		}
		if (!dependencySection) continue;
		const dependency = line.match(/^      (.+):$/u);
		if (dependency) {
			dependencyName = yamlScalar(dependency[1]);
			continue;
		}
		const version = line.match(/^        version: (.+)$/u);
		if (version && dependencyName) {
			versions.set(dependencyName, yamlScalar(version[1]).replace(/\(.+$/u, ''));
			dependencyName = undefined;
		}
	}
	return versions;
}

export function buildDependencyWorkspaceManifest(root, config) {
	const source = config.dependencySource;
	if (!source) return undefined;
	for (const key of ['manifest', 'lockfile', 'importer']) {
		if (typeof source[key] !== 'string' || source[key].length === 0) {
			throw new Error(`playwright-full dependencySource requires ${key}`);
		}
	}
	if (source.omit !== undefined && !Array.isArray(source.omit)) {
		throw new Error('playwright-full dependencySource omit must be an array');
	}

	const sourceManifest = JSON.parse(readFileSync(resolve(root, source.manifest), 'utf8'));
	const lockedVersions = lockedImporterVersions(
		readFileSync(resolve(root, source.lockfile), 'utf8'),
		source.importer,
	);
	const omitted = new Set(source.omit ?? []);
	const sourceDependencies = {
		...(sourceManifest.dependencies ?? {}),
		...(sourceManifest.devDependencies ?? {}),
	};
	const dependencies = {};
	for (const dependencyName of Object.keys(sourceDependencies).sort()) {
		if (omitted.has(dependencyName)) continue;
		if (dependencyName === config.packageName) {
			dependencies[dependencyName] = config.packageVersion;
			continue;
		}
		const version = lockedVersions.get(dependencyName);
		if (!version || version.startsWith('link:')) {
			throw new Error(`dependency source lockfile has no resolved ${dependencyName} version`);
		}
		dependencies[dependencyName] = version;
	}
	dependencies['@playwright/test'] = 'catalog:default';
	dependencies.playwright = 'catalog:default';

	return {
		name: `@octane-internal/react-parity-${basename(config.dependencyWorkspace)}`,
		private: true,
		type: 'module',
		octaneGeneratedBy: 'scripts/react-parity/sync-playwright-fixtures.mjs',
		dependencies: Object.fromEntries(
			Object.entries(dependencies).sort(([left], [right]) =>
				left < right ? -1 : left > right ? 1 : 0,
			),
		),
	};
}

export function syncDependencyWorkspace(root, config) {
	const generated = buildDependencyWorkspaceManifest(root, config);
	if (!generated) return false;
	const destination = resolve(root, config.dependencyWorkspace, 'package.json');
	writeFileSync(destination, `${JSON.stringify(generated, null, 2)}\n`);
	return true;
}

export function discoverGeneratedPlaywrightConfigs(root) {
	return readdirSync(resolve(root, 'packages'), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => `packages/${entry.name}/scripts/pristine-playwright.json`)
		.filter((path) => existsSync(resolve(root, path)))
		.map((path) => JSON.parse(readFileSync(resolve(root, path), 'utf8')))
		.filter((config) => config.dependencySource);
}

export function main(root = repoRoot) {
	let generated = 0;
	for (const config of discoverGeneratedPlaywrightConfigs(root)) {
		if (syncDependencyWorkspace(root, config)) generated++;
	}
	console.log(`Synchronized ${generated} generated Playwright dependency fixture(s).`);
}

if (resolve(process.argv[1] ?? '') === scriptPath) main();
