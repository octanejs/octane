import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

import {
	collectTypecheckProjects,
	findSourcePublicationViolations,
	parseJsonc,
	partitionAgainstDebt,
	RULES,
	SOURCE_PUBLICATION_DEBT,
} from './check-source-publication.mjs';

function writeJson(file, value) {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Build a miniature workspace: a root manifest holding the typecheck chain and
 * one source-published package.
 */
function createRepository({ rootScripts, manifest, tsconfigs, sources }) {
	const repo = mkdtempSync(path.join(tmpdir(), 'source-publication-'));
	writeJson(path.join(repo, 'package.json'), { name: 'root', scripts: rootScripts });
	const directory = path.join(repo, 'packages/demo');
	writeJson(path.join(directory, 'package.json'), { name: '@demo/binding', ...manifest });
	for (const [relative, config] of Object.entries(tsconfigs)) {
		writeJson(path.join(directory, relative), config);
	}
	for (const [relative, contents] of Object.entries(sources)) {
		const file = path.join(directory, 'src', relative);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, contents);
	}
	const packages = [
		{
			dir: 'demo',
			directory,
			name: '@demo/binding',
			manifest: { name: '@demo/binding', ...manifest },
		},
	];
	return { repo, packages };
}

const shippedTsrx = {
	manifest: { files: ['src'] },
	sources: { 'index.tsrx': 'export const a = 1;\n' },
};

/** The consumer flags a validation project must enable for shipped `.ts`/`.tsrx`. */
const unusedFlags = { noUnusedLocals: true, noUnusedParameters: true };

function rulesAndIds(violations) {
	return violations.map(({ rule, id }) => [rule, id]);
}

test('every -p of one octane-tsc call reaches the chain, not only the first', () => {
	const batched = createRepository({
		...shippedTsrx,
		rootScripts: {
			typecheck:
				'octane-tsc -p packages/demo/tsconfig.json -p packages/demo/tsconfig.tests.json && tsc --noEmit -p packages/demo/tsconfig.tests.json',
		},
		tsconfigs: {
			'tsconfig.json': { include: ['src'] },
			'tsconfig.tests.json': { include: ['src'] },
		},
	});
	const directory = path.join(batched.repo, 'packages/demo');
	assert.deepEqual(
		[...collectTypecheckProjects(batched.repo, batched.packages)].map(([project, checkers]) => [
			path.relative(directory, project),
			[...checkers].sort(),
		]),
		[
			['tsconfig.json', ['octane-tsc']],
			['tsconfig.tests.json', ['octane-tsc', 'tsc']],
		],
	);
});

test('delegated package scripts cannot hide a project from the chain', () => {
	const delegated = createRepository({
		...shippedTsrx,
		rootScripts: { typecheck: 'pnpm --dir packages/demo typecheck' },
		tsconfigs: { 'tsconfig.json': { include: ['src'] } },
	});
	writeJson(path.join(delegated.repo, 'packages/demo/package.json'), {
		name: '@demo/binding',
		files: ['src'],
		scripts: { typecheck: 'tsc --noEmit -p tsconfig.json' },
	});

	assert.deepEqual(
		[...collectTypecheckProjects(delegated.repo, delegated.packages)].map(([project, checkers]) => [
			path.relative(delegated.repo, project),
			[...checkers],
		]),
		[[path.join('packages/demo', 'tsconfig.json'), ['tsc']]],
	);
});

test('the validation project may not pin Node types a consumer does not install', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } } },
		sources: { 'index.ts': 'export const a = 1;\n' },
	});

	assert.deepEqual(rulesAndIds(findSourcePublicationViolations(repo, packages)), [
		[RULES.nodeTypes, 'packages/demo/tsconfig.json'],
	]);
});

