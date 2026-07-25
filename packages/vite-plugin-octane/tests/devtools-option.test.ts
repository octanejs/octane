// `octane({ devtools: true })` opts into the compiler's profile mode in DEV
// ONLY: the reserved `__OCTANE_PROFILE_ENABLED__` define — the constant that
// makes production erase every profiling branch — is `true` in `vite dev`
// (command === 'serve') and `false` in `vite build`, so a production bundle
// tree-shakes profiling away. An explicit `profile` always wins over `devtools`.
//
// The define is produced by the bundled compiler plugin's `config` hook (the
// first element of octane()'s plugin array), which is where Vite's command
// first becomes observable — so these assertions drive that hook directly.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { octane } from '../src/index.js';

const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';

type ConfigHook = (
	userConfig: { root: string },
	env: { command: 'serve' | 'build'; mode?: string },
) => unknown | Promise<unknown>;

// An empty project root: no octane.config.ts, so the compiler plugin's `config`
// hook resolves synchronously (awaiting a plain value is a no-op) and dependency
// discovery has nothing to crawl.
async function withEmptyRoot(run: (root: string) => Promise<void>): Promise<void> {
	const root = await mkdtemp(join(tmpdir(), 'octane-devtools-'));
	try {
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function profileDefine(
	config: ConfigHook,
	root: string,
	command: 'serve' | 'build',
): Promise<unknown> {
	const result = (await config({ root }, { command })) as { define?: Record<string, unknown> };
	return result?.define?.[PROFILE_DEFINE];
}

describe('octane({ devtools }) profiling define', () => {
	it('enables profiling in vite dev and disables it in vite build', async () => {
		await withEmptyRoot(async (root) => {
			const [compiler] = octane({ devtools: true });
			const config = compiler.config as ConfigHook;

			expect(await profileDefine(config, root, 'serve')).toBe(JSON.stringify(true));
			expect(await profileDefine(config, root, 'build')).toBe(JSON.stringify(false));
		});
	});

	it('lets an explicit profile override devtools', async () => {
		await withEmptyRoot(async (root) => {
			// `profile: false` forces profiling off even in dev, ignoring devtools.
			const [off] = octane({ devtools: true, profile: false });
			const offConfig = off.config as ConfigHook;
			expect(await profileDefine(offConfig, root, 'serve')).toBe(JSON.stringify(false));

			// `profile: true` forces profiling on even in a production build.
			const [on] = octane({ devtools: false, profile: true });
			const onConfig = on.config as ConfigHook;
			expect(await profileDefine(onConfig, root, 'build')).toBe(JSON.stringify(true));
		});
	});

	it('leaves profiling off with neither option', async () => {
		await withEmptyRoot(async (root) => {
			const [compiler] = octane({});
			const config = compiler.config as ConfigHook;
			expect(await profileDefine(config, root, 'serve')).toBe(JSON.stringify(false));
			expect(await profileDefine(config, root, 'build')).toBe(JSON.stringify(false));
		});
	});
});
