import fs from 'node:fs';
import path from 'node:path';
import { analyze } from './plugin.mjs';

const repo = path.resolve(import.meta.dirname, '../../..');
const examples = path.join(repo, 'examples');
const ignored = new Set(['node_modules', 'dist', 'build', '.git', '.vite', '.turbo']);
const files = [];
function walk(directory) {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory() && !ignored.has(entry.name)) walk(file);
		else if (entry.isFile() && entry.name.endsWith('.tsrx')) files.push(file);
	}
}
walk(examples);
files.sort();
const matchingFiles = files.filter((file) => analyze(fs.readFileSync(file, 'utf8'), file) !== null);
const exampleCount = new Set(files.map((file) => path.relative(examples, file).split(path.sep)[0]))
	.size;
console.log(
	JSON.stringify(
		{
			examples: exampleCount,
			tsrxFiles: files.length,
			syntaxMatches: matchingFiles.map((file) => path.relative(repo, file)),
			limitation:
				'Syntax matches are not proof of root lifetime, stream ownership, or safe removal.',
		},
		null,
		2,
	),
);
