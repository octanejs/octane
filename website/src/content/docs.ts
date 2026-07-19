// The docs registry: slug → compiled MDX document (+ sidebar metadata).
// Static imports keep every document in both module graphs (server-compiled
// for SSR, client-compiled for hydration/navigation) — fine at this scale.
// The component-free metadata lives in docs-meta.ts (shared with the remote
// MCP server); this module zips it with the compiled components.
import QuickStart from './docs/quick-start.mdx';
import BuildTools from './docs/build-tools.mdx';
import CoreApis from './docs/core-apis.mdx';
import TsrxVsTsx from './docs/tsrx-vs-tsx.mdx';
import DifferencesFromReact from './docs/differences-from-react.mdx';
import ReactCompat from './docs/react-compat.mdx';
import Bindings from './docs/bindings.mdx';
import Profiling from './docs/profiling.mdx';
import { docsMeta, type DocMeta, type DocSection } from './docs-meta.ts';

export type { DocSection };

export interface DocEntry extends DocMeta {
	component: (props?: Record<string, unknown>) => unknown;
}

const components: Record<string, DocEntry['component']> = {
	'quick-start': QuickStart,
	'build-tools': BuildTools,
	'core-apis': CoreApis,
	'tsrx-vs-tsx': TsrxVsTsx,
	'differences-from-react': DifferencesFromReact,
	'react-compat': ReactCompat,
	profiling: Profiling,
	bindings: Bindings,
};

export const docs: DocEntry[] = docsMeta.map((meta) => {
	const component = components[meta.slug];
	if (!component) throw new Error(`docs-meta.ts entry '${meta.slug}' has no MDX import in docs.ts`);
	return { ...meta, component };
});

export const docGroups = ['Start here', 'Learn Octane', 'Explore'].map((title) => ({
	title,
	docs: docs.filter((doc) => doc.group === title),
}));

export const defaultDoc = docs[0];

export function findDoc(slug: string | undefined): DocEntry | undefined {
	if (!slug) return defaultDoc;
	return docs.find((d) => d.slug === slug);
}
