import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKILLS = ['update-bindings', 'octane-react-library-port', 'react-library-port'];
const GENERATED_ROOTS = ['.agents', '.claude', '.cursor', '.gemini', '.github'];
const PACKAGE_SCRIPTS = JSON.parse(
	readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'),
).scripts;

function body(markdown) {
	return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\n/, '');
}

// RuleSync folds long descriptions; compare their value, not YAML formatting.
function description(markdown) {
	return /^description:\s*(.+(?:\n[ \t]+.+)*)$/m
		.exec(markdown)?.[1]
		.replace(/^>-?\s*/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function documents(directory, prefix = '') {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const relative = path.join(prefix, entry.name);
		return entry.isDirectory()
			? documents(path.join(directory, entry.name), relative)
			: entry.name.endsWith('.md')
				? [relative]
				: [];
	});
}

for (const name of SKILLS) {
	describe(`${name} skill distribution`, () => {
		const canonicalRoot = path.join(REPO_ROOT, '.rulesync/skills', name);

		test('provides discoverable skill metadata', () => {
			const skill = readFileSync(path.join(canonicalRoot, 'SKILL.md'), 'utf8');
			const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1];
			assert.ok(frontmatter, 'skill requires frontmatter');
			assert.equal(/^name:\s*(\S+)\s*$/m.exec(frontmatter)?.[1], name);
			assert.match(frontmatter, /^description:\s*\S.+$/m);
		});

		test('resolves local document links and documented package commands', () => {
			for (const relative of documents(canonicalRoot)) {
				const file = path.join(canonicalRoot, relative);
				const markdown = readFileSync(file, 'utf8');
				for (const [, target] of markdown.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
					if (/^(?:[a-z]+:|#)/i.test(target)) continue;
					const resolved = path.resolve(path.dirname(file), target.split('#')[0]);
					assert.ok(existsSync(resolved), `${file}: missing document ${target}`);
				}
				for (const [, command, firstArgument] of markdown.matchAll(
					/\bpnpm ([a-z][\w-]*:[\w:-]+)(?:[ \t]+([^\s`]+))?/g,
				)) {
					assert.ok(Object.hasOwn(PACKAGE_SCRIPTS, command), `${file}: unknown script ${command}`);
					assert.notEqual(firstArgument, '--', `${file}: pnpm scripts take arguments directly`);
				}
			}
		});

		test('distributes the complete canonical documents to every configured consumer', () => {
			const canonicalFiles = documents(canonicalRoot).sort();
			for (const consumer of GENERATED_ROOTS) {
				const generatedRoot = path.join(REPO_ROOT, consumer, 'skills', name);
				assert.ok(existsSync(generatedRoot), `${consumer}: missing generated ${name} skill`);
				assert.deepEqual(documents(generatedRoot).sort(), canonicalFiles, generatedRoot);
				for (const relative of canonicalFiles) {
					const canonical = readFileSync(path.join(canonicalRoot, relative), 'utf8');
					const generated = readFileSync(path.join(generatedRoot, relative), 'utf8');
					assert.equal(
						relative === 'SKILL.md' ? body(generated) : generated,
						relative === 'SKILL.md' ? body(canonical) : canonical,
						`${generatedRoot}: ${relative}`,
					);
					if (relative === 'SKILL.md') {
						assert.equal(/^name:\s*(\S+)\s*$/m.exec(generated)?.[1], name);
						assert.equal(description(generated), description(canonical));
					}
				}
			}
		});
	});
}

test('keeps resumable port campaign state outside tracked skill artifacts', () => {
	assert.match(readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8'), /^\.react-port-work\/$/m);
});
