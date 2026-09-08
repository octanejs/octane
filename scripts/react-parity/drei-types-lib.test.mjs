import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
	buildDreiTypeInventory,
	renderDreiTypeInventories,
	verifyDreiTypes,
} from './drei-types-lib.mjs';

const PRISTINE = `import { Box, type ViewProps } from '@react-three/drei';
const viewProps: ViewProps = { index: 1, frames: 1 };
void [Box, viewProps];
// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
`;

const ADAPTED = `import { Box, type ViewProps } from '@octanejs/drei';
const viewProps: ViewProps = { index: 1, frames: 1 };
void [Box, viewProps];
// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
`;

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'drei-types-'));
	await mkdir(join(root, 'packages/drei/typetests/pristine'), { recursive: true });
	await mkdir(join(root, 'packages/drei/typetests/adapted'), { recursive: true });
	await mkdir(join(root, 'packages/drei/audit'), { recursive: true });
	await writeFile(join(root, 'packages/drei/typetests/pristine/public-api.test-d.ts'), PRISTINE);
	await writeFile(join(root, 'packages/drei/typetests/adapted/public-api.test-d.ts'), ADAPTED);
	const config = {
		schemaVersion: 1,
		pristineFile: 'packages/drei/typetests/pristine/public-api.test-d.ts',
		adaptedFile: 'packages/drei/typetests/adapted/public-api.test-d.ts',
		inventories: {
			pristine: 'packages/drei/audit/pristine-types.json',
			adapted: 'packages/drei/audit/adapted-types.json',
		},
		permittedTransformations: [
			{
				kind: 'import-root',
				rule: '@react-three/drei may become @octanejs/drei',
			},
		],
	};
	await writeFile(join(root, 'packages/drei/audit/type-parity.json'), JSON.stringify(config));
	const { inventory } = renderDreiTypeInventories(root, 'packages/drei/audit/type-parity.json');
	await writeFile(
		join(root, config.inventories.pristine),
		JSON.stringify({
			path: inventory.pristine.path,
			sha256: inventory.pristine.sha256,
			assertionGroups: inventory.pristine.assertionGroups,
		}),
	);
	await writeFile(
		join(root, config.inventories.adapted),
		JSON.stringify({
			path: inventory.adapted.path,
			sha256: inventory.adapted.sha256,
			assertionGroups: inventory.adapted.assertionGroups,
		}),
	);
	return { root, config };
}

test('accepts matching pristine/adapted assertion groups after import-root normalization', async () => {
	const { root } = await fixture();
	assert.deepEqual(verifyDreiTypes(root, { configPath: 'packages/drei/audit/type-parity.json' }), {
		files: 2,
		assertions: buildDreiTypeInventory(root, {
			pristineFile: 'packages/drei/typetests/pristine/public-api.test-d.ts',
			adaptedFile: 'packages/drei/typetests/adapted/public-api.test-d.ts',
		}).groups.length,
	});
});

test('rejects a deleted assertion group', async () => {
	const { root } = await fixture();
	await writeFile(
		join(root, 'packages/drei/typetests/adapted/public-api.test-d.ts'),
		ADAPTED.replace(
			`// @ts-expect-error frame count is numeric on View
const invalidView: ViewProps = { frames: 'always' };
void invalidView;
`,
			'',
		),
	);
	assert.throws(
		() => verifyDreiTypes(root, { configPath: 'packages/drei/audit/type-parity.json' }),
		/assertion groups differ/,
	);
});

test('rejects a removed @ts-expect-error control', async () => {
	const { root } = await fixture();
	const inventoryPath = join(root, 'packages/drei/audit/pristine-types.json');
	const recorded = JSON.parse(await readFile(inventoryPath, 'utf8'));
	recorded.assertionGroups.pop();
	await writeFile(inventoryPath, JSON.stringify(recorded));
	assert.throws(
		() => verifyDreiTypes(root, { configPath: 'packages/drei/audit/type-parity.json' }),
		/pristine drei type inventory drifted/,
	);
});

test('rejects an unpermitted structural change', async () => {
	const { root } = await fixture();
	await writeFile(
		join(root, 'packages/drei/typetests/adapted/public-api.test-d.ts'),
		ADAPTED.replace('frames: 1', 'frames: 2'),
	);
	assert.throws(
		() => verifyDreiTypes(root, { configPath: 'packages/drei/audit/type-parity.json' }),
		/outside the permitted import-root transformation|assertion groups differ/,
	);
});
