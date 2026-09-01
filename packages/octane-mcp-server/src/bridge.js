import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// React package → maintained @octanejs binding. Bindings with no React-package
// equivalent live in KNOWN_NATIVE_BINDINGS below. bridge.test.js derives the
// expected union from the workspace manifests, so publishing a new binding
// without registering it in either catalog fails the mcp-server tests.
export const KNOWN_BINDINGS = {
	'@gsap/react': '@octanejs/gsap',
	animejs: '@octanejs/animejs',
	'usehooks-ts': '@octanejs/usehooks-ts',
	zustand: '@octanejs/zustand',
	valtio: '@octanejs/valtio',
	jotai: '@octanejs/jotai',
	'@mantine/hooks': '@octanejs/mantine-hooks',
	'mobx-react-lite': '@octanejs/mobx',
	'mobx-react': '@octanejs/mobx',
	'@apollo/client': '@octanejs/apollo-client',
	'@solana/react': '@octanejs/solana-kit',
	'@tanstack/ai-react': '@octanejs/tanstack-ai',
	'@tanstack/react-db': '@octanejs/tanstack-db',
	'@tanstack/react-devtools': '@octanejs/tanstack-devtools',
	'@tanstack/react-form': '@octanejs/tanstack-form',
	'@formisch/react': '@octanejs/formisch',
	'@tanstack/react-query': '@octanejs/tanstack-query',
	swr: '@octanejs/swr',
	wagmi: '@octanejs/wagmi',
	'@rainbow-me/rainbowkit': '@octanejs/rainbowkit',
	'@tanstack/react-router': '@octanejs/tanstack-router',
	'@tanstack/react-store': '@octanejs/tanstack-store',
	'@xstate/react': '@octanejs/xstate',
	'@xstate/store-react': '@octanejs/xstate-store',
	'@xyflow/react': '@octanejs/xyflow',
	'@tanstack/react-router-ssr-query': '@octanejs/tanstack-router-ssr-query',
	'@tanstack/react-hotkeys': '@octanejs/tanstack-hotkeys',
	'@tanstack/react-pacer': '@octanejs/tanstack-pacer',
	'@tanstack/react-table': '@octanejs/tanstack-table',
	'@tanstack/react-virtual': '@octanejs/tanstack-virtual',
	'react-waypoint': '@octanejs/waypoint',
	'react-window': '@octanejs/window',
	'framer-motion': '@octanejs/motion',
	motion: '@octanejs/motion',
	'@react-spring/web': '@octanejs/spring',
	'@react-spring/parallax': '@octanejs/spring',
	'@stylexjs/stylex': '@octanejs/stylex',
	'styled-components': '@octanejs/styled-components',
	'react-router': '@octanejs/remix-router',
	'react-router-dom': '@octanejs/remix-router',
	nuqs: '@octanejs/nuqs',
	cmdk: '@octanejs/cmdk',
	'@lexical/react': '@octanejs/lexical',
	'@tiptap/react': '@octanejs/tiptap',
	'react-pdf': '@octanejs/pdf',
	'@portabletext/react': '@octanejs/portabletext',
	'@sanity/icons': '@octanejs/sanity-icons',
	'@sanity/react-loader': '@octanejs/sanity-loader',
	'@sanity/logos': '@octanejs/sanity-logos',
	'@monaco-editor/react': '@octanejs/monaco-editor',
	'lucide-react': '@octanejs/lucide',
	'@phosphor-icons/react': '@octanejs/phosphor-icons',
	'@floating-ui/react': '@octanejs/floating-ui',
	'react-popper': '@octanejs/popper',
	'react-aria': '@octanejs/aria',
	'react-aria-components': '@octanejs/aria',
	'react-stately': '@octanejs/aria',
	'radix-ui': '@octanejs/radix',
	'react-hook-form': '@octanejs/hook-form',
	'better-auth/react': '@octanejs/better-auth',
	'@base-ui-components/react': '@octanejs/base-ui',
	'@dnd-kit/react': '@octanejs/dnd-kit',
	'embla-carousel-react': '@octanejs/embla-carousel',
	'react-dropzone': '@octanejs/dropzone',
	sonner: '@octanejs/sonner',
	'react-error-boundary': '@octanejs/react-error-boundary',
	'react-email': '@octanejs/email',
	'@react-email/components': '@octanejs/email',
	'react-resizable-panels': '@octanejs/resizable-panels',
	'react-select': '@octanejs/select',
	'react-transition-group': '@octanejs/transition-group',
	'react-day-picker': '@octanejs/day-picker',
	'input-otp': '@octanejs/input-otp',
	vaul: '@octanejs/vaul',
	'react-markdown': '@octanejs/markdown',
	'react-textarea-autosize': '@octanejs/textarea-autosize',
	'react-intersection-observer': '@octanejs/intersection-observer',
	'react-draggable': '@octanejs/draggable',
	'react-colorful': '@octanejs/colorful',
	'use-stick-to-bottom': '@octanejs/stick-to-bottom',
	'react-image-crop': '@octanejs/image-crop',
	'react-content-loader': '@octanejs/content-loader',
	'react-to-print': '@octanejs/to-print',
	'react-calendar': '@octanejs/calendar',
	'thinking-orbs': '@octanejs/thinking-orbs',
	'@formkit/auto-animate': '@octanejs/auto-animate',
	streamdown: '@octanejs/streamdown',
	'react-syntax-highlighter': '@octanejs/syntax-highlighter',
	// The official plugins are consolidated as subpaths of the same package.
	// The bundled bridge skill documents each exact import rewrite.
	'@streamdown/code': '@octanejs/streamdown',
	'@streamdown/math': '@octanejs/streamdown',
	'@streamdown/mermaid': '@octanejs/streamdown',
	'@streamdown/cjk': '@octanejs/streamdown',
	shadcn: '@octanejs/shadcn',
	recharts: '@octanejs/recharts',
	'react-alien-signals': '@octanejs/alien-signals',
	// react-map-gl@8 is a re-export shell; the binding covers the package its
	// ./mapbox subpath resolves to, so both specifiers map here.
	'react-map-gl': '@octanejs/react-map-gl',
	'react-map-gl/mapbox': '@octanejs/react-map-gl',
	'@vis.gl/react-mapbox': '@octanejs/react-map-gl',
	'@react-three/fiber': '@octanejs/three',
	'@opentui/react': '@octanejs/opentui',
	'@react-three/drei': '@octanejs/drei',
	'@visx/visx': '@octanejs/visx',
	'@visx/a11y': '@octanejs/visx',
	'@visx/a11y/react': '@octanejs/visx',
	'@visx/a11y/server': '@octanejs/visx',
	'@visx/annotation': '@octanejs/visx',
	'@visx/axis': '@octanejs/visx',
	'@visx/axis/react': '@octanejs/visx',
	'@visx/bounds': '@octanejs/visx',
	'@visx/brush': '@octanejs/visx',
	'@visx/chart': '@octanejs/visx',
	'@visx/chord': '@octanejs/visx',
	'@visx/clip-path': '@octanejs/visx',
	'@visx/curve': '@octanejs/visx',
	'@visx/delaunay': '@octanejs/visx',
	'@visx/drag': '@octanejs/visx',
	'@visx/event': '@octanejs/visx',
	'@visx/geo': '@octanejs/visx',
	'@visx/glyph': '@octanejs/visx',
	'@visx/gradient': '@octanejs/visx',
	'@visx/grid': '@octanejs/visx',
	'@visx/group': '@octanejs/visx',
	'@visx/heatmap': '@octanejs/visx',
	'@visx/hierarchy': '@octanejs/visx',
	'@visx/kernel': '@octanejs/visx',
	'@visx/legend': '@octanejs/visx',
	'@visx/marker': '@octanejs/visx',
	'@visx/mock-data': '@octanejs/visx',
	'@visx/network': '@octanejs/visx',
	'@visx/pattern': '@octanejs/visx',
	'@visx/point': '@octanejs/visx',
	'@visx/react-spring': '@octanejs/visx',
	'@visx/responsive': '@octanejs/visx',
	'@visx/sankey': '@octanejs/visx',
	'@visx/scale': '@octanejs/visx',
	'@visx/scale/react': '@octanejs/visx',
	'@visx/shape': '@octanejs/visx',
	'@visx/shape/react': '@octanejs/visx',
	'@visx/stats': '@octanejs/visx',
	'@visx/text': '@octanejs/visx',
	'@visx/theme': '@octanejs/visx',
	'@visx/theme/react': '@octanejs/visx',
	'@visx/threshold': '@octanejs/visx',
	'@visx/tooltip': '@octanejs/visx',
	'@visx/tooltip/floating': '@octanejs/visx',
	'@visx/voronoi': '@octanejs/visx',
	'@visx/voronoi/react': '@octanejs/visx',
	'@visx/wordcloud': '@octanejs/visx',
	'@visx/xychart': '@octanejs/visx',
	'@visx/zoom': '@octanejs/visx',
	'react-redux': '@octanejs/redux',
	'@reduxjs/toolkit': '@octanejs/redux-toolkit',
	'@zag-js/react': '@octanejs/zag',
	'@react-rxjs/core': '@octanejs/rxjs',
	'@react-rxjs/utils': '@octanejs/rxjs',
	'@testing-library/react': '@octanejs/testing-library',
	'react-i18next': '@octanejs/i18next',
	'html-react-parser': '@octanejs/html-react-parser',
	'@inertiajs/react': '@octanejs/inertia',
	ink: '@octanejs/ink',
	'@mdx-js/react': '@octanejs/mdx',
	'dexie-react-hooks': '@octanejs/dexie',
	'@livestore/react': '@octanejs/livestore',
	wouter: '@octanejs/wouter',
};

