// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';

const ROOT = '/project';
const SOURCE = "export function App() @{ <main>{'configured'}</main> }\n";
const STATEFUL_SOURCE =
	"import { useState } from 'octane';\n" +
	'export function App() @{\n' +
	'\tconst [count] = useState(0);\n' +
	'\t<main>{count as string}</main>\n' +
	'}\n';

function configure(plugin: Plugin, command: 'serve' | 'build', build: { ssr?: boolean } = {}) {
	(plugin.config as (config: { root: string }) => unknown)({ root: ROOT });
	(plugin.configResolved as (config: unknown) => void)({
		root: ROOT,
		command,
		build,
		define: {},
	});
}

async function transform(
	plugin: Plugin,
	source = SOURCE,
	id = `${ROOT}/src/App.tsrx`,
	options?: { ssr?: boolean },
) {
	return (
		plugin.transform as (source: string, id: string, options?: { ssr?: boolean }) => unknown
	).call({}, source, id, options) as Promise<{ code: string } | null> | { code: string } | null;
}

describe('octane/compiler/vite public options', () => {
	it('changes emitted hot-update support for both hmr values', async () => {
		const enabled = octane({ hmr: true });
		const disabled = octane({ hmr: false });
		configure(enabled, 'serve');
		configure(disabled, 'serve');

		const enabledOutput = await transform(enabled);
		const disabledOutput = await transform(disabled);

		expect(enabledOutput?.code).toContain('import.meta.hot');
		expect(disabledOutput?.code).not.toContain('import.meta.hot');
	});

	it('forces server output despite a client transform signal', async () => {
		const plugin = octane({ hmr: false, ssr: true });
		configure(plugin, 'build', { ssr: false });

		const output = await transform(plugin, STATEFUL_SOURCE, `${ROOT}/src/App.tsrx`, {
			ssr: false,
		});

		expect(output?.code).toMatch(/from ["']octane\/server["']/);
	});

	it('forces client output despite a server transform signal', async () => {
		const plugin = octane({ hmr: false, ssr: false });
		configure(plugin, 'build', { ssr: true });

		const output = await transform(plugin, STATEFUL_SOURCE, `${ROOT}/src/App.tsrx`, {
			ssr: true,
		});

		expect(output?.code).not.toMatch(/from ["']octane\/server["']/);
	});

	it('changes ownership of an unmarked project TSX module for both directive values', async () => {
		const source = "export function App() @{ <main>{'owned'}</main> }\n";
		for (const ssr of [false, true]) {
			for (const options of [{}, { requireDirective: false }] as const) {
				const plugin = octane({ hmr: false, ...options });
				configure(plugin, 'build', { ssr });
				expect(await transform(plugin, source, `${ROOT}/src/App.tsx`, { ssr })).not.toBeNull();
			}

			const gated = octane({ hmr: false, requireDirective: true });
			configure(gated, 'build', { ssr });
			expect(await transform(gated, source, `${ROOT}/src/App.tsx`, { ssr })).toBeNull();
		}
	});
});
