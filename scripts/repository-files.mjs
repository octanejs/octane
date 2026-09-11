import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

// Fetched checkouts are data. Validate every ancestor before reading a file or
// directory, so a symlink cannot redirect metadata collection outside the root.
export function confinedRepositoryPath(repoRoot, relativePath, kind = 'file') {
	if (
		typeof relativePath !== 'string' ||
		path.isAbsolute(relativePath) ||
		relativePath.split(/[\\/]/).includes('..')
	) {
		throw new Error('Invalid repository-relative path');
	}
	const root = realpathSync(repoRoot);
	if (!statSync(root).isDirectory()) throw new Error('Repository root must be a directory');
	const parts = relativePath.split(path.sep).filter((part) => part && part !== '.');
	let resolved = root;
	for (const [index, part] of parts.entries()) {
		resolved = realpathSync(path.join(resolved, part));
		const suffix = path.relative(root, resolved);
		if (suffix === '..' || suffix.startsWith(`..${path.sep}`) || path.isAbsolute(suffix)) {
			throw new Error(`Repository path ${relativePath} escapes the checkout`);
		}
		const directory = index < parts.length - 1 || kind === 'directory';
		const stats = statSync(resolved);
		if (directory ? !stats.isDirectory() : !stats.isFile()) {
			throw new Error(
				`Repository path ${relativePath} must be a ${directory ? 'directory' : 'regular file'}`,
			);
		}
	}
	if (parts.length === 0 && kind !== 'directory') {
		throw new Error(`Repository path ${relativePath} must be a regular file`);
	}
	return resolved;
}

export function readRepositoryJson(repoRoot, relativePath) {
	const content = readFileSync(confinedRepositoryPath(repoRoot, relativePath), 'utf8');
	try {
		return JSON.parse(content);
	} catch {
		// JSON parser errors can include content excerpts from untrusted metadata.
		throw new Error(`Repository path ${relativePath} is not valid JSON`);
	}
}
