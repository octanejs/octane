// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(import.meta.dirname, '..');
const repositoryRoot = resolve(packageRoot, '../..');
const rootExports = [
	'Block',
	'CodeBlock',
	'CodeBlockContainer',
	'CodeBlockCopyButton',
	'CodeBlockDownloadButton',
	'CodeBlockHeader',
	'CodeBlockSkeleton',
	'Streamdown',
	'StreamdownContext',
	'TableCopyDropdown',
	'TableDownloadButton',
	'TableDownloadDropdown',
	'createAnimatePlugin',
	'defaultRehypePlugins',
	'defaultRemarkPlugins',
	'defaultTranslations',
	'defaultUrlTransform',
	'detectTextDirection',
	'escapeMarkdownTableCell',
	'extractTableDataFromElement',
	'normalizeHtmlIndentation',
	'parseMarkdownIntoBlocks',
	'tableDataToCSV',
	'tableDataToMarkdown',
	'tableDataToTSV',
	'useIsCodeFenceIncomplete',
].sort();

type RuntimeExport = { browser: string; node: string; types: string; default: string };

describe('@octanejs/streamdown package build', { timeout: 40_000 }, () => {
	it('builds the public client, server, declarations, and styles from authored sources', () => {
		const scratchRoot = mkdtempSync(join(tmpdir(), 'octane-streamdown-build-'));
		const scratchPackage = join(scratchRoot, 'packages/streamdown');
		try {
			mkdirSync(scratchPackage, { recursive: true });
			// Start without dist or upstream snapshots so only this build can supply the artifacts.
			for (const path of ['src', 'scripts', 'package.json', 'styles.css']) {
				cpSync(join(packageRoot, path), join(scratchPackage, path), { recursive: true });
			}
			symlinkSync(
				join(repositoryRoot, 'packages/octane'),
				join(scratchRoot, 'packages/octane'),
				'dir',
			);
			symlinkSync(join(repositoryRoot, 'node_modules'), join(scratchRoot, 'node_modules'), 'dir');
			symlinkSync(join(packageRoot, 'node_modules'), join(scratchPackage, 'node_modules'), 'dir');

			const result = spawnSync(process.execPath, ['scripts/build.mjs'], {
				cwd: scratchPackage,
				encoding: 'utf8',
				timeout: 30_000,
			});
			const buildOutput = `${result.stdout}\n${result.stderr}`;
			expect(result.error, buildOutput).toBeUndefined();
			expect(result.status, buildOutput).toBe(0);

			const { exports: publicExports } = JSON.parse(
				readFileSync(join(scratchPackage, 'package.json'), 'utf8'),
			) as {
				exports: Record<string, RuntimeExport | string>;
			};
			for (const subpath of ['.', './code', './math', './mermaid', './cjk']) {
				const entry = publicExports[subpath];
				if (!entry || typeof entry === 'string')
					throw new Error(`Missing runtime export ${subpath}`);
				for (const condition of ['browser', 'node', 'types', 'default'] as const) {
					expect(
						readFileSync(resolve(scratchPackage, entry[condition]), 'utf8').length,
						`${subpath} ${condition}`,
					).toBeGreaterThan(0);
				}
			}
			const styles = publicExports['./styles.css'];
			if (typeof styles !== 'string') throw new Error('Missing styles export');
			expect(readFileSync(resolve(scratchPackage, styles), 'utf8')).toBe(
				readFileSync(join(packageRoot, 'styles.css'), 'utf8'),
			);

			const root = publicExports['.'] as RuntimeExport;
			for (const condition of ['browser', 'node'] as const) {
				const inspection = buildSync({
					entryPoints: [resolve(scratchPackage, root[condition])],
					format: 'esm',
					metafile: true,
					write: false,
				});
				expect(
					Object.values(inspection.metafile.outputs)
						.flatMap((output) => output.exports)
						.sort(),
					condition,
				).toEqual(rootExports);
			}
		} finally {
			rmSync(scratchRoot, { recursive: true, force: true });
		}
	});
});
