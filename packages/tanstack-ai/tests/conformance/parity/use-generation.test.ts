import { renderHook } from '@octanejs/testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useGeneration } from '../../../src/use-generation.tsrx';
import { createMockConnectionAdapter } from '../test-utils';

const { generationDevtoolsOptions } = vi.hoisted(() => ({
	generationDevtoolsOptions: [] as Array<{ metadata?: { framework?: string } }>,
}));

vi.mock('@tanstack/ai-client/devtools', async (importOriginal) => {
	const original = await importOriginal<typeof import('@tanstack/ai-client/devtools')>();
	return {
		...original,
		createGenerationDevtoolsBridge: (options: { metadata?: { framework?: string } }) => {
			generationDevtoolsOptions.push(options);
			return original.createGenerationDevtoolsBridge(options as never);
		},
	};
});

describe('useGeneration', () => {
	describe('initialization', () => {
		// Octane divergence note.
		it('should identify the generation client framework as octane', () => {
			generationDevtoolsOptions.length = 0;
			const adapter = createMockConnectionAdapter();
			const { result } = renderHook(() => useGeneration({ connection: adapter }));

			expect(generationDevtoolsOptions).toHaveLength(1);
			expect(generationDevtoolsOptions[0]?.metadata?.framework).toBe('octane');
			expect(result.current.result).toBeNull();
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBeUndefined();
			expect(result.current.status).toBe('idle');
		});
	});
});