// Octane-specific ecosystem packages that have no React import to rewrite.
// Keep these out of KNOWN_BINDINGS so the React bridge never invents a source
// package mapping for native tooling.
export const KNOWN_NATIVE_BINDINGS = new Set([
	'@octanejs/devtools',
	'@octanejs/electron',
	'@octanejs/email-cli',
	'@octanejs/tauri',
]);

// Workspace directory names for the maintained bindings. Keep this derived
// from both catalogs so repository path routing cannot drift from the public
// binding list (aliases such as `motion` intentionally collapse to one dir).
export const KNOWN_BINDING_PACKAGE_DIRS = new Set(
	[...Object.values(KNOWN_BINDINGS), ...KNOWN_NATIVE_BINDINGS].map((name) =>
		name.slice('@octanejs/'.length),
	),
);

export const KNOWN_VANILLA_CORES = {
	'@apollo/client': '@apollo/client',
	'@solana/react': '@solana/kit',
	'@tanstack/react-db': '@tanstack/db',
	'@tanstack/react-query': '@tanstack/query-core',
	wagmi: '@wagmi/core',
	'@tanstack/react-table': '@tanstack/table-core',
	'@tanstack/react-virtual': '@tanstack/virtual-core',
	'@tanstack/react-form': '@tanstack/form-core',
	'@floating-ui/react': '@floating-ui/dom',
	'@dnd-kit/react': '@dnd-kit/dom',
	'@opentui/react': '@opentui/core',
	'embla-carousel-react': 'embla-carousel',
	'@xstate/react': 'xstate',
	'@xstate/store-react': '@xstate/store',
	'@xyflow/react': '@xyflow/system',
	'react-redux': 'redux',
	'@reduxjs/toolkit': 'redux',
	'react-i18next': 'i18next',
	'react-hook-form': null,
	'@formkit/auto-animate': '@formkit/auto-animate',
	'react-alien-signals': 'alien-signals',
	zustand: 'zustand/vanilla',
	valtio: 'valtio/vanilla',
	jotai: 'jotai/vanilla',
	'@lexical/react': 'lexical',
	'@tiptap/react': '@tiptap/core',
	'@monaco-editor/react': 'monaco-editor',
	'@livestore/react': '@livestore/livestore',
};

