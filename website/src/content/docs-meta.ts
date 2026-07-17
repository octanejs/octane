// The component-free half of the docs registry: slug, titles, grouping,
// sidebar sections, and search hints — everything about a doc EXCEPT its
// compiled MDX component. docs.ts zips this with the MDX imports for the
// site; the remote MCP server (mcp/) imports only this file plus the raw
// .mdx sources, so it never pulls compiled components into its bundle.
// Its import chain must stay MDX-free (bindings.ts is JSON-only).
import { BINDING_CATEGORIES, BINDING_COUNT } from './bindings.ts';

export interface DocSection {
	id: string;
	title: string;
}

export interface DocMeta {
	slug: string;
	title: string;
	description: string;
	group: 'Start here' | 'Learn Octane' | 'Explore';
	sections?: readonly DocSection[];
	searchTerms?: readonly string[];
}

export const docsMeta: DocMeta[] = [
	{
		slug: 'quick-start',
		title: 'Quick start',
		description: 'Install octane, mount a component, and learn the .tsrx essentials.',
		group: 'Start here',
		sections: [
			{ id: 'install', title: 'Install and configure' },
			{ id: 'first-component', title: 'Your first component' },
			{ id: 'mount', title: 'Connect it to the page' },
			{ id: 'tsrx-at-a-glance', title: 'TSRX at a glance' },
		],
	},
	{
		slug: 'build-tools',
		title: 'Build tools',
		description: 'Configure Vite, Rspack, or Rsbuild for Octane apps.',
		group: 'Start here',
		sections: [
			{ id: 'choose-an-integration', title: 'Choose an integration' },
			{ id: 'vite', title: 'Vite' },
			{ id: 'rspack', title: 'Rspack' },
			{ id: 'rsbuild', title: 'Rsbuild' },
			{ id: 'full-app-configuration', title: 'Full app configuration' },
			{ id: 'production-and-preview', title: 'Production and preview' },
			{ id: 'renderer-targets', title: 'Renderer targets' },
		],
	},
	{
		slug: 'core-apis',
		title: 'Core APIs',
		description:
			'Learn how components, state, events, context, effects, async UI, deferred hydration, and rendering fit together.',
		group: 'Learn Octane',
		sections: [
			{ id: 'mental-model', title: 'The mental model' },
			{ id: 'components-and-props', title: 'Components and props' },
			{ id: 'state-and-events', title: 'State and events' },
			{ id: 'lists-and-conditions', title: 'Lists and conditions' },
			{ id: 'context', title: 'Sharing data' },
			{ id: 'refs-and-effects', title: 'Refs and effects' },
			{ id: 'async-ui', title: 'Loading data and code' },
			{ id: 'deferred-hydration', title: 'Deferred hydration' },
			{ id: 'responsive-updates', title: 'Responsive updates' },
			{ id: 'roots-and-rendering', title: 'Roots and rendering' },
			{ id: 'server-rendering', title: 'Server rendering' },
			{ id: 'api-index', title: 'API index' },
			{ id: 'practice', title: 'Practice' },
			{ id: 'next-steps', title: 'Next steps' },
		],
	},
	{
		slug: 'tsrx-vs-tsx',
		title: 'TSRX vs TSX/JSX',
		description: 'When to author in .tsrx versus standard .tsx/.jsx, and what each unlocks.',
		group: 'Learn Octane',
		sections: [
			{ id: 'which-should-i-use', title: 'Which should I use?' },
			{ id: 'component-bodies', title: 'Component bodies' },
			{ id: 'rendered-control-flow', title: 'Rendered control flow' },
			{ id: 'text-holes', title: 'Text holes' },
		],
	},
	{
		slug: 'differences-from-react',
		title: 'Differences from React',
		description: 'The deliberate divergences — everything else matching React is the point.',
		group: 'Explore',
		sections: [
			{ id: 'hooks', title: 'Hooks' },
			{ id: 'events-and-dom', title: 'Events and the DOM' },
			{ id: 'async-work', title: 'Async work' },
			{ id: 'errors-and-server', title: 'Errors and server rendering' },
			{ id: 'not-supported', title: 'APIs left out' },
		],
	},
	{
		slug: 'profiling',
		title: 'Profiling',
		description:
			'Profile component renders, render causes, and schedule-to-render delay in Chrome.',
		group: 'Explore',
		sections: [
			{ id: 'enable-profiling', title: 'Enable profiling' },
			{ id: 'record-in-chrome', title: 'Record in Chrome' },
			{ id: 'console-api', title: 'Console API' },
			{ id: 'reading-the-data', title: 'Reading the data' },
			{ id: 'render-causes', title: 'Render causes' },
			{ id: 'cost-and-privacy', title: 'Cost and privacy' },
		],
	},
	{
		slug: 'bindings',
		title: 'Bindings',
		description: `Browse all ${BINDING_COUNT} Octane bindings for state, data, routing, UI, forms, and more.`,
		group: 'Explore',
		searchTerms: BINDING_CATEGORIES.flatMap((category) => [
			category.title,
			category.description,
			...category.packages,
		]),
		sections: [
			{ id: 'find-a-binding', title: 'Find a binding' },
			{ id: 'install-and-use', title: 'Install and use' },
			{ id: 'check-support', title: 'Check support' },
		],
	},
];
