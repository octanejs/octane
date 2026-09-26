import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const repo = path.resolve(import.meta.dirname, '../../..');
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const excluded = new Set(['node_modules', 'dist', '.vercel', '.vite', '.octane']);

export function tree(root, skip = excluded) {
	const result = {};
	function visit(dir, relative = '') {
		for (const entry of fs
			.readdirSync(dir, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			if (skip.has(entry.name)) continue;
			const name = path.join(relative, entry.name);
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(file, name);
			else if (entry.isFile()) result[name] = digest(fs.readFileSync(file));
			else throw new Error(`Unexpected symlink in evidence tree: ${file}`);
		}
	}
	visit(root);
	return result;
}

export function inputs() {
	const paths = [
		'website-mcp',
		'website/src/content',
		'website/src/lib',
		'website/public',
		'docs',
		'packages/octane/src',
		'packages/app-core/src',
		'packages/vite-plugin-octane/src',
		'packages/adapter-vercel/src',
		'packages/octane-mcp-server/src',
		'packages/octane-mcp-server/skills',
	];
	const packageMetadata = {};
	for (const entry of fs.readdirSync(path.join(repo, 'packages'), { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		for (const name of ['package.json', 'status.json']) {
			const relative = path.join('packages', entry.name, name);
			const file = path.join(repo, relative);
			if (fs.existsSync(file)) packageMetadata[relative] = digest(fs.readFileSync(file));
		}
	}
	return {
		trees: Object.fromEntries(paths.map((name) => [name, tree(path.join(repo, name))])),
		packageMetadata,
		lock: digest(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
	};
}

export function experiment() {
	const own = Object.entries(tree(import.meta.dirname, new Set())).filter(([name]) =>
		name.endsWith('.mjs'),
	);
	const analysisDir = path.resolve(import.meta.dirname, '../static-document-analysis');
	const analysis = Object.entries(tree(analysisDir, new Set()))
		.filter(([name]) => name.endsWith('.mjs'))
		.map(([name, hash]) => [`../static-document-analysis/${name}`, hash]);
	return Object.fromEntries([...own, ...analysis]);
}
