import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validate } from '../../audit/upstream-inventory.mjs';

const sourceRoot = new URL('../..', import.meta.url).pathname;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function sandbox() {
	const directory = await mkdtemp(join(tmpdir(), 'react-draggable-audit-'));
	await cp(sourceRoot, directory, { recursive: true });
	return directory;
}

async function inventory(root, edit) {
	const path = join(root, 'audit/upstream-inventory.json');
	const value = JSON.parse(await readFile(path, 'utf8'));
	edit(value);
	await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function mutateArtifact(root, path, edit) {
	// Inventory identities keep the historical tag/ and npm/ prefixes; the
	// trees live at upstream/ and upstream-artifact/ respectively.
	const file = path.startsWith('npm/')
		? join(root, 'upstream-artifact', path.slice('npm/'.length))
		: join(root, 'upstream', path.slice('tag/'.length));
	await writeFile(file, edit(await readFile(file, 'utf8')));
	const bytes = await readFile(file);
	await inventory(root, (value) => {
		const artifact = value.artifacts.find((entry) => entry.path === path);
		artifact.sha256 = digest(bytes);
		artifact.bytes = bytes.length;
	});
}

async function rejectsMutation(name, mutation, pattern) {
	await test(name, async (context) => {
		const root = await sandbox();
		context.after(() => rm(root, { recursive: true, force: true }));
		await mutation(root);
		await assert.rejects(validate(root), pattern);
	});
}

test('the pristine pinned inventory validates', async () => {
	const result = await validate(sourceRoot);
	assert.equal(result.inventories.unitCases.length, 204);
	assert.equal(result.inventories.unitFiles.length, 11);
	assert.equal(result.inventories.browserCases.length, 23);
	assert.ok(result.inventories.adaptedCases.length >= 100);
	assert.equal(result.publicSurface.typeExports.length, 8);
});

await rejectsMutation(
	'a missing source file fails closed',
	async (root) => {
		await rename(
			join(root, 'upstream/lib/utils/log.ts'),
			join(root, 'upstream/lib/utils/log-renamed.ts'),
		);
	},
	/artifact: missing identity tag\/lib\/utils\/log\.ts/,
);

await rejectsMutation(
	'a renamed unit case fails with its identity',
	async (root) => {
		const path = 'tag/test/Draggable.test.jsx';
		await mutateArtifact(root, path, (source) =>
			source.replace('should render with default class', 'renamed default class case'),
		);
	},
	/adapted public unit case: missing identity/,
);

await rejectsMutation(
	'a renamed public adapted case fails closed',
	async (root) => {
		const path = join(root, 'tests/upstream/public-root.test.ts');
		await writeFile(
			path,
			(await readFile(path, 'utf8')).replace(
				'tag/test/Draggable.test.jsx::should render with default class',
				'tag/test/Draggable.test.jsx::renamed default class case',
			),
		);
	},
	/adapted public unit case: missing identity/,
);

await rejectsMutation(
	'a removed adapted runtime marker fails closed',
	async (root) => {
		const path = join(root, 'tests/runtime/draggable.test.ts');
		await writeFile(
			path,
			(await readFile(path, 'utf8')).replace(
				'@parity-case adapted:draggable-grid',
				'removed parity marker',
			),
		);
	},
	/adapted case: missing identity adapted:draggable-grid/,
);

await rejectsMutation(
	'a removed browser case fails with its identity',
	async (root) => {
		const path = 'tag/test/browser/browser.test.js';
		await mutateArtifact(root, path, (source) =>
			source.replace(
				"it('should update transform on drag'",
				"void ('should update transform on drag'",
			),
		);
	},
	/adapted browser case: unapproved identity .*should update transform on drag|browser case: missing identity .*should update transform on drag/,
);

await rejectsMutation(
	'a removed type assertion fails with its identity',
	async (root) => {
		const path = 'tag/test/typeCompat/fixture.tsx';
		await mutateArtifact(root, path, (source) =>
			source.replace('expectType<number>(cp.x);', 'void cp.x;'),
		);
	},
	/type assertion: missing identity .*fixture\.tsx:31/,
);

await rejectsMutation(
	'a duplicate disposition fails closed',
	async (root) => {
		await inventory(root, (value) => value.crosswalk.unitCases.push(value.crosswalk.unitCases[0]));
	},
	/unitCases disposition: duplicate identity/,
);

await rejectsMutation(
	'a reused adapted case identity fails closed',
	async (root) => {
		await inventory(root, (value) => {
			const executable = value.crosswalk.unitCases.filter(
				(entry) => entry.kind === 'unit-case' && entry.disposition === 'adapted-and-executable',
			);
			executable[1].adaptedCases = executable[0].adaptedCases;
		});
	},
	/adapted case is mapped more than once/,
);

await rejectsMutation(
	'an unapproved runtime export fails closed',
	async (root) => {
		await inventory(root, (value) => value.publicSurface.runtimeExports.push('PointerDraggable'));
	},
	/runtime export: missing identity PointerDraggable/,
);

await rejectsMutation(
	'an unapproved package subpath fails closed',
	async (root) => {
		const path = join(root, 'package.json');
		const manifest = JSON.parse(await readFile(path, 'utf8'));
		manifest.exports['./internal'] = './src/internal.ts';
		await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
	},
	/package subpath: unapproved identity \.\/internal/,
);

await rejectsMutation(
	'a skip disposition fails closed',
	async (root) => {
		await inventory(root, (value) => {
			value.crosswalk.unitCases[0].disposition = 'ported.skip';
		});
	},
	/skip marker is not an approved disposition/,
);

await rejectsMutation(
	'a pending disposition fails closed',
	async (root) => {
		await inventory(root, (value) => {
			value.crosswalk.unitCases[0].disposition = 'pending-adaptation';
		});
	},
	/every upstream item must have a resolved disposition/,
);

await rejectsMutation(
	'missing crosswalk evidence fails closed',
	async (root) => {
		await inventory(root, (value) => {
			value.crosswalk.unitCases[0].evidence = [];
		});
	},
	/every upstream disposition must cite executable or source evidence/,
);

await rejectsMutation(
	'a stale fixture hash fails closed',
	async (root) => {
		const path = join(root, 'upstream/test/browser/test.html');
		await writeFile(path, `${await readFile(path, 'utf8')}\n`);
	},
	/artifact: stale hash tag\/test\/browser\/test\.html/,
);

await rejectsMutation(
	'a deleted adapted assertion fails closed even when the title is unchanged',
	async (root) => {
		const path = join(root, 'tests/upstream/public-root.test.ts');
		const source = await readFile(path, 'utf8');
		await writeFile(
			path,
			source.replace(
				"expect(mounted.node.classList.contains('react-draggable')).toBe(true);",
				'void mounted.node;',
			),
		);
	},
	/adapted case structure: structure drifted|adapted case structure: assertions drifted/,
);

await rejectsMutation(
	'a removed adapted @ts-expect-error fails closed',
	async (root) => {
		const path = join(root, 'typetests/adapted/typeCompat.fixture.ts');
		const source = await readFile(path, 'utf8');
		await writeFile(
			path,
			source.replace(
				'// @ts-expect-error positions require both coordinates\nconst badPosition: ControlPosition = { x: 1 };',
				'const badPosition: ControlPosition = { x: 1, y: 0 };',
			),
		);
	},
	/react-draggable adapted type inventory drifted|missing required adapted assertion group|expected at least 2 @ts-expect-error/,
);

await rejectsMutation(
	'a hollow adapted consumer type file fails closed',
	async (root) => {
		const path = join(root, 'typetests/adapted/typings.consumer.ts');
		await writeFile(
			path,
			`import Draggable, { DraggableCore, type DraggableCoreProps, type DraggableProps } from '@octanejs/draggable';\nvoid [Draggable, DraggableCore];\n`,
		);
	},
	/react-draggable adapted type inventory drifted|missing required adapted assertion group|prop-probe:draggableProps/,
);

await rejectsMutation(
	'an unclassified authored test fails closed',
	async (root) => {
		const path = join(root, 'tests/runtime/orphan-unclassified.test.ts');
		await writeFile(path, "import { test } from 'vitest';\ntest('orphan', () => {});\n");
	},
	/every authored react-draggable test must have exactly one classification/,
);
