import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { packPackage } from './pack-package.mjs';

const CHANGESETS_CLI = createRequire(import.meta.url).resolve('@changesets/cli/bin.js');

function changeset(args, cwd) {
	const result = spawnSync(process.execPath, [CHANGESETS_CLI, ...args], { cwd, stdio: 'inherit' });
	if (result.error) throw result.error;
	return result.status ?? 1;
}

function findWorkspaceDirectories(root) {
	const { workspaces } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const patterns = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);
	const directories = new Map();
	for (const pattern of patterns) {
		for (const manifestPath of globSync(path.posix.join(pattern, 'package.json'), { cwd: root })) {
			const { name } = JSON.parse(readFileSync(path.join(root, manifestPath), 'utf8'));
			if (name) directories.set(name, path.join(root, path.dirname(manifestPath)));
		}
	}
	return directories;
}

// Bun has no provenance support (oven-sh/bun#15601), so Bun packs and npm publishes the tarballs.
export function publishPackages(root = process.cwd()) {
	const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'octane-changesets-publish-'));
	try {
		const planPath = path.join(outputDirectory, 'publish-plan.json');
		const planStatus = changeset(['publish-plan', '--output', planPath], root);
		if (planStatus !== 0) return planStatus;
		const plan = JSON.parse(readFileSync(planPath, 'utf8'));
		const directories = findWorkspaceDirectories(root);
		const packagesDirectory = path.join(outputDirectory, 'packages');
		plan.plan = plan.plan.map((group) =>
			group.map((release) => {
				if (release.kind !== 'publish') return release;
				const directory = directories.get(release.name);
				if (!directory) throw new Error(`workspace package not found: ${release.name}`);
				const { archive, manifest } = packPackage(directory, packagesDirectory, { root });
				if (manifest.version !== release.version) {
					throw new Error(
						`${release.name} packed ${manifest.version}, expected ${release.version}`,
					);
				}
				const integrity = `sha256-${createHash('sha256').update(readFileSync(archive)).digest('base64')}`;
				return {
					...release,
					tarball: { path: path.posix.join('packages', path.basename(archive)), integrity },
				};
			}),
		);
		writeFileSync(planPath, JSON.stringify(plan, null, 2));
		return changeset(['publish', '--from-pack-dir', outputDirectory], root);
	} finally {
		rmSync(outputDirectory, { force: true, recursive: true });
	}
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(publishPackages());