export const REACT_API_MAP = {
	useState: {
		status: 'same',
		note: 'Same lazy initializer and functional-update semantics; Octane additionally exposes a stable current-state getter at tuple index 2.',
	},
	useReducer: {
		status: 'same',
		note: 'Same reducer and lazy-init semantics; Octane additionally exposes a stable current-state getter at tuple index 2.',
	},
	useEffect: { status: 'same', note: 'Identical deps/cleanup semantics.' },
	useLayoutEffect: { status: 'same', note: 'Identical: synchronous after DOM mutation.' },
	useInsertionEffect: { status: 'same', note: 'Supported.' },
	useMemo: { status: 'same', note: 'Identical.' },
	useCallback: { status: 'same', note: 'Identical.' },
	useRef: { status: 'same', note: 'Identical.' },
	useContext: { status: 'same', note: 'Identical.' },
	useId: { status: 'same', note: 'Identical, hydration-stable.' },
	useImperativeHandle: {
		status: 'same',
		note: 'Supported; combine with refs-as-props instead of forwardRef.',
	},
	useSyncExternalStore: {
		status: 'same',
		note: 'Full React 19 shape including getServerSnapshot; tearing-tested.',
	},
	useDeferredValue: { status: 'same', note: 'Supported.' },
	useTransition: { status: 'same', note: 'Supported.' },
	useActionState: { status: 'same', note: 'Supported.' },
	useOptimistic: { status: 'same', note: 'Supported.' },
	useFormStatus: { status: 'same', note: 'Supported (import from octane, not react-dom).' },
	useEffectEvent: { status: 'same', note: 'Supported.' },
	use: { status: 'same', note: 'Supported for promises and context.' },
	startTransition: { status: 'same', note: 'Supported.' },
	memo: { status: 'same', note: 'Supported.' },
	createContext: { status: 'same', note: 'Supported.' },
	createPortal: { status: 'same', note: 'Supported (import from octane, not react-dom).' },
	flushSync: { status: 'same', note: 'Supported (import from octane, not react-dom).' },
	createElement: {
		status: 'partial',
		note: 'Returns a flat descriptor consumed by compiled templates; not a VDOM tree. Component trees must be authored in .tsrx, not built with nested createElement calls.',
	},
	cloneElement: { status: 'partial', note: 'Works on Octane element descriptors only.' },
	isValidElement: { status: 'same', note: 'Supported for Octane descriptors.' },
	Children: {
		status: 'partial',
		note: 'Supported for Octane descriptors; React.Children traversal idioms over arbitrary VDOM do not apply.',
	},
	Fragment: { status: 'same', note: 'Supported.' },
	Suspense: {
		status: 'same',
		note: 'Supported (also available as the @try/@pending directive in .tsrx).',
	},
	createRoot: { status: 'same', note: 'Supported (import from octane, not react-dom/client).' },
	hydrateRoot: { status: 'same', note: 'Supported (import from octane, not react-dom/client).' },
	forwardRef: {
		status: 'rewrite',
		note: 'No forwardRef. Rewrite to React 19 refs-as-props: accept ref as a normal prop.',
	},
	useDebugValue: {
		status: 'same',
		note: 'Supported as an accepted no-op (devtools-only label; there is no DevTools integration).',
	},
	lazy: {
		status: 'same',
		note: "Supported. Accepts React's { default } module shape and additionally a bare component from the loader; wrapping Suspense or ViewTransition in lazy() is valid (nested lazy wrappers are not).",
	},
	Component: {
		status: 'rewrite',
		note: 'No class components. Rewrite as a function component.',
	},
	PureComponent: {
		status: 'rewrite',
		note: 'No class components. Rewrite as a function component with memo.',
	},
	StrictMode: {
		status: 'rewrite',
		note: 'Not present, and there is no double-invoke. Drop the wrapper.',
	},
	Profiler: { status: 'unsupported', note: 'Not present.' },
	SuspenseList: { status: 'unsupported', note: 'Not present.' },
	findDOMNode: { status: 'rewrite', note: 'Removed in React 19 too. Use refs.' },
	renderToString: {
		status: 'rewrite',
		note: 'Use renderToString() from octane/server (sync) or prerender() from octane/static (async, awaits Suspense); both return { html, css }.',
	},
	renderToStaticMarkup: {
		status: 'rewrite',
		note: 'Use renderToStaticMarkup() from octane/server (clean, non-hydratable HTML; returns { html, css }).',
	},
	renderToPipeableStream: {
		status: 'rewrite',
		note: 'Supported natively: import renderToPipeableStream from octane/server (Octane argument convention: component, props?, options?; returns { pipe, abort } with onShellReady/onShellError/onAllReady StreamOptions).',
	},
	renderToReadableStream: {
		status: 'rewrite',
		note: 'Supported natively: import renderToReadableStream from octane/server (Octane argument convention; resolves with a ReadableStream once the shell is ready, same StreamOptions).',
	},
	onChange: {
		status: 'rewrite',
		note: 'This is a standard text host using React-style per-edit onChange. Use onInput (or onInputCapture) for per-edit intent. Preserve component callbacks, select/checkable change handlers, and deliberate native text commits; mark the last case with suppressNativeChangeWarning.',
	},
	defaultProps: {
		status: 'rewrite',
		note: 'Use default parameter values / destructuring defaults.',
	},
};

