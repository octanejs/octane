import { access, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHANGESET_DIRECTORY = path.resolve('.changeset');
const PUBLISH_SUFFIX = '.publish-pending';

async function pathExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

function isPendingChangeset(entry) {
	return (
		entry.isFile() &&
		!entry.name.startsWith('.') &&
		entry.name.endsWith('.md') &&
		entry.name.toLowerCase() !== 'readme.md'
	);
}

export async function isolatePendingChangesets(directory = CHANGESET_DIRECTORY) {
	const entries = await readdir(directory, { withFileTypes: true });
	const changesets = entries.filter(isPendingChangeset).sort((left, right) => {
		return left.name.localeCompare(right.name);
	});

	for (const entry of changesets) {
		const source = path.join(directory, entry.name);
		const destination = path.join(directory, `.${entry.name}${PUBLISH_SUFFIX}`);
		if (await pathExists(destination)) {
			throw new Error(`refusing to overwrite isolated changeset ${destination}`);
		}
		await rename(source, destination);
	}

	return changesets.map((entry) => entry.name);
}

async function runCli() {
	const isolated = await isolatePendingChangesets();
	if (isolated.length === 0) {
		console.log('No pending changesets need isolation.');
		return;
	}
	console.log(
		`Isolated ${isolated.length} pending changeset(s) from the npm publish action:\n${isolated
			.map((file) => `  - ${file}`)
			.join('\n')}`,
	);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await runCli();
