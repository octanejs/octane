import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, '_fixtures/basic.three.tsrx');
const cache = join(directory, '.react-cache');
const output = join(cache, 'basic.three.js');

function assertPinnedOracle(): void {
	const fiberPackage = JSON.parse(
		readFileSync(join(directory, '../node_modules/@react-three/fiber/package.json'), 'utf8'),
	) as { version?: string };
	const threePackage = JSON.parse(
		readFileSync(join(directory, '../node_modules/three/package.json'), 'utf8'),
	) as { version?: string };
	if (fiberPackage.version !== '9.6.1' || threePackage.version !== '0.172.0') {
		throw new Error(
			`Three differential oracle drifted: expected @react-three/fiber@9.6.1 with three@0.172.0, received ${fiberPackage.version ?? 'unknown'} with ${threePackage.version ?? 'unknown'}.`,
		);
	}
}

export async function setup(): Promise<void> {
	assertPinnedOracle();
	const source = readFileSync(fixture, 'utf8');
	const compiled = compileToReact(source, fixture);
	if (compiled.errors?.length) {
		throw new Error(`@tsrx/react could not compile ${fixture}: ${JSON.stringify(compiled.errors)}`);
	}
	const transformed = transformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: fixture,
	});
	mkdirSync(cache, { recursive: true });
	writeFileSync(output, transformed.code);
}