const IMPORT_SOURCES = [
	'react',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
];

const SCANNABLE = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '__tests__', '__mocks__', 'test', 'tests']);
const MAX_FILES = 400;

const NON_TEXT_INPUT_TYPES = new Set([
	'button',
	'checkbox',
	'color',
	'date',
	'datetime-local',
	'file',
	'hidden',
	'image',
	'month',
	'radio',
	'range',
	'reset',
	'submit',
	'time',
	'week',
]);

function booleanAttributeState(attributes, name, exactTrue = false) {
	const match = attributes.match(
		new RegExp(
			`\\b${name}(?=\\s|=|\\/|$)(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*([^}]*)\\s*\\}))?`,
		),
	);
	if (!match) return 'false';
	if (!match[0].includes('=')) return 'true';
	const quoted = match[1] ?? match[2];
	if (exactTrue && quoted !== undefined) return 'false';
	if (quoted !== undefined) return quoted.length > 0 ? 'true' : 'false';
	const expression = match[3]?.trim();
	if (exactTrue) {
		if (expression === 'true') return 'true';
		if (
			/^(?:false|null|undefined|void\s+0|[+-]?(?:\d+(?:\.\d+)?|\.\d+)|NaN|'[^']*'|"[^"]*")$/.test(
				expression ?? '',
			)
		)
			return 'false';
		return 'dynamic';
	}
	if (/^(?:false|null|undefined|void\s+0|0|-0|NaN|''|"")$/.test(expression ?? '')) {
		return 'false';
	}
	if (/^(?:true|[1-9]\d*(?:\.\d+)?|'[^']+'|"[^"]+")$/.test(expression ?? '')) {
		return 'true';
	}
	return 'dynamic';
}

