import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { comparePaths, readmeDisagreements, readmePaths } from './generate-scaffold-manifest.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SPA_TREE = `<!-- scaffold:spa -->

\`\`\`
index.html
tsconfig.json
src/
  main.ts        mounts App into #root
  App.tsrx       the landing page
  server/api.ts  GET /api
\`\`\`

<!-- /scaffold:spa -->`;

describe('comparePaths', () => {
	test('puts a file before a directory at the level they share', () => {
		assert.deepEqual(
			['src/server/health.ts', 'src/App.tsrx', 'src/styles.css'].sort(comparePaths),
			['src/App.tsrx', 'src/styles.css', 'src/server/health.ts'],
		);
	});

	test('puts every root file before anything nested', () => {
		assert.deepEqual(['src/App.tsrx', 'vite.config.ts', '.prettierrc'].sort(comparePaths), [
			'.prettierrc',
			'vite.config.ts',
			'src/App.tsrx',
		]);
	});

	test('orders by code point, so the baseline does not depend on locale data', () => {
		assert.deepEqual(['b.ts', 'A.ts', 'a.ts'].sort(comparePaths), ['A.ts', 'a.ts', 'b.ts']);
	});
});

describe('readmePaths', () => {
	test('reads indentation as nesting and drops the notes', () => {
		assert.deepEqual(readmePaths(SPA_TREE, 'spa'), [
			'index.html',
			'tsconfig.json',
			'src/main.ts',
			'src/App.tsrx',
			'src/server/api.ts',
		]);
	});

	test('refuses a region it cannot find rather than reporting an empty tree', () => {
		assert.throws(
			() => readmePaths(SPA_TREE, 'fullstack'),
			/no <!-- scaffold:fullstack --> region/,
		);
	});
});

describe('readmeDisagreements', () => {
	test('agrees when the documented set matches, whatever order it is written in', () => {
		assert.deepEqual(
			readmeDisagreements(
				{
					spa: ['src/App.tsrx', 'index.html', 'src/main.ts', 'src/server/api.ts', 'tsconfig.json'],
				},
				SPA_TREE,
			),
			[],
		);
	});

	test('reports a file the template writes that the README never mentions', () => {
		const problems = readmeDisagreements({ spa: ['index.html', 'src/styles.css'] }, SPA_TREE);
		assert.ok(problems.includes('spa: src/styles.css is written but not documented'), problems);
	});

	// The case a new template lands in: MODES gains a mode before anyone writes
	// the region for it. Reported alongside everything else rather than thrown,
	// so one run still names every problem.
	test('reports a template the README has no region for', () => {
		const problems = readmeDisagreements({ spa: ['index.html'], lynx: ['index.html'] }, SPA_TREE);
		assert.ok(
			problems.some((problem) => problem.includes('lynx: README has no <!-- scaffold:lynx -->')),
			problems,
		);
	});

	test('reports a file the README still describes after the template stopped writing it', () => {
		const problems = readmeDisagreements({ spa: ['index.html'] }, SPA_TREE);
		assert.ok(problems.includes('spa: src/main.ts is documented but not written'), problems);
	});
});

// The generator runs this same comparison, so a `pnpm sync` cannot land a stale
// README. This repeats it against the committed files so that a README edited
// on its own — without regenerating anything — still fails here.
test('the published README describes exactly what the committed manifest lists', () => {
	const { templates } = JSON.parse(
		readFileSync(path.join(REPO, 'packages/cli/data/scaffold-manifest.json'), 'utf8'),
	);
	const readme = readFileSync(path.join(REPO, 'packages/create-octane/README.md'), 'utf8');
	assert.deepEqual(readmeDisagreements(templates, readme), []);
});
