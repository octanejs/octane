import {
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
	type UniversalAsyncCommitTransport,
	type UniversalHostBatch,
} from 'octane/universal/native';
import { describe, expect, it } from 'vitest';
import { createLynxClientContainer, createLynxClientDriver } from '../src/core/client-driver.js';
import { createLynxNativeResource } from '../src/resource.js';

const resourcePlan = universalPlan('lynx', {
	kind: 'host',
	type: 'native-canvas',
	propsSlot: 0,
});

function captureTransport(output: UniversalHostBatch[]): UniversalAsyncCommitTransport {
	return {
		mode: 'async',
		prepareBatch(_container, batch, identity) {
			return {
				async apply(acknowledge) {
					output.push(batch);
					acknowledge({ ...identity, type: 'ack' });
				},
				abort() {},
			};
		},
	};
}

describe('Lynx native resource handles', () => {
	it('encodes application references as serializable handles scoped to one root', async () => {
		const Scene = defineUniversalComponent('lynx', (props: { texture: unknown }) =>
			universalValue(resourcePlan, [universalProps([['set', 'texture', props.texture]])]),
		);
		const firstBatches: UniversalHostBatch[] = [];
		const firstRoot = createUniversalRoot(createLynxClientContainer(), createLynxClientDriver(), {
			transport: captureTransport(firstBatches),
		});
		const secondBatches: UniversalHostBatch[] = [];
		const secondRoot = createUniversalRoot(createLynxClientContainer(), createLynxClientDriver(), {
			transport: captureTransport(secondBatches),
		});

		await firstRoot.renderAsync(Scene, { texture: createLynxNativeResource('hero') });
		await secondRoot.renderAsync(Scene, { texture: createLynxNativeResource('hero') });
		const firstCreate = firstBatches[0]!.commands.find((command) => command.op === 'create');
		const secondCreate = secondBatches[0]!.commands.find((command) => command.op === 'create');
		if (firstCreate?.op !== 'create' || secondCreate?.op !== 'create') {
			throw new Error('Expected captured Lynx create commands.');
		}
		const first = firstCreate.props.texture;
		const second = secondCreate.props.texture;
		expect(first).toMatchObject({
			$$kind: 'octane.universal.resource',
			renderer: 'lynx',
			id: 'hero',
		});
		expect(second).toMatchObject({
			$$kind: 'octane.universal.resource',
			renderer: 'lynx',
			id: 'hero',
		});
		expect((first as { root: number }).root).not.toBe((second as { root: number }).root);

		await firstRoot.unmountAsync();
		await secondRoot.unmountAsync();
	});

	it('rejects invalid IDs and non-serializable values before transport', async () => {
		expect(() => createLynxNativeResource('')).toThrow(/non-empty/);
		const Scene = defineUniversalComponent('lynx', (props: { value: unknown }) =>
			universalValue(resourcePlan, [universalProps([['set', 'value', props.value]])]),
		);
		const root = createUniversalRoot(createLynxClientContainer(), createLynxClientDriver(), {
			transport: captureTransport([]),
		});
		await expect(root.renderAsync(Scene, { value: () => {} })).rejects.toThrow(
			/non-serializable|Unsupported serializable/,
		);
		await root.unmountAsync();
	});
});
