import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
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

test('a package that ships .tsrx may not be validated by tsgo', () => {
	const withTsgo = createRepository({
		...shippedTsrx,
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { include: ['src'] } },
	});
	assert.deepEqual(
		findSourcePublicationViolations(withTsgo.repo, withTsgo.packages).map(({ rule, id }) => [
			rule,
			id,
		]),
		[[RULES.tsgo, 'packages/demo/tsconfig.json']],
	);

	const withTsrxTsc = createRepository({
		...shippedTsrx,
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { include: ['src'] } },
	});
	assert.deepEqual(findSourcePublicationViolations(withTsrxTsc.repo, withTsrxTsc.packages), []);
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
		scripts: { typecheck: 'tsgo --noEmit -p tsconfig.json' },
	});

	assert.deepEqual(
		findSourcePublicationViolations(delegated.repo, delegated.packages).map(({ rule }) => rule),
		[RULES.tsgo],
	);
});

test('the validation project may not pin Node types a consumer does not install', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'] } } },
		sources: { 'index.ts': 'export const a = 1;\n' },
	});

	assert.deepEqual(
		findSourcePublicationViolations(repo, packages).map(({ rule, id }) => [rule, id]),
		[[RULES.nodeTypes, 'packages/demo/tsconfig.json']],
	);
});

test('a validation project the typecheck chain never reaches is still checked', () => {
	// A package the chain never names still ships source a consumer compiles.
	const absent = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/octane/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'] } } },
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
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'] } } },
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

	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);
});

test('nested type-test projects are not treated as the validation project', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/typetests/tsconfig.json' },
		tsconfigs: { 'typetests/tsconfig.json': { compilerOptions: { types: ['node'] } } },
		sources: { 'index.ts': 'export const a = 1;\n' },
	});

	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);
});

test('the validation project may not exclude source that still ships', () => {
	const { repo, packages } = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: {
			'tsconfig.json': { exclude: ['node_modules', 'src/broken.ts', 'src/absent.ts'] },
		},
		sources: { 'index.ts': 'export const a = 1;\n', 'broken.ts': 'export const b = 2;\n' },
	});

	const violations = findSourcePublicationViolations(repo, packages);
	assert.deepEqual(
		violations.map(({ rule, id }) => [rule, id]),
		[[RULES.excluded, 'packages/demo/tsconfig.json']],
	);
	// Only the file that exists in the packed tree is reported.
	assert.match(violations[0].detail, /src\/broken\.ts$/);
});

test('a directory or glob exclude drops shipped source the same way a file name does', () => {
	const covering = ['src', './src/', 'src/', 'src/**', 'src/**/*.tsrx', 'src/*.tsrx'];
	for (const entry of covering) {
		const { repo, packages } = createRepository({
			manifest: { files: ['src'] },
			rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
			tsconfigs: {
				'tsconfig.json': { include: ['src'], exclude: ['node_modules', 'dist', entry] },
			},
			sources: { 'index.tsrx': 'export const a = 1;\n' },
		});

		const violations = findSourcePublicationViolations(repo, packages);
		assert.deepEqual(
			violations.map(({ rule, id }) => [rule, id]),
			[[RULES.excluded, 'packages/demo/tsconfig.json']],
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
			tsconfigs: { 'tsconfig.json': { include: ['src'], exclude: [entry] } },
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
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/tsconfig.json' },
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
		rootScripts: { typecheck: 'tsgo --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { compilerOptions: { types: ['node'] } } },
		sources: { 'index.tsrx': 'export const a = 1;\n', 'legacy.js': 'export const b = 2;\n' },
	});

	assert.deepEqual(findSourcePublicationViolations(repo, packages), []);
});

test('the debt allowlist admits known violations and rejects new ones', () => {
	const known = { rule: RULES.tsgo, id: 'packages/demo/tsconfig.json', detail: 'known' };
	const fresh = { rule: RULES.tsgo, id: 'packages/other/tsconfig.json', detail: 'new' };
	const debt = { [RULES.tsgo]: [known.id] };

	assert.deepEqual(partitionAgainstDebt([known], debt), { unexpected: [], stale: [] });
	assert.deepEqual(partitionAgainstDebt([known, fresh], debt), {
		unexpected: [fresh],
		stale: [],
	});
});

test('a fixed package must be removed from the debt allowlist', () => {
	const debt = { [RULES.tsgo]: ['packages/demo/tsconfig.json'] };

	assert.deepEqual(partitionAgainstDebt([], debt), {
		unexpected: [],
		stale: [{ rule: RULES.tsgo, id: 'packages/demo/tsconfig.json' }],
	});
});

test('the committed allowlist only names rules this check reports', () => {
	assert.deepEqual(Object.keys(SOURCE_PUBLICATION_DEBT).sort(), Object.values(RULES).sort());
	for (const ids of Object.values(SOURCE_PUBLICATION_DEBT)) {
		assert.deepEqual([...ids], [...new Set(ids)]);
	}
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
		tsconfigs: { 'tsconfig.json': { include: ['src'], exclude: ['src/*'] } },
		sources: { 'index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(shallow.repo, shallow.packages).map(({ rule }) => rule),
		[RULES.excluded],
	);

	// The same entry must NOT reach a nested file: `*` does not cross `/`. Only
	// `src/**` spans directories, so the nested case stays silent here and is
	// reported there.
	const nested = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { include: ['src'], exclude: ['src/*'] } },
		sources: { 'deep/nested/index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(findSourcePublicationViolations(nested.repo, nested.packages), []);

	const spanning = createRepository({
		manifest: { files: ['src'] },
		rootScripts: { typecheck: 'tsrx-tsc --noEmit -p packages/demo/tsconfig.json' },
		tsconfigs: { 'tsconfig.json': { include: ['src'], exclude: ['src/**'] } },
		sources: { 'deep/nested/index.tsrx': 'export const a = 1;\n' },
	});
	assert.deepEqual(
		findSourcePublicationViolations(spanning.repo, spanning.packages).map(({ rule }) => rule),
		[RULES.excluded],
	);
});
