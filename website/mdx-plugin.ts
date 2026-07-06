// LOCAL COPY of @octanejs/mdx's vite plugin (packages/mdx/src/vite.ts).
//
// GAP workaround: `import { octaneMdx } from '@octanejs/mdx/vite'` fails when
// the importer is a real consumer's vite.config.ts — Vite loads the config
// through Node's native ESM loader (with type stripping), and vite.ts's
// extensionless `import { compileMdx } from './compile'` is not resolvable
// there (ERR_MODULE_NOT_FOUND …/packages/mdx/src/compile). It only works in
// this repo's vitest configs because vite-node resolves extensionless TS.
// `@octanejs/mdx/compile` itself has NO relative imports, so importing it
// directly is fine. Delete this file once the package uses './compile.ts'.
import { compileMdx, type CompileMdxOptions } from '@octanejs/mdx/compile';

export interface OctaneMdxPluginOptions extends Omit<CompileMdxOptions, 'mode' | 'hmr' | 'dev'> {
	ssr?: boolean;
	md?: boolean;
	hmr?: boolean;
}

export function octaneMdx(options: OctaneMdxPluginOptions = {}) {
	const { ssr: forceSsr, md, hmr, ...compileOptions } = options;
	let hmrEnabled = hmr;
	const includeMd = md !== false;
	return {
		name: 'octane-mdx',
		enforce: 'pre' as const,
		configResolved(config: { command: string }) {
			if (hmrEnabled === undefined) hmrEnabled = config.command === 'serve';
		},
		async transform(this: unknown, code: string, id: string, transformOptions?: { ssr?: boolean }) {
			const [file, query = ''] = id.split('?');
			if (!(file.endsWith('.mdx') || (includeMd && file.endsWith('.md')))) return null;
			if (/(^|&)(raw|url|inline|worker|sharedworker)(=|&|$)/.test(query)) return null;
			const ssr =
				forceSsr !== undefined
					? forceSsr
					: transformOptions?.ssr === true ||
						(this as { environment?: { config?: { consumer?: string } } }).environment?.config
							?.consumer === 'server';
			return compileMdx(code, file, {
				...compileOptions,
				mode: ssr ? 'server' : 'client',
				hmr: !ssr && !!hmrEnabled,
				dev: !ssr && !!hmrEnabled,
			});
		},
	};
}
