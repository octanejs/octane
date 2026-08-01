import { describe, it, expect } from 'vitest';
import { createOwnershipFilter } from '../src/ownership-filter.js';
import octane from '../src/index.js';

describe('createOwnershipFilter', () => {
	it('returns null when neither include nor exclude is set', () => {
		expect(createOwnershipFilter(undefined, undefined)).toBeNull();
	});

	it('honors Astro exclude globs the compiler cannot match as path fragments', () => {
		const filter = createOwnershipFilter(undefined, ['**/components/react/**']);
		expect(filter).not.toBeNull();
		// Literal `**/components/react/**` never appears in a real module id, so
		// `file.includes(pattern)` would miss — picomatch must own this gate.
		expect(filter!('/src/components/react/Button.tsrx')).toBe(false);
		expect(filter!('/src/components/octane/Counter.tsrx')).toBe(true);
	});

	it('honors Astro include globs for compiler ownership', () => {
		const filter = createOwnershipFilter(['**/components/octane/**'], undefined);
		expect(filter!('/src/components/octane/Counter.tsrx')).toBe(true);
		expect(filter!('/src/components/react/Button.tsx')).toBe(false);
	});

	it('treats empty include as claim-nothing (not unrestricted)', () => {
		const filter = createOwnershipFilter([], undefined);
		expect(filter).not.toBeNull();
		expect(filter!('/src/components/octane/Counter.tsrx')).toBe(false);
		expect(filter!('/src/App.tsrx')).toBe(false);
	});
});

describe('astroScopedOctanePlugin ownership', () => {
	it('wires exclude globs so the octane transform returns null for excluded ids', async () => {
		const integration = octane({ exclude: ['**/components/react/**'] });
		/** @type {any[]} */
		const configs = [];
		integration.hooks['astro:config:setup']({
			addRenderer: () => {},
			updateConfig: (c) => {
				configs.push(c);
				return c;
			},
			command: 'dev',
			injectScript: () => {},
		});

		const plugins = configs[0].vite.plugins as Array<{
			name?: string;
			transform?: (code: string, id: string, options?: unknown) => unknown;
		}>;
		const scoped = plugins.find((p) => p.name === 'octane');
		expect(scoped?.transform).toBeTypeOf('function');

		const skipped = await scoped!.transform!(
			'export function Button() {}',
			'/app/src/components/react/Button.tsrx',
		);
		expect(skipped).toBeNull();
	});

	it('does not let project include globs block installed @octanejs bindings', async () => {
		const integration = octane({ include: ['**/components/octane/**'] });
		/** @type {any[]} */
		const configs = [];
		integration.hooks['astro:config:setup']({
			addRenderer: () => {},
			updateConfig: (c) => {
				configs.push(c);
				return c;
			},
			command: 'dev',
			injectScript: () => {},
		});

		const plugins = configs[0].vite.plugins as Array<{
			name?: string;
			transform?: (code: string, id: string, options?: unknown) => unknown;
		}>;
		const scoped = plugins.find((p) => p.name === 'octane');
		expect(scoped?.transform).toBeTypeOf('function');

		// Ownership would reject this id; the transform must still enter the
		// compiler (may throw on empty source — must not be the early `null` skip).
		let result: unknown = 'unset';
		try {
			result = await scoped!.transform!(
				'export function X() { return null }',
				'/app/node_modules/@octanejs/zustand/src/index.tsrx',
			);
		} catch {
			result = 'threw';
		}
		expect(result).not.toBeNull();
		expect(result).not.toBe('unset');

		const projectSkip = await scoped!.transform!(
			'export function Button() {}',
			'/app/src/components/react/Button.tsrx',
		);
		expect(projectSkip).toBeNull();
	});

	it('treats Vite-realpathed workspace bindings as ownership-bypass targets', async () => {
		const { dirname, join } = await import('node:path');
		const { fileURLToPath } = await import('node:url');
		const { isInstalledOctaneCompilerTarget } = await import('../src/should-skip-transform.js');
		const zustandSource = join(
			dirname(fileURLToPath(import.meta.url)),
			'../../zustand/src/index.ts',
		);

		const ownership = createOwnershipFilter(['**/components/octane/**'], undefined);
		expect(ownership!(zustandSource)).toBe(false);
		expect(isInstalledOctaneCompilerTarget(zustandSource)).toBe(true);
	});
});
