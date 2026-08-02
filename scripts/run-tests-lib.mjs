import { resolve } from 'node:path';

import { loadManifest } from './react-parity/harness-lib.mjs';
import { discoverParityManifestPaths } from './react-parity/receipts-lib.mjs';

const PORTED_LIBRARY_NAME = /^[a-z0-9][a-z0-9._-]*$/;

function addPortedLibraries(libraries, value) {
	if (!value || value.startsWith('-')) {
		throw new Error('--ported-libs requires a comma-separated package directory name');
	}
	for (const name of value.split(',')) {
		if (!PORTED_LIBRARY_NAME.test(name)) {
			throw new Error(`invalid --ported-libs package directory: ${JSON.stringify(name)}`);
		}
		libraries.add(name);
	}
}

export function selectedPortedLibraries(args) {
	const libraries = new Set();
	for (let index = 0; index < args.length; index++) {
		const value = args[index];
		if (value === '--ported-libs') {
			addPortedLibraries(libraries, args[index + 1]);
			index++;
			continue;
		}
		const selection = value.match(/^--ported-libs=(.*)$/)?.[1];
		if (selection !== undefined) addPortedLibraries(libraries, selection);
	}
	return libraries;
}

export function vitestArgumentsForTestSelection(args) {
	const libraries = selectedPortedLibraries(args);
	const vitestArgs = [];
	for (let index = 0; index < args.length; index++) {
		if (args[index] === '--ported-libs') {
			index++;
			continue;
		}
		if (args[index].startsWith('--ported-libs=')) continue;
		vitestArgs.push(args[index]);
	}
	for (const library of libraries) vitestArgs.push(`packages/${library}`);
	return vitestArgs;
}

export function selectedTestProjects(args) {
	const projects = new Set();
	for (let index = 0; index < args.length; index++) {
		const value = args[index];
		const project = value === '--project' ? args[index + 1] : value.match(/^--project=(.+)$/)?.[1];
		if (project && !project.startsWith('!')) projects.add(project);
	}
	return projects;
}

export function selectedPackageRoots(args) {
	const packages = new Set();
	for (const value of args) {
		const portable = value.replaceAll('\\', '/');
		const match = /(?:^|\/)packages\/([^/]+)(?:\/|$)/.exec(portable);
		if (match) packages.add(`packages/${match[1]}`);
	}
	return packages;
}

export async function parityManifestsForTestSelection({
	root,
	args,
	discover = discoverParityManifestPaths,
	load = loadManifest,
}) {
	const manifestPaths = await discover(root);
	const projects = selectedTestProjects(args);
	const packageRoots = selectedPackageRoots(args);
	const portedLibraries = selectedPortedLibraries(args);
	for (const library of portedLibraries) packageRoots.add(`packages/${library}`);
	if (projects.size === 0 && packageRoots.size === 0) return manifestPaths;
	const manifestPackageRoots = new Set(
		manifestPaths.map((manifestPath) => manifestPath.split('/').slice(0, 2).join('/')),
	);
	const missingLibraries = [...portedLibraries].filter(
		(library) => !manifestPackageRoots.has(`packages/${library}`),
	);
	if (missingLibraries.length > 0) {
		throw new Error(
			`ported libraries have no React parity manifest: ${missingLibraries.join(', ')}`,
		);
	}

	const selected = [];
	for (const manifestPath of manifestPaths) {
		const packageRoot = manifestPath.split('/').slice(0, 2).join('/');
		if (packageRoots.has(packageRoot)) {
			selected.push(manifestPath);
			continue;
		}
		if (projects.size === 0) continue;
		const manifest = await load(resolve(root, manifestPath));
		if (manifest.lanes.some((lane) => projects.has(lane.project))) selected.push(manifestPath);
	}
	return selected;
}
