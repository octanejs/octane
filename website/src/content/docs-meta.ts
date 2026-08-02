// The component-free half of the docs registry: slug, titles, grouping,
// sidebar sections, and search hints — everything about a doc EXCEPT its
// compiled MDX component. docs.ts zips this with the MDX imports for the
// site; the remote MCP server (mcp/) imports only this file plus the raw
// .mdx sources, so it never pulls compiled components into its bundle.
// Its import chain must stay MDX-free (the imported catalogs are JSON-backed).
import { BINDING_CATEGORIES, BINDING_COUNT } from './bindings.ts';
import { FRAMEWORK_INTEGRATIONS, FRAMEWORK_INTEGRATION_COUNT } from './framework-integrations.ts';

export interface DocSection {
	id: string;
	title: string;
	// Heading depth for the "On this page" tree: 2 for a top-level `<h2>` section
	// (the default), 3 for an `<h2>` subsection anchored by an `<h3>`. Only the
	// table of contents reads this; the search index is built from `<h2>` anchors.
	level?: 2 | 3;
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
		description:
			'Scaffold a new Octane app, or add Octane to an existing project, and learn the .tsrx essentials.',
		group: 'Start here',
		searchTerms: [
			'npm create octane',
			'create-octane',
			'scaffold',
			'new project',
			'--template',
			'spa',
			'fullstack',
		],
		sections: [
			{ id: 'scaffold', title: 'Create a new app' },
			{ id: 'install', title: 'Install into an existing project' },
			{ id: 'first-component', title: 'Your first component' },
			{ id: 'mount', title: 'Connect it to the page' },
			{ id: 'tsrx-at-a-glance', title: 'TSRX at a glance' },
			{ id: 'next', title: 'Next' },
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
			{ id: 'strong-mode', title: 'Strong mode' },
			{ id: 'full-app-configuration', title: 'Full app configuration' },
			{ id: 'production-and-preview', title: 'Production and preview' },
			{ id: 'renderer-targets', title: 'Renderer targets' },
			{ id: 'mixed-toolchains', title: 'Mixed toolchains and file ownership' },
		],
	},
	{
		slug: 'framework-integrations',
		title: 'Framework integrations',
		description: `Use Octane with ${FRAMEWORK_INTEGRATION_COUNT} app frameworks through first-party integrations.`,
		group: 'Start here',
		searchTerms: FRAMEWORK_INTEGRATIONS.flatMap((integration) => [
			integration.title,
			integration.packageName,
			integration.model,
			integration.description,
			...(integration.packageName === '@octanejs/tanstack-start'
				? [
						'@octanejs/tanstack-router',
						'@octanejs/tanstack-query',
						'@octanejs/tanstack-form',
						'TanStack bindings',
					]
				: []),
		]),
		sections: [
			{ id: 'choose-a-framework', title: 'Find the right integration' },
			{ id: 'astro', title: 'Astro islands' },
			{ id: 'docusaurus', title: 'Docusaurus content sites' },
			{ id: 'tanstack-start', title: 'TanStack Start applications' },
		],
	},
	{
		slug: 'cli',
		title: 'CLI',
		description:
			'Diagnose a project with octane doctor, wire Octane in, install bindings, and decode runtime errors.',
		group: 'Start here',
		searchTerms: [
			'octane doctor',
			'octane analyze',
			'octane create',
			'npm create octane',
			'create-octane',
			'scaffold',
			'new project',
			'--template',
			'spa',
			'fullstack',
			'octane init',
			'octane add',
			'octane explain',
			'octane mcp',
			'@octanejs/cli',
			'duplicate runtime',
			'jsxImportSource',
			'tsrx-tsc',
			'exit code',
		],
		sections: [
			{ id: 'install', title: 'Install' },
			{ id: 'doctor', title: 'octane doctor' },
			{ id: 'fixing', title: 'Fixing what it finds', level: 3 },
			{ id: 'analyze', title: 'octane analyze' },
			{ id: 'create', title: 'octane create' },
			{ id: 'init', title: 'octane init' },
			{ id: 'bindings', title: 'Bindings and errors' },
			{ id: 'mcp', title: 'octane mcp' },
			{ id: 'agents-and-ci', title: 'Agents and CI' },
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
			{ id: 'use-linked-state', title: 'useLinkedState', level: 3 },
			{ id: 'strong-mode', title: 'Strong mode', level: 3 },
			{ id: 'lists-and-conditions', title: 'Lists and conditions' },
			{ id: 'context', title: 'Sharing data' },
			{ id: 'refs-and-effects', title: 'Refs and effects' },
			{ id: 'use-sync-external-store', title: 'useSyncExternalStore', level: 3 },
			{ id: 'async-ui', title: 'Loading data and code' },
			{ id: 'deferred-hydration', title: 'Deferred hydration' },
			{ id: 'responsive-updates', title: 'Responsive updates' },
			{ id: 'use-transition', title: 'useTransition', level: 3 },
			{ id: 'use-deferred-value', title: 'useDeferredValue', level: 3 },
			{ id: 'view-transitions', title: 'ViewTransition', level: 3 },
			{ id: 'roots-and-rendering', title: 'Roots and rendering' },
			{ id: 'create-portal', title: 'createPortal', level: 3 },
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
			{ id: 'next', title: 'Next' },
		],
	},
	{
		slug: 'differences-from-react',
		title: 'Differences from React',
		description: 'The deliberate divergences — everything else matching React is the point.',
		group: 'Explore',
		sections: [
			{ id: 'hooks', title: 'Hooks' },
			{ id: 'strong-mode', title: 'Strong mode' },
			{ id: 'events-and-dom', title: 'Events and the DOM' },
			{ id: 'async-work', title: 'Async work' },
			{ id: 'errors-and-server', title: 'Errors and server rendering' },
			{ id: 'not-supported', title: 'APIs left out' },
		],
	},
	{
		slug: 'react-compat',
		title: 'React compatibility',
		description: 'Host compiled Octane islands inside an existing React 19 app with OctaneCompat.',
		group: 'Explore',
		searchTerms: ['OctaneCompat', 'octane/react', 'islands', 'migrate', 'interop', 'React 19'],
		sections: [
			{ id: 'what-is-octanecompat', title: 'What OctaneCompat is' },
			{ id: 'set-up', title: 'Set up the toolchain' },
			{ id: 'render-an-island', title: 'Render an island' },
			{ id: 'react-context', title: 'Share React context' },
			{ id: 'server-rendering', title: 'Server rendering and hydration' },
			{ id: 'not-supported', title: "What isn't supported" },
			{ id: 'editor-and-type-checking', title: 'Editor and type checking' },
			{ id: 'next', title: 'Next' },
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
		slug: 'publishing-libraries',
		title: 'Publishing libraries',
		description:
			'Ship complete importable Octane source so each application compiles libraries against its installed runtime.',
		group: 'Explore',
		searchTerms: [
			'library author',
			'package author',
			'raw source',
			'npm publish',
			'npm pack',
			'peerDependencies',
			'package exports',
			'hookSlots',
		],
		sections: [
			{ id: 'source-package-contract', title: 'The source-package contract' },
			{ id: 'package-the-source', title: 'Package the source' },
			{ id: 'authoring-and-types', title: 'Authoring and types' },
			{ id: 'package-metadata', title: 'Package metadata' },
			{ id: 'verify-the-package', title: 'Verify the package' },
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
