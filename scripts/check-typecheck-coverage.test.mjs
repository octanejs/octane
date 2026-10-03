import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { checkTypecheckCoverage } from './check-typecheck-coverage.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'typecheck-coverage-'));
after(() => rmSync(root, { recursive: true, force: true }));

function makePackage(name, { scripts = {}, files = ['tsconfig.json'], isPrivate = false } = {}) {
	const directory = path.join(root, name);
	mkdirSync(directory, { recursive: true });
	writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, scripts }));
	for (const file of files) {
		mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
		writeFileSync(path.join(directory, file), '{}');
	}
	return { name, directory, private: isPrivate };
}

const plain = makePackage('plain');
const scripted = makePackage('scripted', {
	scripts: { typecheck: 'octane-tsc -p typetests/tsconfig.json && tsc --noEmit -p pristine.json' },
	files: ['tsconfig.json', 'typetests/tsconfig.json', 'pristine.json'],
});
const internal = makePackage('internal', { isPrivate: true });
const packages = [plain, scripted, internal];
const record = (publishedExceptions = []) => ({
	requiredProjects: [],
	privateExceptions: [],
	publishedExceptions,
});
const reached = (...projects) =>
	new Map(projects.map((project) => [project, new Set(['octane-tsc'])]));
const plainConfig = path.join(plain.directory, 'tsconfig.json');
const scriptedTypetests = path.join(scripted.directory, 'typetests/tsconfig.json');
const today = '2026-10-03';

test('every published package must reach the root typecheck with octane-tsc', () => {
	assert.deepEqual(
		checkTypecheckCoverage({
			record: record(),
			packages,
			rootProjects: reached(plainConfig, scriptedTypetests),
			today,
		}),
		[],
	);
	const errors = checkTypecheckCoverage({
		record: record(),
		packages,
		rootProjects: reached(scriptedTypetests),
		today,
	});
	assert.equal(errors.length, 1);
	assert.match(errors[0], /^plain: .*plain\/tsconfig\.json is not reached/);
});

test("a package's declared .tsrx-aware projects replace its tsconfig.json", () => {
	const errors = checkTypecheckCoverage({
		record: record(),
		packages,
		rootProjects: reached(plainConfig, path.join(scripted.directory, 'tsconfig.json')),
		today,
	});
	assert.equal(errors.length, 1);
	assert.match(errors[0], /scripted\/typetests\/tsconfig\.json is not reached/);
});

test('a dated exception with a reason excuses a project until it expires', () => {
	const exception = (expires) => ({
		package: 'plain',
		projects: [plainConfig],
		reason: 'virtual TSX reports a false error with no source location',
		expires,
	});
	const check = (expires) =>
		checkTypecheckCoverage({
			record: record([exception(expires)]),
			packages,
			rootProjects: reached(scriptedTypetests),
			today,
		});
	assert.deepEqual(check('2026-10-03'), []);
	assert.match(check('2026-10-02').join('\n'), /plain: typecheck exception expired 2026-10-02/);
	assert.match(check('soon').join('\n'), /needs an expires date/);
});

test('an exception for a project that is typechecked now is stale', () => {
	const errors = checkTypecheckCoverage({
		record: record([
			{
				package: 'plain',
				projects: [plainConfig],
				reason: 'virtual TSX reports a false error with no source location',
				expires: '2026-10-31',
			},
		]),
		packages,
		rootProjects: reached(plainConfig, scriptedTypetests),
		today,
	});
	assert.deepEqual(errors, [`${plainConfig} is typechecked now; remove it from plain's exception`]);
});

test('a materialized project needs a reason and goes stale once it is typechecked', () => {
	const check = (entry, rootProjects) =>
		checkTypecheckCoverage({
			record: { ...record(), materializedProjects: [entry] },
			packages,
			rootProjects,
			today,
		});
	const entry = {
		project: plainConfig,
		reason: 'inputs are materialized from a pinned upstream and gitignored',
	};
	assert.deepEqual(check(entry, reached(scriptedTypetests)), []);
	assert.match(
		check({ ...entry, reason: 'short' }, reached(scriptedTypetests)).join('\n'),
		/needs a durable reason/,
	);
	assert.match(
		check(entry, reached(plainConfig, scriptedTypetests)).join('\n'),
		/is typechecked now; remove it from materializedProjects/,
	);
});

test('private packages are not required and cannot hold published exceptions', () => {
	const errors = checkTypecheckCoverage({
		record: record([
			{
				package: 'internal',
				projects: [path.join(internal.directory, 'tsconfig.json')],
				reason: 'virtual TSX reports a false error with no source location',
				expires: '2026-10-31',
			},
		]),
		packages,
		rootProjects: reached(plainConfig, scriptedTypetests),
		today,
	});
	assert.deepEqual(errors, ['published exception names no published package: internal']);
});
