// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveOctaneConfig } from '@octanejs/app-core/config';

describe('app state-model configuration', () => {
	it('normalizes the rollout default and exact dependency package map', () => {
		const defaults = resolveOctaneConfig({});
		expect(defaults.compiler.stateModel).toMatchObject({
			default: 'permissive',
			packages: {},
		});

		const resolved = resolveOctaneConfig({
			compiler: {
				stateModel: {
					default: 'causal',
					packages: {
						'widgets-z': 'permissive',
						'@vendor/widgets': 'causal',
					},
				},
			},
		});
		expect(resolved.compiler.stateModel).toMatchObject({
			default: 'causal',
			packages: {
				'@vendor/widgets': 'causal',
				'widgets-z': 'permissive',
			},
		});
		expect(Object.isFrozen(resolved.compiler.stateModel)).toBe(true);
		expect(Object.isFrozen(resolved.compiler.stateModel.packages)).toBe(true);

		// Production config loading re-resolves canonical configuration.
		expect(resolveOctaneConfig(resolved).compiler.stateModel.signature).toBe(
			resolved.compiler.stateModel.signature,
		);
	});

	it.each([
		[{ default: 'strict' }, /must be "causal" or "permissive"/],
		[{ packages: [] }, /packages must be an object/],
		[{ packages: { 'widgets/button': 'permissive' } }, /exact npm package name/],
		[{ packages: { '@vendor/*': 'permissive' } }, /exact npm package name/],
		[{ packages: { '@vendor/.': 'permissive' } }, /exact npm package name/],
		[{ packages: { '@vendor/..': 'permissive' } }, /exact npm package name/],
		[{ packages: { '@./widgets': 'permissive' } }, /exact npm package name/],
		[{ packages: { '@../widgets': 'permissive' } }, /exact npm package name/],
		[{ packages: { widgets: 'legacy' } }, /must be "causal" or "permissive"/],
		[{ enabled: true }, /not a supported option/],
	] as const)('rejects invalid state-model config %#', (stateModel, message) => {
		expect(() =>
			resolveOctaneConfig({
				compiler: {
					// @ts-expect-error Runtime validation covers configuration loaded from JavaScript.
					stateModel,
				},
			}),
		).toThrow(message);
	});
});
