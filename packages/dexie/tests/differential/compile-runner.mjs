import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { compileFixture } from './fixture-compiler.mjs';

const [fixture, cache] = process.argv.slice(2);
if (!fixture || !cache) throw new Error('Usage: compile-runner.mjs FIXTURE CACHE');
if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
compileFixture(fixture, cache, {
	readFile: readFileSync,
	compile: compileToReact,
	transform: transformSync,
	writeFile: writeFileSync,
});