test('Node tooling may validate with Node types while its public JS still needs declarations', () => {
	const { repo, packages } = createRepository({
		rootScripts: {},
		manifest: { files: ['src'], exports: { '.': './src/cli.js', './features/*': './src/*.mjs' } },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } } },
		sources: { 'cli.js': '', 'nested/feature.mjs': '', 'private.js': '' },
	});
	const [pkg] = packages;
	pkg.role = 'developer tooling';
	const audit = () => rulesAndIds(findSourcePublicationViolations(repo, packages));
	assert.deepEqual(audit(), [[RULES.untypedJavaScript, pkg.name]]);
	writeFileSync(path.join(pkg.directory, 'src/cli.d.ts'), 'export declare const cli: string;');
	writeFileSync(
		path.join(pkg.directory, 'src/nested/feature.d.mts'),
		'export declare const feature: string;',
	);
	assert.deepEqual(audit(), []);
});

test('a later types condition supplies missing siblings but does not override an earlier declaration', () => {
	const { repo, packages } = createRepository({
		rootScripts: {},
		manifest: {
			type: 'module',
			files: ['src'],
			exports: { '.': { default: './src/cli.js', types: './src/public.d.ts' } },
		},
		tsconfigs: {},
		sources: { 'cli.js': '', 'public.d.ts': 'export declare const run: string;', 'private.js': '' },
	});
	const [pkg] = packages;
	pkg.role = 'developer tooling';
	const audit = () => rulesAndIds(findSourcePublicationViolations(repo, packages));
	assert.deepEqual(audit(), []);
	writeFileSync(path.join(pkg.directory, 'src/cli.d.ts'), "export * from './private.js';");
	assert.deepEqual(audit(), [[RULES.untypedJavaScript, pkg.name]]);
});

test('a JS integration with a typed entry still guards new untyped or browser source exports', () => {
	const { repo, packages } = createRepository({
		rootScripts: {},
		manifest: {
			files: ['src', 'types'],
			exports: { '.': { types: './types/index.d.ts', import: './src/build.js' } },
		},
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } } },
		sources: { 'build.js': '', 'private.js': '', 'widget.js': '' },
	});
	const [pkg] = packages;
	pkg.role = 'framework integration';
	const audit = () => {
		writeJson(path.join(pkg.directory, 'package.json'), pkg.manifest);
		return rulesAndIds(findSourcePublicationViolations(repo, packages));
	};
	mkdirSync(path.join(pkg.directory, 'types'));
	writeFileSync(
		path.join(pkg.directory, 'types/index.d.ts'),
		'export declare const build: string;',
	);
	assert.deepEqual(audit(), []);
	writeFileSync(path.join(pkg.directory, 'types/index.d.ts'), "export * from '../src/private.js';");
	assert.deepEqual(audit(), [[RULES.untypedJavaScript, pkg.name]]);
	writeFileSync(
		path.join(pkg.directory, 'src/private.d.ts'),
		'export declare const helper: string;',
	);
	assert.deepEqual(audit(), []);
	writeFileSync(
		path.join(pkg.directory, 'types/index.d.ts'),
		'/// <reference path="helper.d.ts" />',
	);
	assert.deepEqual(audit(), [[RULES.untypedJavaScript, pkg.name]]);
	writeFileSync(
		path.join(pkg.directory, 'types/helper.d.ts'),
		'export declare const helper: string;',
	);
	assert.deepEqual(audit(), []);
	pkg.manifest.exports['./widget'] = { browser: './src/widget.js' };
	assert.deepEqual(audit(), [[RULES.untypedJavaScript, pkg.name]]);
	delete pkg.manifest.exports['./widget'];
	writeFileSync(
		path.join(pkg.directory, 'src/browser.ts'),
		"export { widget } from './widget.js';",
	);
	pkg.manifest.exports['./browser'] = './src/browser.ts';
	assert.deepEqual(audit(), [
		[RULES.nodeTypes, 'packages/demo/tsconfig.json'],
		[RULES.untypedJavaScript, pkg.name],
	]);
});

