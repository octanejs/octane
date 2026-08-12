import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@octanejs/testing-library';
import { describe, expect, it } from 'vitest';
import { useChat } from '../../../src/index';

describe('@octanejs/tanstack-ai documented divergences', () => {
	// Octane divergence note.
	it('publishes no React-only MCP app renderer subpath', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
		) as { exports: Record<string, string> };
		expect(Object.keys(packageJson.exports)).toEqual(['.']);
		expect(packageJson.exports).not.toHaveProperty('./mcp-apps');
	});

	// Octane divergence note.
	it('does not expose an unavailable auto-resume contract', () => {
		const { result } = renderHook(() =>
			useChat({ connection: { connect: async function* () {} } }),
		);
		expect(result.current).not.toHaveProperty('maybeAutoResume');
	});
});
