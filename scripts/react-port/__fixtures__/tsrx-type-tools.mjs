import { appendFileSync, existsSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Type evidence checks `.tsrx` through @tsrx/content-mapper and Octane's Volar
 * compiler, which a project resolves from its own directory, as a workspace
 * package does in the repository. Link both into a fixture workspace outside the
 * repository; a git fixture ignores the links through `.git/info/exclude`.
 */
export function linkTsrxTypeTools(workspaceRoot) {
	for (const [name, target] of [
		[
			'@tsrx/content-mapper',
			realpathSync(path.join(repositoryRoot, 'node_modules/@tsrx/content-mapper')),
		],
		['octane', path.join(repositoryRoot, 'packages/octane')],
	]) {
		const link = path.join(workspaceRoot, 'node_modules', name);
		mkdirSync(path.dirname(link), { recursive: true });
		symlinkSync(target, link, 'dir');
	}
	const exclude = path.join(workspaceRoot, '.git/info/exclude');
	if (existsSync(path.dirname(exclude))) appendFileSync(exclude, '/node_modules/\n');
}
