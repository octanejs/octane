// Shared @octanejs/mdx pipeline options — imported by BOTH website/vite.config.ts
// (the app) and the root vitest.config.js website project (the smoke tests), so
// tests compile .mdx documents through the exact pipeline the site ships.
import rehypeShiki from '@shikijs/rehype';

export const websiteMdxOptions = {
	rehypePlugins: [
		[
			rehypeShiki,
			{
				// Dark-first site — match the react.dev-style code panel.
				theme: 'github-dark',
				// `.tsrx` is octane's dialect; shiki has no grammar for it, so alias it
				// to `tsx` (close enough — directives like `@if` render as plain text).
				langAlias: { tsrx: 'tsx' },
				// Unknown fence languages render as plain text instead of throwing.
				fallbackLanguage: 'text',
			},
		],
	] as any[],
};
