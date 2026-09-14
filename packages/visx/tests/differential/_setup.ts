import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';

const upstreamPackageRoot = dirname(
	realpathSync(join(import.meta.dirname, '../../node_modules/@visx/visx')),
);

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		[
			/from\s+["']@octanejs\/visx["']/g,
			`from ${JSON.stringify(join(upstreamPackageRoot, 'visx/esm/index.js'))}`,
		],
		[
			/from\s+["']@octanejs\/visx\/([^"']+)["']/g,
			(_match, subpath: string) =>
				`from ${JSON.stringify(join(upstreamPackageRoot, subpath, 'esm/index.js'))}`,
		],
	],
	fixtures: ['differential.tsrx'],
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
