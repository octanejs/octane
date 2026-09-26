import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const excluded = new Set([
	'node_modules',
	'dist',
	'.vite',
	'.octane',
	'source-manifest.json',
]);
export const keep = (file) => !excluded.has(path.basename(file));
export const digest = (data) => createHash('sha256').update(data).digest('hex');

export function tree(root, ignored = excluded) {
	const result = {};
	function visit(directory, relative = '') {
		for (const entry of fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			if (ignored.has(entry.name)) continue;
			const file = path.join(directory, entry.name);
			const name = path.join(relative, entry.name);
			if (entry.isDirectory()) visit(file, name);
			else if (entry.isFile()) result[name] = digest(fs.readFileSync(file));
			else throw new Error(`Unexpected symlink: ${file}`);
		}
	}
	visit(root);
	return result;
}

export function toolchain(repo) {
	const paths = [
		'packages/octane/src',
		'packages/app-core/src',
		'packages/vite-plugin-octane/src',
		'benchmarks/streamed-shell-prototype/signal-chat-route',
	];
	return Object.fromEntries([
		...paths.map((name) => [name, tree(path.join(repo, name))]),
		[
			'benchmarks/streamed-shell-prototype/automatic/plugin.mjs',
			digest(
				fs.readFileSync(
					path.join(repo, 'benchmarks/streamed-shell-prototype/automatic/plugin.mjs'),
				),
			),
		],
		['pnpm-lock.yaml', digest(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml')))],
	]);
}
