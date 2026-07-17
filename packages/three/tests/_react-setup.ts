import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const cache = join(directory, '.react-cache');
const fixtures = [
	'basic.three',
	'events-differential.three',
	'portal-differential.three',
	'suspense-differential.three',
] as const;

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
	// Compatibility lanes intentionally select only Octane-owned behavior tests;
	// the differential oracle remains pinned to the exact r172 pair below.
	if (process.env.OCTANE_THREE_COMPAT_VERSION !== undefined) return;
	assertPinnedOracle();
	mkdirSync(cache, { recursive: true });
	for (const name of fixtures) {
		const fixture = join(directory, `_fixtures/${name}.tsrx`);
		const source = readFileSync(fixture, 'utf8');
		const compiled = compileToReact(source, fixture);
		if (compiled.errors?.length) {
			throw new Error(
				`@tsrx/react could not compile ${fixture}: ${JSON.stringify(compiled.errors)}`,
			);
		}
		const transformed = transformSync(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: fixture,
		});
		writeFileSync(join(cache, `${name}.js`), transformed.code);
	}
}