test('strict Node consumers get typed CLI, codemod and MCP APIs through package exports', () => {
	const require = createRequire(import.meta.url);
	const consumer = mkdtempSync(path.join(tmpdir(), 'tooling-consumer-'));
	const modules = path.join(consumer, 'node_modules');
	mkdirSync(path.join(modules, '@octanejs'), { recursive: true });
	for (const [name, dir] of [
		['cli', 'cli'],
		['codemod', 'codemod'],
		['mcp-server', 'octane-mcp-server'],
	]) {
		symlinkSync(
			path.resolve(import.meta.dirname, '../packages', dir),
			path.join(modules, '@octanejs', name),
			'dir',
		);
	}
	mkdirSync(path.join(modules, '@types'));
	symlinkSync(
		path.dirname(require.resolve('@types/node/package.json')),
		path.join(modules, '@types/node'),
		'dir',
	);
	writeFileSync(
		path.join(consumer, 'index.mts'),
		`
		import { main, defineCommand } from '@octanejs/cli';
		import { searchBindings } from '@octanejs/cli/data';
		import { applyFixes } from '@octanejs/cli/fix';
		import { runCodemod } from '@octanejs/codemod';
		import { createServer, issueContext } from '@octanejs/mcp-server';
		import { scanSource } from '@octanejs/mcp-server/bridge';
		import { explainStrong } from '@octanejs/mcp-server/strong';

		const exitCode: number = await main(['--version']);
		defineCommand({ async run(ctx, input) { ctx.ui.log(input.positionals.join(' ')); return exitCode; } });
		searchBindings('router')[0].name.toUpperCase();
		applyFixes('abc', [{ code: 'a', edits: [{ start: 1, end: 2, text: 'B' }] }]).text.toUpperCase();
		const result = await runCodemod(['src'], { target: 'tsrx', write: false });
		result.files[0].diagnostics[0].message.toUpperCase();
		createServer({ repoRoot: '.' }).close();
		const issue = await issueContext('.', { issue: 123 });
		// @ts-expect-error successful lookups do not expose subprocess output
		issue.stdout.toUpperCase();
		if ('triage' in issue) issue.triage.labels.join(', ');
		else issue.stderr.toUpperCase();
		scanSource('useState').apis.get('useState')?.toFixed();
		explainStrong({ recipe: 'lazy-ref' }).text.toUpperCase();
		// @ts-expect-error main takes an argv array
		main('--version');
		// @ts-expect-error unknown command flag kind
		defineCommand({ flags: { size: { type: 'array', description: 'size' } } });
		// @ts-expect-error programmatic codemod targets are checked
		runCodemod(['src'], { target: 'jsx' });
		// @ts-expect-error the compiler diagnostics are structured
		result.files[0].diagnostics[0].nonexistent;
	`,
	);
	writeJson(path.join(consumer, 'tsconfig.json'), {
		compilerOptions: {
			strict: true,
			noEmit: true,
			module: 'NodeNext',
			target: 'ES2022',
			types: ['node'],
		},
		files: ['index.mts'],
	});
	execFileSync(
		process.execPath,
		[require.resolve('typescript/bin/tsc'), '-p', consumer, '--pretty', 'false'],
		{ stdio: 'inherit' },
	);
});

test('a validation project the typecheck chain never reaches is still checked', () => {
	// A package the chain never names still ships source a consumer compiles.
	const absent = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/octane/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } } },
		sources: { 'index.ts': 'export const a = 1;\n' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(absent.repo, absent.packages).map(({ rule, id }) => [rule, id]),
		[[RULES.nodeTypes, 'packages/demo/tsconfig.json']],
	);

	// Nor may a package escape by running its project through a wrapper no
	// command parser can follow.
	const wrapped = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'pnpm --dir packages/demo typecheck' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } } },
		sources: { 'index.ts': 'export const a = 1;\n' },
	});
	writeJson(path.join(wrapped.repo, 'packages/demo/package.json'), {
		name: '@demo/binding',
		files: ['src'],
		scripts: { typecheck: 'node scripts/typecheck.mjs' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(wrapped.repo, wrapped.packages).map(({ rule, id }) => [
			rule,
			id,
		]),
		[[RULES.nodeTypes, 'packages/demo/tsconfig.json']],
	);
});

