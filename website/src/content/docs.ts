// The docs registry: slug → compiled MDX document (+ sidebar metadata).
// Static imports keep every document in both module graphs (server-compiled
// for SSR, client-compiled for hydration/navigation) — fine at this scale.
import QuickStart from './docs/quick-start.mdx';
import BuildTools from './docs/build-tools.mdx';
import CoreApis from './docs/core-apis.mdx';
import TsrxVsTsx from './docs/tsrx-vs-tsx.mdx';
import DifferencesFromReact from './docs/differences-from-react.mdx';
import Bindings from './docs/bindings.mdx';

export interface DocEntry {
	slug: string;
	title: string;
	description: string;
	group: 'Start here' | 'Learn Octane' | 'Explore';
	sections?: readonly DocSection[];
	component: (props?: Record<string, unknown>) => unknown;
}

export interface DocSection {
	id: string;
	title: string;
}

export const docs: DocEntry[] = [
	{
		slug: 'quick-start',
		title: 'Quick start',
		description: 'Install octane, mount a component, and learn the .tsrx essentials.',
		group: 'Start here',
		component: QuickStart as DocEntry['component'],
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
		component: BuildTools as DocEntry['component'],
	},
	{
		slug: 'core-apis',
		title: 'Core APIs',
		description:
			'Learn how components, state, events, context, effects, async UI, and rendering fit together.',
		group: 'Learn Octane',
		sections: [
			{ id: 'mental-model', title: 'The mental model' },
			{ id: 'components-and-props', title: 'Components and props' },
			{ id: 'state-and-events', title: 'State and events' },
			{ id: 'lists-and-conditions', title: 'Lists and conditions' },
			{ id: 'context', title: 'Sharing data' },
			{ id: 'refs-and-effects', title: 'Refs and effects' },
			{ id: 'async-ui', title: 'Loading data and code' },
			{ id: 'responsive-updates', title: 'Responsive updates' },
			{ id: 'roots-and-rendering', title: 'Roots and rendering' },
			{ id: 'server-rendering', title: 'Server rendering' },
			{ id: 'api-index', title: 'API index' },
			{ id: 'practice', title: 'Practice' },
			{ id: 'next-steps', title: 'Next steps' },
		],
		component: CoreApis as DocEntry['component'],
	},
	{
		slug: 'tsrx-vs-tsx',
		title: 'TSRX vs TSX/JSX',
		description: 'When to author in .tsrx versus standard .tsx/.jsx, and what each unlocks.',
		group: 'Learn Octane',
		component: TsrxVsTsx as DocEntry['component'],
	},
	{
		slug: 'differences-from-react',
		title: 'Differences from React',
		description: 'The deliberate divergences — everything else matching React is the point.',
		group: 'Explore',
		component: DifferencesFromReact as DocEntry['component'],
	},
	{
		slug: 'bindings',
		title: 'Bindings',
		description: 'Find Octane bindings for state, data fetching, routing, UI, forms, and more.',
		group: 'Explore',
		sections: [
			{ id: 'find-a-binding', title: 'Find a binding' },
			{ id: 'install-and-use', title: 'Install and use' },
			{ id: 'check-support', title: 'Check support' },
			{ id: 'app-tooling', title: 'App tooling' },
		],
		component: Bindings as DocEntry['component'],
	},
];

export const docGroups = ['Start here', 'Learn Octane', 'Explore'].map((title) => ({
	title,
	docs: docs.filter((doc) => doc.group === title),
}));

export const defaultDoc = docs[0];

export function findDoc(slug: string | undefined): DocEntry | undefined {
	if (!slug) return defaultDoc;
	return docs.find((d) => d.slug === slug);
}
