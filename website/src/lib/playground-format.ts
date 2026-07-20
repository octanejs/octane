// Client-side Prettier for the playground's Format button. Everything loads
// lazily on first use: `prettier/standalone` plus `@tsrx/prettier-plugin`
// (pure JS — @tsrx/core parser + prettier doc builders) for `.tsrx`, or
// prettier's typescript/estree plugins for `.tsx` / `.react.tsx`. The
// plugin's `import { doc } from 'prettier'` is satisfied in the browser by
// the vite alias `prettier` → `prettier/standalone` (website/vite.config.ts).
//
// Client-only: load via dynamic import from an event handler (never SSR).
import { isReactHostFile } from './playground-modules.ts';

// Mirrors the repo's .prettierrc (and the editor's tabSize: 2).
const OPTIONS = {
	useTabs: true,
	tabWidth: 2,
	singleQuote: true,
	printWidth: 100,
} as const;

export type FormatResult = { ok: true; code: string } | { ok: false; error: string };

/** Format one playground file by dialect. Never throws. */
export async function formatPlaygroundFile(name: string, source: string): Promise<FormatResult> {
	try {
		// estree is needed in BOTH branches: in the standalone build the core
		// format options (singleQuote, useTabs, …) are declared by the estree
		// plugin — without it they are silently dropped as unknown.
		const [{ format }, estree] = await Promise.all([
			import('prettier/standalone'),
			import('prettier/plugins/estree'),
		]);
		let formatted: string;
		if (!isReactHostFile(name) && name.endsWith('.tsrx')) {
			const tsrxPlugin = await import('@tsrx/prettier-plugin');
			formatted = await format(source, {
				...OPTIONS,
				parser: 'tsrx',
				plugins: [tsrxPlugin, estree],
			});
		} else {
			const typescript = await import('prettier/plugins/typescript');
			formatted = await format(source, {
				...OPTIONS,
				parser: 'typescript',
				plugins: [typescript, estree],
			});
		}
		return { ok: true, code: formatted };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
