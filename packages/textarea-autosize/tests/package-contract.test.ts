import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import TextareaAutosize from '../src/index.tsrx';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagePath = resolve(packageRoot, 'package.json');
const workspacePath = resolve(packageRoot, '../../pnpm-workspace.yaml');

describe('published package contract', function packageContract() {
	it('exports the TextareaAutosize default surface', function exportsDefault() {
		expect(typeof TextareaAutosize).toBe('function');
	});

	it('pins React/ReactDOM through the exact oracle catalog', async function pinsOracleCatalog() {
		const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as {
			devDependencies: Record<string, string>;
		};
		const workspace = await readFile(workspacePath, 'utf8');
		const oracleBlock = workspace.match(/react-textarea-autosize-react-oracle:\n(?: {4}.+\n)+/);
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
		expect(oracleBlock).not.toBeNull();
		expect(oracleBlock![0]).toMatch(/react: 19\.2\.7/);
		expect(oracleBlock![0]).toMatch(/react-dom: 19\.2\.7/);
		expect(oracleBlock![0]).toMatch(/'@types\/react': 19\.2\.17/);
		expect(oracleBlock![0]).toMatch(/'@types\/react-dom': 19\.2\.3/);
		expect(oracleBlock![0]).not.toMatch(/react: \^/);
		expect(oracleBlock![0]).not.toMatch(/react-dom: \^/);
		expect(oracleBlock![0]).not.toMatch(/'@types\/react': \^/);
		expect(oracleBlock![0]).not.toMatch(/'@types\/react-dom': \^/);
	});
});
