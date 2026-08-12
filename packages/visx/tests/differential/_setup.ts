import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixture = join(currentDirectory, '../_fixtures/differential.tsrx');
const cacheDirectory = join(currentDirectory, '.react-cache');
const upstreamPackageRoot = dirname(
	realpathSync(join(currentDirectory, '../../node_modules/@visx/visx')),
);

function compileOne(sourcePath: string): void {
	compileFixture(sourcePath, cacheDirectory, upstreamPackageRoot, {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	compileOne(fixture);
}

export async function teardown(): Promise<void> {}
