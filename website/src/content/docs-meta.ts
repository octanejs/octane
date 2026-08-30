// The component-free half of the docs registry: slug, titles, grouping,
// sidebar sections, and search hints — everything about a doc EXCEPT its
// compiled MDX component. docs.ts zips this with the MDX imports for the
// site; the remote MCP server (mcp/) imports only this file plus the raw
// .mdx sources, so it never pulls compiled components into its bundle.
// Its import chain must stay MDX-free (the imported catalogs are JSON-backed).
import { BINDING_COUNT } from './bindings.ts';
import { FRAMEWORK_INTEGRATION_COUNT } from './framework-integrations.ts';

export interface DocSection {
	id: string;
	title: string;
	/** Metadata-only aliases that should land on this exact indexed `<h2>` in search. */
	searchTerms?: readonly string[];
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
			{ id: 'first-component', title: 'Build your first component' },
			{ id: 'mount', title: 'Connect it to the page' },
			{
				id: 'tsrx-at-a-glance',
				title: 'TSRX at a glance',
				searchTerms: ['VSCode', 'VSCode extension', 'TSRX VSCode'],
			},
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
			{ id: 'mixed-toolchains', title: 'Mixed toolchains and file ownership' },
			{ id: 'full-app-configuration', title: 'Full app configuration' },
			{ id: 'production-and-preview', title: 'Production and preview' },
			{ id: 'renderer-targets', title: 'Renderer targets' },
		],
	},
	{
		slug: 'framework-integrations',
		title: 'Framework integrations',
		description: `Use Octane with ${FRAMEWORK_INTEGRATION_COUNT} app frameworks through first-party integrations.`,
		group: 'Start here',
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
			{
				id: 'use-linked-state',
				title: 'Keep editable state in sync with useLinkedState',
				level: 3,
			},
			{ id: 'strong-mode', title: 'Enforce render snapshots with Strong mode', level: 3 },
			{ id: 'lists-and-conditions', title: 'Lists and conditions' },
			{ id: 'context', title: 'Sharing data with context' },
			{ id: 'refs-and-effects', title: 'Refs and effects' },
			{
				id: 'use-sync-external-store',
				title: 'Subscribe to external state with useSyncExternalStore',
				level: 3,
			},
			{ id: 'async-ui', title: 'Loading data and code' },
			{ id: 'deferred-hydration', title: 'Deferred hydration' },
			{
				id: 'behavior-only-roots',
				title: 'Behavior-only roots and external ownership',
				searchTerms: [
					'attachBehaviorRoot',
					'octane/behavior',
					'registerExternalRange',
					'registerBehavior',
					'external ownership',
					'externally owned DOM',
					'behavior-only root',
					'permanent static',
					'streamed DOM',
					'preserveDOM',
				],
			},
			{ id: 'responsive-updates', title: 'Responsive updates and actions' },
			{
				id: 'use-transition',
				title: 'Keep the current screen with useTransition',
				level: 3,
			},
			{
				id: 'use-deferred-value',
				title: 'Let a slow view lag with useDeferredValue',
				level: 3,
			},
			{
				id: 'view-transitions',
				title: 'Animate visual changes with ViewTransition',
				level: 3,
			},
			{ id: 'roots-and-rendering', title: 'Roots and rendering' },
			{ id: 'create-portal', title: 'Render an overlay with createPortal', level: 3 },
			{ id: 'server-rendering', title: 'Server and static rendering' },
			{ id: 'api-index', title: 'API index by job' },
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
			{ id: 'component-bodies', title: 'The same component, with less ceremony' },
			{ id: 'rendered-control-flow', title: 'Branches and lists that read top to bottom' },
			{ id: 'text-holes', title: 'Text holes make the output explicit' },
			{
				id: 'editor-support',
				title: 'Editor support',
				searchTerms: ['VSCode', 'VSCode extension', 'TSRX VSCode'],
			},
			{ id: 'next', title: 'Next' },
		],
	},
	{
		slug: 'differences-from-react',
		title: 'Differences from React',
		description: 'The deliberate divergences — everything else matching React is the point.',
		group: 'Explore',
		sections: [
			{ id: 'hooks', title: 'Hooks fit the code' },
			{ id: 'strong-mode', title: 'Strong mode is optional' },
			{ id: 'events-and-dom', title: 'Events come from the browser' },
			{ id: 'async-work', title: 'Transitions without time slicing' },
			{ id: 'errors-and-server', title: 'Errors and server rendering' },
			{ id: 'not-supported', title: 'APIs Octane leaves out' },
		],
	},
	{
		slug: 'lynx',
		title: 'Native apps with Lynx',
		description:
			'Render Octane components as native UI on iOS and Android through Lynx, and preview the same bundle on the web.',
		group: 'Explore',
		searchTerms: [
			'Lynx',
			'@octanejs/lynx',
			'@octanejs/rspeedy-plugin',
			'Rspeedy',
			'Lynx Explorer',
			'Lynx for Web',
			'native',
			'iOS',
			'Android',
			'mobile',
			'main thread',
			'main-thread scripting',
			'lynx-view',
			'.lynx.bundle',
		],
		sections: [
			{ id: 'what-lynx-is', title: 'How Lynx and Octane work together' },
			{
				id: 'gallery',
				title: 'Image gallery with a main-thread scrollbar',
				searchTerms: ['gallery', 'waterfall', 'list', 'scrollbar'],
			},
			{
				id: 'swiper',
				title: 'Product carousel animated on the main thread',
				searchTerms: ['swiper', 'carousel', 'product detail', 'gesture'],
			},
			{ id: 'two-threads', title: 'Two threads, one component tree' },
			{ id: 'run-it', title: 'Run it yourself' },
			{ id: 'status', title: 'Current status' },
		],
	},
	{
		slug: 'react-compat',
		title: 'React compatibility',
		description:
			'Use OctaneCompat for Octane components inside React, or ReactCompat for real React components inside Octane.',
		group: 'Explore',
		searchTerms: [
			'OctaneCompat',
			'ReactCompat',
			'bridgeReactContext',
			'octane/react',
			'octane/react/server',
			'islands',
			'migrate',
			'interop',
			'React 19',
			'React 19.2',
		],
		sections: [
			{ id: 'what-is-octanecompat', title: 'Choose a direction' },
			{ id: 'set-up', title: 'Set up the toolchain' },
			{
				id: 'render-an-island',
				title: 'Render Octane in React',
				searchTerms: ['OctaneCompat', 'Octane in React'],
			},
			{
				id: 'render-react-in-octane',
				title: 'Render React in Octane',
				searchTerms: ['ReactCompat', 'React in Octane', 'React components', 'React libraries'],
			},
			{
				id: 'react-context',
				title: 'Share context',
				searchTerms: ['bridgeReactContext', 'ReactContextBridge', 'context mappings'],
			},
			{ id: 'react-context-in-octane', title: 'React context in an Octane island', level: 3 },
			{ id: 'octane-context-in-react', title: 'Octane context in a React island', level: 3 },
			{ id: 'state-refs-and-events', title: 'State, refs, and events' },
			{ id: 'suspense-and-visibility', title: 'Suspense, errors, and visibility' },
			{ id: 'server-rendering', title: 'Server rendering and hydration' },
			{ id: 'not-supported', title: 'Limits' },
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
			{ id: 'package-the-source', title: 'Package the complete source graph' },
			{ id: 'authoring-and-types', title: 'Authoring and types' },
			{ id: 'package-metadata', title: 'Use package metadata only for real exceptions' },
			{ id: 'verify-the-package', title: 'Verify what users receive' },
		],
	},
	{
		slug: 'browser-support',
		title: 'Browser support',
		description: 'Choose browser targets and understand required Web APIs and optional fallbacks.',
		group: 'Explore',
		searchTerms: [
			'browser compatibility',
			'Chromium',
			'Safari',
			'WebKit',
			'Samsung Internet',
			'WebView',
		],
		sections: [
			{ id: 'support-policy', title: 'Support policy' },
			{
				id: 'required-apis',
				title: 'Required browser APIs',
				searchTerms: ['replaceChildren', 'replaceAll', 'queueMicrotask', 'polyfills'],
			},
			{ id: 'feature-specific-apis', title: 'Feature-specific requirements' },
			{ id: 'optional-features', title: 'Features with fallbacks' },
			{ id: 'build-targets', title: 'Choose a build target' },
		],
	},
	{
		slug: 'bindings',
		title: 'Integrations and bindings',
		description: `Search ${FRAMEWORK_INTEGRATION_COUNT} framework integrations and ${BINDING_COUNT} Octane bindings for state, data, routing, UI, forms, and more.`,
		group: 'Explore',
		sections: [
			{ id: 'find-a-binding', title: 'Find an integration or binding' },
			{ id: 'install-and-use', title: 'Install it, then change the import' },
			{ id: 'check-support', title: 'Check the part you plan to use' },
		],
	},
];
