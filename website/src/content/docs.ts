// The docs registry: slug → compiled MDX document (+ sidebar metadata).
// Static imports keep every document in both module graphs (server-compiled
// for SSR, client-compiled for hydration/navigation) — fine at this scale.
import QuickStart from './docs/quick-start.mdx';
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
		sections: [
			{ id: 'install', title: 'Install and configure' },
			{ id: 'first-component', title: 'Your first component' },
			{ id: 'mount', title: 'Connect it to the page' },
			{ id: 'tsrx-at-a-glance', title: 'TSRX at a glance' },
		],
		component: QuickStart as DocEntry['component'],
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
		sections: [
			{ id: 'which-should-i-use', title: 'Which should I use?' },
			{ id: 'component-bodies', title: 'Component bodies' },
			{ id: 'rendered-control-flow', title: 'Rendered control flow' },
			{ id: 'text-holes', title: 'Text holes' },
		],
		component: TsrxVsTsx as DocEntry['component'],
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
