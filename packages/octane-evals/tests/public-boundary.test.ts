import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePublicTaskManifestJsonl, parseRetiredTaskManifestJsonl } from '../src/jsonl.js';

const PACKAGE_PATH = 'packages/octane-evals';

function listPublicPackageFiles(): string[] {
	return execFileSync(
		'git',
		['ls-files', '--cached', '--others', '--exclude-standard', PACKAGE_PATH],
		{ encoding: 'utf8' },
	)
		.trim()
		.split('\n')
		.filter((path) => path.length > 0 && existsSync(path));
}

describe('public package boundary', () => {
	it('does not track active private evaluation artifacts', () => {
		const publicPackageFiles = listPublicPackageFiles();
		const trackedPrivateFiles = publicPackageFiles.filter((path) =>
			/(?:^|\/)(?:heldout|private|gold|hidden)(?:\/|$)/.test(path),
		);

		expect(trackedPrivateFiles).toEqual([]);
	});

	it('treats every task manifest JSONL row in the package as public', () => {
		const jsonlFiles = listPublicPackageFiles().filter((path) => path.endsWith('.jsonl'));

		for (const path of jsonlFiles) {
			const taskLines: string[] = [];
			for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
				if (line.trim().length === 0) continue;
				const record = JSON.parse(line) as Record<string, unknown>;
				if ('split' in record && 'taskId' in record) taskLines.push(line);
			}
			if (taskLines.length === 0) continue;
			const taskJsonl = `${taskLines.join('\n')}\n`;
			if (path.includes('/datasets/retired/')) parseRetiredTaskManifestJsonl(taskJsonl);
			else parsePublicTaskManifestJsonl(taskJsonl);
		}
	});
});
