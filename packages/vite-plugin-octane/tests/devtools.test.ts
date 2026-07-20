/**
 * `devtools: true` composition: the metaframework forwards the compiler half
 * and lazily appends the standalone `@octanejs/devtools/vite` plugin. The
 * plugin's own behavior is covered in packages/octane-devtools/tests.
 */
import { describe, expect, it } from 'vitest';
import { octane } from '../src/index.js';

async function resolvedPluginNames(entries: unknown[]): Promise<string[]> {
	const resolved = await Promise.all(entries);
	return resolved
		.filter((entry): entry is { name: string } => entry !== null && entry !== undefined)
		.map((entry) => entry.name);
}

describe('devtools composition', () => {
	it('composes the standalone devtools plugin only when opted in', async () => {
		const withDevtools = await resolvedPluginNames(
			octane({ devtools: true } as never) as unknown[],
		);
		expect(withDevtools).toContain('@octanejs/devtools');

		const withoutDevtools = await resolvedPluginNames(octane() as unknown[]);
		expect(withoutDevtools).not.toContain('@octanejs/devtools');
	});

	it('keeps the composed devtools plugin serve-only', async () => {
		const entries = (await Promise.all(octane({ devtools: true } as never) as unknown[])) as Array<{
			name: string;
			apply?: string;
		} | null>;
		const devtools = entries.find((entry) => entry?.name === '@octanejs/devtools');
		expect(devtools?.apply).toBe('serve');
	});
});
