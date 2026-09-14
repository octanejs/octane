import {
	packageRewrite,
	differentialSetup,
} from '../../../../test-utils/differential-precompile.js';

export const { setup, teardown } = differentialSetup({
	fixtureDir: new URL('../_fixtures/', import.meta.url),
	cacheDir: new URL('./.react-cache/', import.meta.url),
	rewrites: [
		packageRewrite('@octanejs/tiptap', '@tiptap/react'),
		[/\bconst\s+paritySide\s*=\s*["']octane["']/g, 'const paritySide = "react"'],
	],
	fixtures: ['basic-editor.tsrx', 'custom-views-parity.tsrx', 'custom-views-as-prop-parity.tsrx'],
	depsFrom: import.meta.url,
});
