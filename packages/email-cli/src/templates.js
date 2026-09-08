import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** @param {string} directory */
export async function discoverTemplatePaths(directory) {
	/** @type {string[]} */
	const templates = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name === 'static' || entry.name === 'node_modules' || entry.name.startsWith('.'))
			continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) templates.push(...(await discoverTemplatePaths(path)));
		else if (entry.isFile() && extname(entry.name) === '.tsrx') templates.push(path);
	}
	return templates;
}

/** @param {string} path */
export async function isDirectory(path) {
	try {
		return (await stat(path)).isDirectory();
	} catch (error) {
		if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return false;
		throw error;
	}
}
