import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

// Octane is beta (0.x): patch and minor releases are allowed for every package.
// A major bump is reserved for 1.0.
const CHANGESET_DIR = path.resolve('.changeset');

function parse_frontmatter(content) {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	return match?.[1] ?? '';
}

function parse_changeset_line(line) {
	const match = line.match(
		/^\s*(?:"([^"]+)"|'([^']+)'|([^:#][^:]*?))\s*:\s*["']?(major|minor)["']?\s*(?:#.*)?$/,
	);
	if (!match) return null;

	return {
		package_name: (match[1] ?? match[2] ?? match[3]).trim(),
		bump: match[4],
	};
}

const offenders = [];
const entries = await readdir(CHANGESET_DIR, { withFileTypes: true });

for (const entry of entries) {
	if (!entry.isFile() || !entry.name.endsWith('.md') || entry.name === 'README.md') continue;

	const file_path = path.join(CHANGESET_DIR, entry.name);
	const content = await readFile(file_path, 'utf8');
	const frontmatter = parse_frontmatter(content);

	for (const [index, line] of frontmatter.split(/\r?\n/).entries()) {
		const changeset = parse_changeset_line(line);
		if (changeset?.bump === 'major') {
			offenders.push({
				file: path.relative(process.cwd(), file_path),
				line: index + 2,
				...changeset,
			});
		}
	}
}

if (offenders.length > 0) {
	console.error('"major" changesets are not allowed before Octane 1.0.');
	console.error('Use "patch" or "minor" for release changesets.');
	console.error('');
	for (const offender of offenders) {
		console.error(`- ${offender.file}:${offender.line} ${offender.package_name}: ${offender.bump}`);
	}
	process.exit(1);
}
