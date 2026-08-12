import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const upstreamRoot = join(packageRoot, 'upstream');

export function verifyAlienSignalsUpstream(root = packageRoot) {
	const ledgerPath = join(root, 'upstream', 'SHA256SUMS');
	const ledger = readFileSync(ledgerPath, 'utf8');
	for (const line of ledger.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		const match = /^([a-f0-9]{64})\s+(.+)$/.exec(trimmed);
		if (match === null) {
			throw new Error(`invalid SHA256SUMS line: ${trimmed}`);
		}
		const [, expected, relativePath] = match;
		const absolutePath = join(root, 'upstream', relativePath);
		const actual = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
		if (actual !== expected) {
			throw new Error(`upstream integrity mismatch for ${relativePath}`);
		}
	}
	return join(root, 'upstream');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	verifyAlienSignalsUpstream();
	process.stdout.write(`Verified ${upstreamRoot}\n`);
}