test('a package-root project scoped away from src is not the validation project', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: {},
		tsconfigs: {
			// A build-script project and a consumer-shaped type test both live in the
			// package root without ever compiling the shipped tree.
			'tsconfig.json': { include: ['scripts', '*.config.*'], compilerOptions: { types: ['node'] } },
			'tsconfig.consumer.json': {
				include: ['./tests/types/'],
				compilerOptions: { types: ['node'] },
			},
		},
		sources: { 'index.ts': 'export const a = 1;\n' },
	});

	// Neither project's Node types is reported, and with no project validating
	// src, the shipped module is reported as unchecked by the unused flags.
	assert.deepEqual(rulesAndIds(findSourcePublicationViolations(repo, packages)), [
		[RULES.unusedFlags, '@demo/binding'],
	]);
});

test('nested type-test projects are not treated as the validation project', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/typetests/tsconfig.json' },
		tsconfigs: {
			'typetests/tsconfig.json': { compilerOptions: { types: ['node'], ...unusedFlags } },
		},
		sources: { 'index.ts': 'export const a = 1;\n' },
	});

	assert.deepEqual(rulesAndIds(findSourcePublicationViolations(repo, packages)), [
		[RULES.unusedFlags, '@demo/binding'],
	]);
});

test('the validation project may not exclude source that still ships', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
		tsconfigs: {
			'tsconfig.json': {
				compilerOptions: unusedFlags,
				exclude: ['node_modules', 'src/broken.ts', 'src/absent.ts'],
			},
		},
		sources: { 'index.ts': 'export const a = 1;\n', 'broken.ts': 'export const b = 2;\n' },
	});

	const violations = findSourcePublicationViolations(repo, packages);
	assert.deepEqual(rulesAndIds(violations), [
		[RULES.excluded, 'packages/demo/tsconfig.json'],
		[RULES.unusedFlags, '@demo/binding'],
	]);
	// Only the file that exists in the packed tree is reported, and the excluded
	// module is the one the unused flags never check.
	assert.match(violations[0].detail, /src\/broken\.ts$/);
	assert.match(violations[1].detail, /1 shipped module\(s\), starting with broken\.ts,/);
});

