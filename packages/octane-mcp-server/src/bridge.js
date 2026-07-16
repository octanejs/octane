import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const KNOWN_BINDINGS = {
	zustand: '@octanejs/zustand',
	'@tanstack/react-query': '@octanejs/query',
	'framer-motion': '@octanejs/motion',
	motion: '@octanejs/motion',
	'@stylexjs/stylex': '@octanejs/stylex',
	'react-router': '@octanejs/router',
	'react-router-dom': '@octanejs/router',
	'@lexical/react': '@octanejs/lexical',
	'@floating-ui/react': '@octanejs/floating-ui',
	'radix-ui': '@octanejs/radix',
};

export const KNOWN_VANILLA_CORES = {
	'@tanstack/react-query': '@tanstack/query-core',
	'@tanstack/react-table': '@tanstack/table-core',
	'@tanstack/react-virtual': '@tanstack/virtual-core',
	'@tanstack/react-form': '@tanstack/form-core',
	'@floating-ui/react': '@floating-ui/dom',
	'@xstate/react': 'xstate',
	'react-redux': 'redux',
	'@reduxjs/toolkit': 'redux',
	'react-hook-form': null,
	zustand: 'zustand/vanilla',
	valtio: 'valtio/vanilla',
	jotai: 'jotai/vanilla',
	'@lexical/react': 'lexical',
};

export const REACT_API_MAP = {
	useState: {
		status: 'same',
		note: 'Identical, including lazy initializer and functional updates.',
	},
	useReducer: { status: 'same', note: 'Identical, including lazy init third argument.' },
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
		note: 'Supported by react-compat for nested classic-runtime trees; an Octane-native entry still uses flat descriptors and compiler output.',
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
		note: 'Supported by react-compat as a refs-as-props wrapper; rewrite it away in an Octane-native entry.',
	},
	useDebugValue: { status: 'rewrite', note: 'Not present. Shim as a no-op.' },
	lazy: {
		status: 'rewrite',
		note: 'Supported by react-compat; native entries use dynamic import plus use()/Suspense.',
	},
	Component: {
		status: 'partial',
		note: 'react-compat supports state, commit lifecycles, refs, contextType and Error Boundaries; legacy pre-render lifecycles are unsupported.',
	},
	PureComponent: {
		status: 'partial',
		note: 'Loads through the class adapter, but PureComponent/shouldComponentUpdate bailout timing is not emulated.',
	},
	StrictMode: {
		status: 'rewrite',
		note: 'Not present, and there is no double-invoke. Drop the wrapper.',
	},
	Profiler: { status: 'unsupported', note: 'Not present.' },
	SuspenseList: { status: 'unsupported', note: 'Not present.' },
	findDOMNode: { status: 'unsupported', note: 'Removed in React 19 too. Use refs.' },
	renderToString: {
		status: 'rewrite',
		note: 'Use render() from octane/server; it is async and returns { head, body, css }.',
	},
	renderToPipeableStream: {
		status: 'unsupported',
		note: 'No streaming SSR yet. Use render() from octane/server.',
	},
	renderToReadableStream: {
		status: 'unsupported',
		note: 'No streaming SSR yet. Use render() from octane/server.',
	},
	onChange: {
		status: 'rewrite',
		note: 'react-compat translates text onChange and exposes SyntheticEvent helpers; native entries should use onInput.',
	},
	defaultProps: {
		status: 'rewrite',
		note: 'Use default parameter values / destructuring defaults.',
	},
};

// Legacy pre-render class lifecycles: react-compat rejects these with a
// targeted error instead of silently approximating React, so they are the one
// class-component pattern that genuinely blocks the out-of-the-box path.
// (`\b`-anchored scanning means the UNSAFE_ aliases need their own entries.)
for (const name of [
	'getSnapshotBeforeUpdate',
	'componentWillMount',
	'componentWillReceiveProps',
	'componentWillUpdate',
	'UNSAFE_componentWillMount',
	'UNSAFE_componentWillReceiveProps',
	'UNSAFE_componentWillUpdate',
]) {
	REACT_API_MAP[name] = {
		status: 'unsupported',
		note: 'Legacy pre-render class lifecycle: react-compat throws a targeted error. Port the component to hooks or an Octane-native entry.',
	};
}

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
		const matches = source.match(new RegExp(`\\b${name}\\b`, 'g'));
		if (matches) apis.set(name, matches.length);
	}
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

// The verdict describes what happens under `@octanejs/react-compat` at
// runtime — NOT how hard a hand-port would be (react-compat absorbs the
// 'rewrite'-status APIs automatically; they only matter for a native entry):
//  - works-out-of-the-box: nothing in the scan needs attention.
//  - works-with-caveats: partial contracts (class bailout timing, Children
//    traversal idioms) or class components — supported subsets, verify behavior.
//  - has-unsupported-apis: the scan found APIs react-compat refuses (legacy
//    lifecycles, streaming SSR, findDOMNode, …). These throw targeted errors,
//    so the package still works when the code path is never exercised.
function verdictFor(rows, classComponents) {
	if (rows.some((row) => row.status === 'unsupported')) return 'has-unsupported-apis';
	if (classComponents || rows.some((row) => row.status === 'partial')) {
		return 'works-with-caveats';
	}
	return 'works-out-of-the-box';
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

function planFor(report) {
	const steps = [];
	if (report.existingBinding) {
		steps.push(
			`An official Octane-native binding exists: ${report.existingBinding}. It is the fastest option; the unmodified React build also runs through @octanejs/react-compat.`,
		);
	}
	steps.push(
		"Default path — run the package unmodified: add the compatibility entry to the Octane Vite plugin (`import { react } from '@octanejs/react-compat/vite'`; `octane({ compat: [react()] })`). No codemod, no transformed copy, no per-library configuration; SSR resolves to the server facade automatically.",
	);
	const unsupported = (report.apis ?? []).filter((row) => row.status === 'unsupported');
	for (const row of unsupported) {
		steps.push(
			`Unsupported under react-compat — ${row.name} (${row.count}x): ${row.note} The error is targeted, so the package still works if this code path is never exercised.`,
		);
	}
	const partial = (report.apis ?? []).filter((row) => row.status === 'partial');
	for (const row of partial) {
		steps.push(`Caveat — ${row.name} (${row.count}x): ${row.note}`);
	}
	if (report.classComponents) {
		steps.push(
			'Class components detected: react-compat supports state, commit lifecycles, contextType, class defaultProps, refs and class Error Boundaries; PureComponent/shouldComponentUpdate bailout timing is not emulated and legacy pre-render lifecycles throw targeted errors.',
		);
	}
	steps.push(
		report.vanillaCore
			? `Performance ceiling (optional): publish an Octane-native entry behind the \`octane\` export condition — reuse the framework-agnostic core '${report.vanillaCore}' unchanged and re-implement the thin React binding with Octane hooks (see the bridge-react-package skill). Consumers without it keep using the React build through react-compat.`
			: 'Performance ceiling (optional): publish an Octane-native entry behind the `octane` export condition using compiled .tsrx and Octane hooks (see the bridge-react-package skill). Consumers without it keep using the React build through react-compat.',
	);
	steps.push(
		'Validate with tests that drive real DOM events against the package running on Octane, and compare behavior with the React original where possible.',
	);
	return steps;
}
