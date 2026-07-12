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
	component: (props?: Record<string, unknown>) => unknown;
}

export const docs: DocEntry[] = [
	{
		slug: 'quick-start',
		title: 'Quick start',
		description: 'Install octane, mount a component, and learn the .tsrx essentials.',
		component: QuickStart as DocEntry['component'],
	},
	{
		slug: 'core-apis',
		title: 'Core APIs',
		description: 'Roots, components, hooks, boundaries, transitions, actions, and SSR.',
		component: CoreApis as DocEntry['component'],
	},
	{
		slug: 'tsrx-vs-tsx',
		title: 'TSRX vs TSX/JSX',
		description: 'When to author in .tsrx versus standard .tsx/.jsx, and what each unlocks.',
		component: TsrxVsTsx as DocEntry['component'],
	},
	{
		slug: 'differences-from-react',
		title: 'Differences from React',
		description: 'The deliberate divergences — everything else matching React is the point.',
		component: DifferencesFromReact as DocEntry['component'],
	},
	{
		slug: 'bindings',
		title: 'Bindings',
		description: 'The @octanejs/* ports of the React ecosystem.',
		component: Bindings as DocEntry['component'],
	},
];

export const defaultDoc = docs[0];

export function findDoc(slug: string | undefined): DocEntry | undefined {
	if (!slug) return defaultDoc;
	return docs.find((d) => d.slug === slug);
}
