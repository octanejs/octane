// Shared @octanejs/mdx pipeline options — imported by BOTH website/vite.config.ts
// (the app) and the root vitest.config.js website project (the smoke tests), so
// tests compile .mdx documents through the exact pipeline the site ships.
//
// This module is only ever evaluated in Node (vite config / vitest config /
// plugin transform), so the TSRX grammar is loaded with readFileSync rather
// than a JSON-module import — Node's native config loader would demand
// `with { type: 'json' }` while vite-node has its own JSON handling.
import { readFileSync } from 'node:fs';
import rehypeShiki from '@shikijs/rehype';

// The real TSRX TextMate grammar (name "TSRX", scopeName "source.tsrx" — it
// tokenizes @{ }, @if/@for/@switch/@try directives, holes, the works). Same
// wiring as the reference implementation: spread with embeddedLangs so the
// JSX/TS/CSS islands inside .tsrx highlight through their own grammars.
const tsrxGrammar = JSON.parse(
	readFileSync(new URL('./src/assets/tsrx.tmLanguage.json', import.meta.url), 'utf-8'),
);

const modifiedTsrxGrammar = {
	...tsrxGrammar,
	embeddedLangs: ['jsx', 'tsx', 'css'],
};

export const websiteMdxOptions = {
	rehypePlugins: [
		[
			rehypeShiki,
			{
				// Dark-first site — match the code panel.
				theme: 'github-dark',
				// Explicit `langs` replaces shiki's all-bundled default set: list the
				// fence languages the site actually uses, plus the TSRX grammar twice —
				// once under its own name ("TSRX") and once lowercased so ```tsrx
				// fences resolve (the reference registers the second copy the same way).
				langs: [
					'javascript',
					'typescript',
					'jsx',
					'tsx',
					'css',
					'bash',
					modifiedTsrxGrammar,
					{ ...modifiedTsrxGrammar, name: 'tsrx' },
				],
				// Unknown fence languages render as plain text instead of throwing.
				fallbackLanguage: 'text',
			},
		],
	] as any[],
};
