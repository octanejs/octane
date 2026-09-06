import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export function buildUpstreamCrosswalk(upstreamRoot, repoRoot) {
	const packageRoot = resolve(repoRoot, 'packages/base-ui');
	const lock = JSON.parse(readFileSync(join(packageRoot, 'audit/upstream.lock.json'), 'utf8'));
	const upstream = JSON.parse(readFileSync(join(upstreamRoot, 'package.json'), 'utf8'));
	const binding = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
	const portable = (path) => relative(repoRoot, path).split('\\').join('/');
	const surface = Object.keys(upstream.exports)
		.sort()
		.map((subpath) => {
			const exported = binding.exports[subpath];
			const source = typeof exported === 'string' ? exported : exported?.import;
			const target = typeof source === 'string' ? resolve(packageRoot, source) : null;
			const present = target !== null && existsSync(target);
			return [
				subpath,
				present ? 'surface-present-unverified' : 'gap',
				target === null ? 'Missing export' : portable(target),
			];
		});
	const upstreamArtifacts = lock.files
		.flatMap(({ path }) => {
			const kind = /\.spec\.tsx?$/.test(path)
				? 'type-test'
				: /\.test\.tsx?$/.test(path)
					? 'runtime-test'
					: path.startsWith('test/')
						? 'support'
						: null;
			if (kind === null) return [];
			const mapping = lock.adaptedMappings.find(
				({ fromRoot, include }) =>
					path.startsWith(`${fromRoot}/`) && (!include || new RegExp(include).test(path)),
			);
			const target =
				mapping === undefined
					? null
					: resolve(packageRoot, mapping.toRoot, path.slice(mapping.fromRoot.length + 1));
			return [
				[
					path,
					kind,
					target !== null && existsSync(target) ? 'adapted-unverified' : 'not-adapted',
					target === null ? null : portable(target),
				],
			];
		})
		.sort((a, b) => a[0].localeCompare(b[0]));
	return {
		schemaVersion: 2,
		provenance: {
			repository: 'https://github.com/mui/base-ui',
			package: lock.identity.packageName,
			version: lock.identity.version,
			commit: lock.identity.commit,
			lock: 'packages/base-ui/audit/upstream.lock.json',
			fingerprint: lock.fingerprint,
		},
		surface,
		upstreamArtifacts,
		summary: {
			exportEntries: surface.length,
			present: surface.filter((entry) => entry[1] === 'surface-present-unverified').length,
			gaps: surface.filter((entry) => entry[1] === 'gap').length,
			runtimeTestFiles: upstreamArtifacts.filter((entry) => entry[1] === 'runtime-test').length,
			typeTestFiles: upstreamArtifacts.filter((entry) => entry[1] === 'type-test').length,
			supportFiles: upstreamArtifacts.filter((entry) => entry[1] === 'support').length,
			adaptedFiles: upstreamArtifacts.filter((entry) => entry[2] === 'adapted-unverified').length,
		},
	};
}
