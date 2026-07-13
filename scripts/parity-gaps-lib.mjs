import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx|tsrx)$/;

export function* walkTestFiles(root) {
	if (!existsSync(root)) return;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const file = path.join(root, entry.name);
		if (entry.isDirectory()) yield* walkTestFiles(file);
		else if (entry.isFile() && TEST_FILE.test(entry.name)) yield file;
	}
}

// Find executable Vitest failure pins. Both `it.fails` and `test.fails` are
// supported, including the common `.only`/`.concurrent` modifiers. Commented
// historical pins are deliberately ignored.
export function findFailsPins(source) {
	const pins = [];
	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trimStart();
		if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
			continue;
		}
		const match = trimmed.match(
			/^(?:it|test)(?:\.(?:only|concurrent|sequential))*\.fails(?:<[^>]*>)?\(\s*(.*)$/,
		);
		if (!match) continue;

		let rest = match[1];
		if (!rest) rest = (lines[i + 1] ?? '').trimStart();
		const title = rest.match(/^(['"`])((?:\\.|(?!\1).)*)\1/);
		let gap = null;
		for (let j = i - 1; j >= 0 && i - j <= 16; j--) {
			const comment = lines[j].trim();
			if (
				!comment.startsWith('//') &&
				!comment.startsWith('*') &&
				!comment.startsWith('/*') &&
				comment !== ''
			) {
				break;
			}
			const gapMatch = comment.match(/(?:\/\/|\*)\s*GAP:?\s*(.*)/);
			if (!gapMatch) continue;
			const parts = [gapMatch[1].trim()];
			for (let k = j + 1; k < i; k++) {
				const continuation = lines[k].trim().replace(/^(?:\/\/|\*|\/\*)\s?/, '');
				if (continuation) parts.push(continuation);
			}
			gap = parts.join(' ').trim();
			break;
		}

		pins.push({ line: i + 1, title: title ? title[2] : '<unparsed title>', gap });
	}
	return pins;
}

export function collectFailsPins(root, repoRoot) {
	const byFile = new Map();
	let total = 0;
	for (const file of walkTestFiles(root)) {
		const pins = findFailsPins(readFileSync(file, 'utf8'));
		if (!pins.length) continue;
		byFile.set(path.relative(repoRoot, file), pins);
		total += pins.length;
	}
	return { byFile, total };
}
