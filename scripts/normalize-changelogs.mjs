import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getWorkspacePackages } from './workspace-packages.mjs';

// Changesets indents multiline notes, including their blank separator lines.
// Remove only that empty-line whitespace; preserve Markdown hard line breaks,
// code indentation, and all other authored changelog content.
for (const pkg of getWorkspacePackages(process.cwd())) {
	const file = path.join(pkg.directory, 'CHANGELOG.md');
	let source;
	try {
		source = await readFile(file, 'utf8');
	} catch (error) {
		if (error.code === 'ENOENT') continue;
		throw error;
	}
	const normalized = source.replace(/^[\t ]+$/gm, '');
	if (normalized !== source) await writeFile(file, normalized);
}