test('a directory or glob exclude drops shipped source the same way a file name does', () => {
	const covering = ['src', './src/', 'src/', 'src/**', 'src/**/*.tsrx', 'src/*.tsrx'];
	for (const entry of covering) {
		const { repo, packages } = createRepository({
			manifest: { files: ['src'] },
			rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
			tsconfigs: {
				'tsconfig.json': {
					compilerOptions: unusedFlags,
					include: ['src'],
					exclude: ['node_modules', 'dist', entry],
				},
			},
			sources: { 'index.tsrx': 'export const a = 1;\n' },
		});

		const violations = findSourcePublicationViolations(repo, packages);
		assert.deepEqual(
			rulesAndIds(violations),
			[
				[RULES.excluded, 'packages/demo/tsconfig.json'],
				[RULES.unusedFlags, '@demo/binding'],
			],
			`exclude ${JSON.stringify(entry)} must be reported`,
		);
		assert.match(
			violations[0].detail,
			new RegExp(`${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
		);
	}

	// Excludes that cover no packed file stay silent, including a glob whose
	// extension does not match and a sibling directory named like the source one.
	for (const entry of ['node_modules', 'dist', 'tests/**', 'src/**/*.css', 'source/**']) {
		const { repo, packages } = createRepository({
			manifest: { files: ['src'] },
			rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
			tsconfigs: {
				'tsconfig.json': { compilerOptions: unusedFlags, include: ['src'], exclude: [entry] },
			},
			sources: { 'index.tsrx': 'export const a = 1;\n' },
		});

		assert.deepEqual(
			findSourcePublicationViolations(repo, packages),
			[],
			`exclude ${JSON.stringify(entry)} must not be reported`,
		);
	}
});

test('published JavaScript modules must ship a sibling declaration file', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': {} },
		sources: {
			'typed.js': 'export const typed = 1;\n',
			'typed.d.ts': 'export declare const typed: number;\n',
			'untyped.js': 'export const untyped = 2;\n',
			'untyped.test.js': 'export const covered = 3;\n',
		},
	});

	const violations = findSourcePublicationViolations(repo, packages);
	assert.deepEqual(
		violations.map(({ rule, id }) => [rule, id]),
		[[RULES.untypedJavaScript, '@demo/binding']],
	);
	// Tests are packed but are not API, and typed.js is already covered.
	assert.match(violations[0].detail, /publishes 1 \.js module\(s\).*untyped\.js/);
});

test('packages that do not ship source are outside the contract', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['dist'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'] } } },
		sources: { 'index.tsrx': 'export const a = 1;\n', 'legacy.js': 'export const b = 2;\n' },
	});

	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);
});

test('the debt allowlist admits known violations and rejects new ones', () => {
	const known = { rule: RULES.nodeTypes, id: 'packages/demo/tsconfig.json', detail: 'known' };
	const fresh = { rule: RULES.nodeTypes, id: 'packages/other/tsconfig.json', detail: 'new' };
	const debt = { [RULES.nodeTypes]: [known.id] };

	assert.deepEqual(partitionAgainstDebt([known], debt), { unexpected: [], stale: [] });
	assert.deepEqual(partitionAgainstDebt([known, fresh], debt), {
		unexpected: [fresh],
		stale: [],
	});
});

test('a fixed package must be removed from the debt allowlist', () => {
	const debt = { [RULES.nodeTypes]: ['packages/demo/tsconfig.json'] };

	assert.deepEqual(partitionAgainstDebt([], debt), {
		unexpected: [],
		stale: [{ rule: RULES.nodeTypes, id: 'packages/demo/tsconfig.json' }],
	});
});

test('the committed allowlist only names rules this check reports', () => {
	assert.deepEqual(Object.keys(SOURCE_PUBLICATION_DEBT).sort(), Object.values(RULES).sort());
	for (const ids of Object.values(SOURCE_PUBLICATION_DEBT)) {
		assert.deepEqual([...ids], [...new Set(ids)]);
	}
});

test('shipped .ts and .tsrx must be checked by a project with both unused-declaration flags', () => {
	const sources = {
		'index.ts': 'export const a = 1;\n',
		'View.tsrx': 'export const b = 2;\n',
		'index.d.ts': 'export declare const a: number;\n',
	};
	const violationsFor = (compilerOptions) => {
		const { repo, packages } = createRepository({
			manifest: { files: ['src'] },
			rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
			tsconfigs: { 'tsconfig.json': { compilerOptions, include: ['src'] } },
			sources,
		});
		return findSourcePublicationViolations(repo, packages);
	};

	assert.deepEqual(violationsFor(unusedFlags), []);
	// Either flag alone leaves the other consumer flag unchecked.
	for (const compilerOptions of [{}, { noUnusedLocals: true }, { noUnusedParameters: true }]) {
		const violations = violationsFor(compilerOptions);
		assert.deepEqual(
			rulesAndIds(violations),
			[[RULES.unusedFlags, '@demo/binding']],
			JSON.stringify(compilerOptions),
		);
		// Declaration files give neither flag anything to check.
		assert.match(
			violations[0].detail,
			/^2 shipped module\(s\), starting with View\.tsrx, index\.ts,/,
		);
	}
});

test('the unused-declaration flags may come from a relative base the project extends', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: {},
		tsconfigs: {
			'tsconfig.base.json': { compilerOptions: unusedFlags, include: ['scripts'] },
			'tsconfig.json': { extends: './tsconfig.base', include: ['src'] },
		},
		sources: { 'index.ts': 'export const a = 1;\n' },
	});
	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);

	// A test project that turns the flags back off does not undo the project
	// that validates src with them on.
	const withTests = createRepository({
		manifest: { files: ['src'] },
		rootScripts: {},
		tsconfigs: {
			'tsconfig.json': { compilerOptions: unusedFlags, include: ['src'] },
			'tsconfig.tests.json': {
				extends: './tsconfig.json',
				compilerOptions: { noUnusedLocals: false, noUnusedParameters: false },
				include: ['src', 'tests'],
			},
		},
		sources: { 'index.ts': 'export const a = 1;\n' },
	});
	assert.deepEqual(findSourcePublicationViolations(withTests.repo, withTests.packages), []);
});

test('a flagged project must include every shipped module, not only some of them', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'octane-tsc -p packages/demo/tsconfig.json' },
		tsconfigs: {
			// Declarations alone leave the shipped `.tsrx` beside them unchecked.
			'tsconfig.json': { compilerOptions: unusedFlags, include: ['./src/**/*.d.ts'] },
		},
		sources: {
			'Hydrate.tsrx': 'export const a = 1;\n',
			'Hydrate.tsrx.d.ts': 'export declare const a: number;\n',
			'index.js': 'export * from "./Hydrate.tsrx";\n',
			'index.d.ts': 'export * from "./Hydrate.tsrx";\n',
		},
	});

	const violations = findSourcePublicationViolations(repo, packages);
	assert.deepEqual(rulesAndIds(violations), [[RULES.unusedFlags, '@demo/binding']]);
	assert.match(violations[0].detail, /^1 shipped module\(s\), starting with Hydrate\.tsrx,/);
});

test('a package that ships only JavaScript and declarations gives the flags nothing to check', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: {},
		tsconfigs: {},
		sources: {
			'index.js': 'export const value = 2;\n',
			'index.d.ts': 'export declare const value: number;\n',
		},
	});

	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);
});

test('tsconfig files with comments and trailing commas are read, not skipped', () => {
	assert.deepEqual(
		parseJsonc(`{
			// a repository tsconfig comment
			"compilerOptions": { "types": ["node"] }, /* trailing */
		}`),
		{ compilerOptions: { types: ['node'] } },
	);
	assert.deepEqual(parseJsonc('{ "include": ["src/**/*.tsrx"] }'), {
		include: ['src/**/*.tsrx'],
	});
});

test('a wildcard final segment matches one path segment, the way tsc treats it', () => {
	// `src/*` reaches a file directly under src, so it drops shipped source.
	const shallow = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: {
			'tsconfig.json': { compilerOptions: unusedFlags, include: ['src'], exclude: ['src/*'] },
		},
		sources: { 'index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(shallow.repo, shallow.packages).map(({ rule }) => rule),
		[RULES.excluded, RULES.unusedFlags],
	);

	// The same entry must NOT reach a nested file: `*` does not cross `/`. Only
	// `src/**` spans directories, so the nested case stays silent here and is
	// reported there.
	const nested = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: {
			'tsconfig.json': { compilerOptions: unusedFlags, include: ['src'], exclude: ['src/*'] },
		},
		sources: { 'deep/nested/index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(findSourcePublicationViolations(nested.repo, nested.packages), []);

	const spanning = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: {
			'tsconfig.json': { compilerOptions: unusedFlags, include: ['src'], exclude: ['src/**'] },
		},
		sources: { 'deep/nested/index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(spanning.repo, spanning.packages).map(({ rule }) => rule),
		[RULES.excluded, RULES.unusedFlags],
	);
});
