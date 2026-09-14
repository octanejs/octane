import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.ts';

const [fixture, cache] = process.argv.slice(2);
if (!fixture || !cache) throw new Error('Usage: compile-runner.mjs FIXTURE CACHE');
if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
compileReactFixture(fixture, {
	fixtureDir: dirname(fixture),
	cacheDir: cache,
	rewrites: [[/from\s+["']@octanejs\/floating-ui["']/g, 'from "@floating-ui/react"']],
	fixtures: 'all',
	deps: { compile: compileToReact, transform: transformSync },
});
