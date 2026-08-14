import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditDir = dirname(fileURLToPath(import.meta.url));
const upstreamRoot = join(auditDir, '..', 'upstream');
const expectedCommit = 'd8ec8680a3b396c2c29082583ef10d28cc41baa8';
const expectedFiles = 41;
const expectedTreeHash = '371354b85332a88d2b2729a66d84c8406eaca16dceb45b83bb5fc06e7d988d3a';

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.name === 'COMMIT') continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else files.push(path);
	}
	return files;
}

const commit = (await readFile(join(upstreamRoot, 'COMMIT'), 'utf8')).trim();
if (commit !== expectedCommit) {
	throw new Error(`Virtua upstream commit mismatch: ${commit}`);
}

const files = (await walk(upstreamRoot)).sort();
if (files.length !== expectedFiles) {
	throw new Error(
		`Virtua upstream inventory mismatch: expected ${expectedFiles}, got ${files.length}`,
	);
}

const hash = createHash('sha256');
for (const file of files) {
	hash.update(relative(upstreamRoot, file));
	hash.update('\0');
	hash.update(await readFile(file));
	hash.update('\0');
}

const actualTreeHash = hash.digest('hex');
if (actualTreeHash !== expectedTreeHash) {
	throw new Error(`Virtua upstream tree hash mismatch: ${actualTreeHash}`);
}

console.log(`Verified ${files.length} Virtua 0.50.1 upstream files at ${commit}.`);
