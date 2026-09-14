import {
	differentialSetup,
	type DifferentialPrecompileConfig,
} from '../../../../test-utils/differential-precompile.js';
import { DIFFERENTIAL_FIXTURE_FILENAMES } from './fixtures.js';

export const differentialConfig: DifferentialPrecompileConfig = {
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [[/from\s+["']@octanejs\/floating-ui["']/g, 'from "@floating-ui/react"']],
	fixtures: DIFFERENTIAL_FIXTURE_FILENAMES,
	depsFrom: import.meta.url,
};

export const { setup, teardown } = differentialSetup(differentialConfig);
