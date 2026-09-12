import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@octanejs/testing-library';
import { describe, expect, it } from 'vitest';
import { useChat } from '../../../src/index';

describe('@octanejs/tanstack-ai documented divergences', () => {
	// Octane divergence note.
	it('publishes native UI and MCP resource subpaths', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
		) as { exports: Record<string, string> };
		expect(Object.keys(packageJson.exports)).toEqual(['.', './ui', './mcp-apps']);
		expect(packageJson.exports['./mcp-apps']).toBe('./src/mcp-apps.ts');
	});

	// Octane divergence note.
	it('does not expose an unavailable auto-resume contract', () => {
		const { result } = renderHook(() =>
			useChat({ connection: { connect: async function* () {} } }),
		);
		expect(result.current).not.toHaveProperty('maybeAutoResume');
	});
});
