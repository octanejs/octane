import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import TextareaAutosize from '../src/index.tsrx';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(packageRoot, 'package.json');
const rootPackagePath = resolve(packageRoot, '../../package.json');

describe('published package contract', function packageContract() {
	it('exports the TextareaAutosize default surface', function exportsDefault() {
		expect(typeof TextareaAutosize).toBe('function');
	});

	it('pins React/ReactDOM through the exact oracle catalog', async function pinsOracleCatalog() {
		const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
			devDependencies: Record<string, string>;
		};
		const rootManifest = JSON.parse(await readFile(rootPackagePath, 'utf8')) as {
			workspaces: { catalogs: Record<string, Record<string, string>> };
		};
		const oracle = rootManifest.workspaces.catalogs['react-textarea-autosize-react-oracle'];
		expect(manifest.devDependencies.react).toBe('catalog:react-textarea-autosize-react-oracle');
		expect(manifest.devDependencies['react-dom']).toBe(
			'catalog:react-textarea-autosize-react-oracle',
		);
		expect(manifest.devDependencies['@types/react']).toBe(
			'catalog:react-textarea-autosize-react-oracle',
		);
		expect(manifest.devDependencies['@types/react-dom']).toBe(
			'catalog:react-textarea-autosize-react-oracle',
		);
		expect(oracle).toEqual({
			react: '19.2.7',
			'react-dom': '19.2.7',
			'@types/react': '19.2.17',
			'@types/react-dom': '19.2.3',
		});
	});
});