function hasPotentialEventAssignment(attributes, name) {
	const match = attributes.match(new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`));
	if (!match) return false;
	const value = match[1];
	if (value.startsWith('"') || value.startsWith("'")) return false;
	if (
		/^\{\s*(?:false|true|null|undefined|void\s+0|0|-0|NaN|''|"")\s*\}/.test(
			attributes.slice(match.index + match[0].indexOf(value)),
		)
	)
		return false;
	return true;
}

function countReactStyleTextChanges(source) {
	let count = 0;
	const hosts = source.matchAll(/<(input|textarea)\b((?:[^>]|=>)*)>/g);
	for (const match of hosts) {
		const host = match[1].toLowerCase();
		const attrs = match[2];
		const changeHandlers = ['onChange', 'onChangeCapture'].filter((name) =>
			hasPotentialEventAssignment(attrs, name),
		);
		if (
			changeHandlers.length === 0 ||
			hasPotentialEventAssignment(attrs, 'onInput') ||
			hasPotentialEventAssignment(attrs, 'onInputCapture')
		)
			continue;
		// A spread can replace the handler, type, editability, or suppression.
		// Leave that site for the compiler/runtime's final-props diagnostic rather
		// than suggesting a source rewrite from an incomplete static scan.
		if (/\{\s*\.\.\./.test(attrs)) continue;
		const suppression = booleanAttributeState(attrs, 'suppressNativeChangeWarning', true);
		const readOnly = booleanAttributeState(attrs, 'readOnly');
		const disabled = booleanAttributeState(attrs, 'disabled');
		if ([suppression, readOnly, disabled].includes('true')) continue;
		if ([suppression, readOnly, disabled].includes('dynamic')) continue;
		if (host === 'input') {
			const literalType = attrs.match(
				/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["']([^"']*)["']\s*\})/i,
			);
			if (!literalType && /\btype\s*=/.test(attrs)) continue;
			const type = (
				literalType?.[1] ??
				literalType?.[2] ??
				literalType?.[3] ??
				'text'
			).toLowerCase();
			if (NON_TEXT_INPUT_TYPES.has(type)) continue;
		}
		count += changeHandlers.length;
	}
	return count;
}

export async function collectSourceFiles(root, out = [], depth = 0) {
	if (depth > 6 || out.length >= MAX_FILES) return out;
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (out.length >= MAX_FILES) break;
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
				await collectSourceFiles(join(root, entry.name), out, depth + 1);
			}
		} else if (SCANNABLE.test(entry.name) && !entry.name.endsWith('.d.ts')) {
			out.push(join(root, entry.name));
		}
	}
	return out;
}

export function scanSource(source) {
	const apis = new Map();
	for (const name of Object.keys(REACT_API_MAP)) {
		if (name === 'onChange') continue;
		const matches = source.match(new RegExp(`\\b${name}\\b`, 'g'));
		if (matches) apis.set(name, matches.length);
	}
	const textChanges = countReactStyleTextChanges(source);
	if (textChanges > 0) apis.set('onChange', textChanges);
	const imports = new Set();
	for (const spec of IMPORT_SOURCES) {
		if (
			source.includes(`'${spec}'`) ||
			source.includes(`"${spec}"`) ||
			source.includes(`require('${spec}')`) ||
			source.includes(`require("${spec}")`)
		) {
			imports.add(spec);
		}
	}
	const classComponent = /\bextends\s+(React\.)?(Pure)?Component\b/.test(source);
	return { apis, imports, classComponent };
}

export async function scanPath(root) {
	const files = await collectSourceFiles(resolve(root));
	const totals = new Map();
	const imports = new Set();
	let classComponents = false;
	for (const file of files) {
		let source;
		try {
			source = await readFile(file, 'utf8');
		} catch {
			continue;
		}
		const result = scanSource(source);
		for (const [name, count] of result.apis) {
			totals.set(name, (totals.get(name) ?? 0) + count);
		}
		for (const spec of result.imports) imports.add(spec);
		classComponents ||= result.classComponent;
	}
	return { filesScanned: files.length, totals, imports, classComponents };
}

function apiRows(totals) {
	return [...totals.entries()]
		.map(([name, count]) => ({ name, count, ...REACT_API_MAP[name] }))
		.sort((a, b) => b.count - a.count);
}

function verdictFor(rows, classComponents) {
	if (rows.some((row) => row.status === 'unsupported')) return 'needs-rework';
	if (classComponents || rows.some((row) => row.status === 'rewrite' || row.status === 'partial')) {
		return 'bridgeable-with-rewrites';
	}
	return 'bridgeable';
}

export async function readPackageJson(dir) {
	try {
		return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
	} catch {
		return null;
	}
}

export function detectVanillaCore(packageName, packageJson) {
	if (packageName in KNOWN_VANILLA_CORES) {
		return KNOWN_VANILLA_CORES[packageName];
	}
	if (packageJson?.exports && typeof packageJson.exports === 'object') {
		for (const key of Object.keys(packageJson.exports)) {
			if (key.includes('vanilla') || key.includes('core')) return `${packageName}${key.slice(1)}`;
		}
	}
	const deps = Object.keys(packageJson?.dependencies ?? {});
	const core = deps.find((dep) => /(^|\/|-)core$/.test(dep) && !dep.startsWith('@babel'));
	return core ?? null;
}

export async function bridgeReport({ packageName, path, projectRoot }) {
	const report = {
		target: packageName ?? path,
		existingBinding: packageName ? (KNOWN_BINDINGS[packageName] ?? null) : null,
	};

	let scanRoot = path;
	let packageJson = null;
	if (packageName) {
		const base = resolve(projectRoot ?? process.cwd());
		const dir = join(base, 'node_modules', ...packageName.split('/'));
		packageJson = await readPackageJson(dir);
		if (!packageJson) {
			return {
				...report,
				error: `Package '${packageName}' not found under ${join(base, 'node_modules')}. Install it first or pass 'path' pointing at its source.`,
			};
		}
		report.version = packageJson.version ?? null;
		scanRoot = dir;
		report.vanillaCore = detectVanillaCore(packageName, packageJson);
		report.peerDependsOnReact = Boolean(
			packageJson.peerDependencies?.react ?? packageJson.dependencies?.react,
		);
	}

	const scan = await scanPath(scanRoot);
	const rows = apiRows(scan.totals);
	report.filesScanned = scan.filesScanned;
	report.reactImports = [...scan.imports];
	report.classComponents = scan.classComponents;
	report.apis = rows;
	report.verdict = verdictFor(rows, scan.classComponents);
	report.plan = planFor(report);
	return report;
}

// Filesystem-free variant of bridgeReport for hosted/remote use: the caller
// pastes source text instead of pointing at an installed package, so there is
// no node_modules resolution, no version, and no file counting. Everything
// else (API rows, verdict, plan) matches bridgeReport.
export function bridgeReportFromSource(source, { packageName } = {}) {
	const report = {
		target: packageName ?? 'pasted-source',
		existingBinding: packageName ? (KNOWN_BINDINGS[packageName] ?? null) : null,
	};
	if (packageName) {
		report.vanillaCore = detectVanillaCore(packageName, null);
	}
	const scan = scanSource(source);
	const rows = apiRows(scan.apis);
	report.reactImports = [...scan.imports];
	report.classComponents = scan.classComponent;
	report.apis = rows;
	report.verdict = verdictFor(rows, scan.classComponent);
	report.plan = planFor(report);
	return report;
}

function planFor(report) {
	const steps = [];
	if (report.existingBinding) {
		return [
			`Install the official Octane binding: ${report.existingBinding}.`,
			`Replace imports from ${report.target} with imports from ${report.existingBinding}, preserving the imported API names.`,
			'Run the application typecheck and the relevant unit, SSR, hydration, and browser tests; no manual React binding port is needed.',
		];
	}
	if (report.vanillaCore) {
		steps.push(
			`Reuse the framework-agnostic core '${report.vanillaCore}' unchanged; it has no React imports and runs on Octane as-is.`,
		);
	}
	steps.push(
		"Pin the upstream version you are bridging and copy that release's React binding source into your repository beside the port, keeping the upstream LICENSE and leaving the copy unmodified, then work through it module by module. A bridge written from the README or the type declarations covers the demo path and drops the rest of the API; the copy is also the diff you review on the next upgrade.",
	);
	steps.push(
		'Re-implement the React binding layer (the hooks/components that import react) against Octane hooks of the same names. Most store bindings reduce to useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot).',
	);
	const rewrites = (report.apis ?? []).filter(
		(row) => row.status === 'rewrite' || row.status === 'partial',
	);
	for (const row of rewrites) {
		steps.push(`${row.name} (${row.count}x): ${row.note}`);
	}
	if (report.classComponents) {
		steps.push(
			'Class components detected: rewrite each as a function component; error boundaries become the @try/@catch directive or the ErrorBoundary component.',
		);
	}
	const unsupported = (report.apis ?? []).filter((row) => row.status === 'unsupported');
	for (const row of unsupported) {
		steps.push(`${row.name} (${row.count}x): ${row.note}`);
	}
	steps.push(
		'Re-author any JSX components shipped by the package in .tsrx: compiled React JSX output cannot run on Octane, and hooks called from non-compiled files need compiler slotting (see the bridge-react-package skill for the subSlot pattern).',
	);
	steps.push(
		"Run the pinned release's own test suite against the bridge where it ships one: framework-neutral suites unmodified against the reused core, React-binding suites ported case by case (fixtures in .tsrx, @octanejs/testing-library for @testing-library/react, upstream case names kept). Note which upstream test files you ran, ported, or left out and why, and triage a failure before touching its assertion.",
	);
	steps.push(
		'Validate the rest with tests that drive real DOM events and compare behavior against the React original where possible.',
	);
	return steps;
}
