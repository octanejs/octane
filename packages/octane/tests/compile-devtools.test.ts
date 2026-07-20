/**
 * The public `devtools` compile option on octane/compiler/vite: an explicit
 * dev-server opt-in that must never leak into build output. The protected
 * contracts are (a) serve-mode `devtools: true` enables the reserved defines
 * and profile metadata the bridge needs, and (b) every build — including one
 * whose shared config passes `devtools: true` — compiles byte-identically to
 * a build that never mentioned devtools.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { octane } from '../src/compiler/vite.js';
import { inspectProfileOutput, uniqueMetadata } from './_profile-output';

const SOURCE = `import { useState } from 'octane';
export function App() @{
	const [count] = useState(0);
	<button>{'count: ' + count}</button>
}
`;

const appRoot = join(process.cwd(), 'app');

function configure(plugin: any, command: 'serve' | 'build'): Record<string, unknown> {
	const config = (plugin.config as any)({ root: appRoot }, { command });
	(plugin.configResolved as any)({ root: appRoot, command, define: {} });
	return config;
}

async function transform(plugin: any, id = '/src/App.tsrx'): Promise<string> {
	const result = await (plugin.transform as any).call({}, SOURCE, id, {});
	return result.code;
}

describe('devtools compile option', () => {
	it('enables the reserved defines and profile metadata for a devtools dev server', async () => {
		const plugin = octane({ devtools: true });
		const config = configure(plugin, 'serve') as { define: Record<string, string> };
		expect(config.define.__OCTANE_DEVTOOLS_ENABLED__).toBe('true');
		// Devtools implies profile metadata: the bridge names components/hooks
		// and reads render timings through the profiler registries.
		expect(config.define.__OCTANE_PROFILE_ENABLED__).toBe('true');

		const output = inspectProfileOutput(await transform(plugin));
		expect(output.profileImports).toContain('__profileComponent');
		expect(uniqueMetadata(output.components).map(({ name }) => name)).toContain('App');
	});

	it('stays off without the opt-in', () => {
		const plugin = octane();
		const config = configure(plugin, 'serve') as { define: Record<string, string> };
		expect(config.define.__OCTANE_DEVTOOLS_ENABLED__).toBe('false');
		expect(config.define.__OCTANE_PROFILE_ENABLED__).toBe('false');
	});

	it('compiles builds byte-identically whether or not devtools was requested', async () => {
		const withDevtools = octane({ devtools: true });
		const config = configure(withDevtools, 'build') as { define: Record<string, string> };
		expect(config.define.__OCTANE_DEVTOOLS_ENABLED__).toBe('false');
		expect(config.define.__OCTANE_PROFILE_ENABLED__).toBe('false');

		const plain = octane();
		configure(plain, 'build');
		expect(await transform(withDevtools)).toBe(await transform(plain));
	});

	it('keeps devtools off for an explicit server-only compiler', () => {
		const plugin = octane({ devtools: true, ssr: true });
		const config = configure(plugin, 'serve') as { define: Record<string, string> };
		expect(config.define.__OCTANE_DEVTOOLS_ENABLED__).toBe('false');
	});

	it('protects the reserved devtools constant throughout Vite config resolution', () => {
		const plugin = octane({ devtools: true });
		expect(() =>
			(plugin.config as any)(
				{ root: appRoot, define: { __OCTANE_DEVTOOLS_ENABLED__: 'false' } },
				{ command: 'serve' },
			),
		).toThrow(/__OCTANE_DEVTOOLS_ENABLED__.*reserved/);

		const conflicting = octane({ devtools: true });
		(conflicting.config as any)({ root: appRoot }, { command: 'serve' });
		expect(() =>
			(conflicting.configResolved as any)({
				root: appRoot,
				command: 'serve',
				define: { __OCTANE_DEVTOOLS_ENABLED__: 'false' },
			}),
		).toThrow(/__OCTANE_DEVTOOLS_ENABLED__.*reserved/);
	});
});
