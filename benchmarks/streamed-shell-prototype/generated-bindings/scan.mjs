import fs from 'node:fs';
import path from 'node:path';
import { analyze } from './proof.mjs';

const root = path.resolve(import.meta.dirname, '../../../examples');
const files = [];
function visit(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		if (['node_modules', 'dist', 'build', '.git', '.octane'].includes(entry.name)) continue;
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) visit(file);
		else if (entry.isFile() && file.endsWith('.tsrx')) files.push(file);
	}
}
visit(root);
const matches = files.filter((file) => analyze(fs.readFileSync(file, 'utf8'), file));
console.log(
	JSON.stringify(
		{ root, files: files.length, matches: matches.map((file) => path.relative(root, file)) },
		null,
		2,
	),
);
