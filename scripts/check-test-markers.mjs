import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['packages', 'website', 'examples', 'benchmarks', 'playground'];
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]sx?|tsrx)$/;
const FORBIDDEN = [
	{
		pattern: /^\s*(?:it|test|describe)\.(?:skip|skipIf|runIf|todo|fails)\b/,
		label: 'test modifier',
	},
	{ pattern: /\bctx\.skip\s*\(/, label: 'runtime skip' },
];

function* walk(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== 'coverage') {
				yield* walk(absolute);
			}
		} else if (TEST_FILE.test(entry.name)) {
			yield absolute;
		}
	}
}

const violations = [];
for (const root of ROOTS) {
	for (const file of walk(path.join(REPO, root))) {
		const lines = readFileSync(file, 'utf8').split('\n');
		for (let index = 0; index < lines.length; index++) {
			const source = lines[index].trim();
			if (/^(?:\/\/|\/\*|\*)/.test(source)) continue;
			for (const { pattern, label } of FORBIDDEN) {
				if (pattern.test(source)) {
					violations.push({
						file: path.relative(REPO, file),
						line: index + 1,
						label,
						text: source,
					});
				}
			}
		}
	}
}

if (violations.length > 0) {
	console.error('Committed tests must execute without skip/todo/expected-failure modifiers:');
	for (const violation of violations) {
		console.error(`  ${violation.file}:${violation.line} (${violation.label}) ${violation.text}`);
	}
	console.error(
		'Fix genuine gaps before landing tests; assert intentional divergences as ordinary passing tests.',
	);
	process.exit(1);
}

console.log('test marker check passed (no skipped, todo, or expected-failure tests).');
