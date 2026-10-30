import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vitest/config';

// The pinned __tests__/setup.ts forces React Native entry points "like Metro does"
// with a table of [specifier, native file] pairs. Read it from the pin so the Vitest
// lanes apply exactly that table.
export function readNativeModuleOverrides(upstreamRoot: string) {
	const setup = readFileSync(resolve(upstreamRoot, '__tests__/setup.ts'), 'utf8');
	const table = new Map<string, string>();
	for (const [, specifier, nativePath] of setup.matchAll(
		/\["(@\/[^"]+)",\s*"\.\.\/(src\/[^"]+)"\]/g,
	)) {
		table.set(specifier, nativePath);
	}
	if (table.size === 0) throw new Error('No native module overrides found in the pinned setup.ts');
	return table;
}

export const NATIVE_MODULE_OVERRIDES = readNativeModuleOverrides(
	process.env.LEGENDAPP_LIST_PRISTINE_ROOT ?? resolve(import.meta.dirname, '../../upstream'),
);

/**
 * bun's mock.module replaces a module wherever it resolves, so a test importing
 * ../../src/platform/Platform sees the same native module as source importing
 * @/platform/Platform. This redirects by resolved path to reproduce that, for each
 * table entry whose web module exists under `source`. `platformOnly` skips the
 * React components and hooks in the table, which the adapted lane takes from this
 * package's Octane port.
 */
export function nativeEntryPoints(
	upstreamRoot: string,
	source: string,
	{ platformOnly = false } = {},
): Plugin {
	const redirects = new Map<string, string>();
	for (const [specifier, nativePath] of readNativeModuleOverrides(upstreamRoot)) {
		const native = resolve(upstreamRoot, nativePath);
		if (platformOnly && /from ["']react["']/.test(readFileSync(native, 'utf8'))) continue;
		const base = resolve(source, specifier.slice(2));
		const web = ['.ts', '.tsx', '.tsrx'].map((extension) => base + extension).find(existsSync);
		if (web) redirects.set(web, native);
	}
	return {
		name: 'legendapp-list-native-entry-points',
		enforce: 'pre',
		async resolveId(id, importer, options) {
			if (!importer || id.startsWith('\0')) return null;
			const resolved = await this.resolve(id, importer, { ...options, skipSelf: true });
			const redirect = resolved && redirects.get(resolved.id);
			return redirect ? { id: redirect } : null;
		},
	};
}
