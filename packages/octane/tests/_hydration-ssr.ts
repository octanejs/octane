import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, type Plugin } from 'vite';
import type { ModuleRunner } from 'vite/module-runner';

import { octane } from '../src/compiler/vite.js';
import type { RenderResult } from '../src/runtime.server';

type HydrationBinding =
	| 'alien-signals'
	| 'apollo-client'
	| 'aria'
	| 'base-ui'
	| 'docusaurus'
	| 'formisch'
	| 'monaco-editor'
	| 'pdf'
	| 'rainbowkit'
	| 'react-map-gl'
	| 'select'
	| 'solana-kit'
	| 'testing-library'
	| 'tanstack-pacer'
	| 'tanstack-query'
	| 'tanstack-virtual'
	| 'tanstack-table';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

function bindingAliases(binding: HydrationBinding) {
	const source = resolve(repositoryRoot, 'packages', binding, 'src');
	if (binding === 'alien-signals') {
		return [{ find: /^@octanejs\/alien-signals$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'apollo-client') {
		return [
			{
				find: /^@octanejs\/apollo-client\/react\/internal$/,
				replacement: resolve(source, 'react/internal/index.js'),
			},
			{
				find: /^@octanejs\/apollo-client\/react$/,
				replacement: resolve(source, 'react/index.js'),
			},
			{ find: /^@octanejs\/apollo-client$/, replacement: resolve(source, 'index.js') },
		];
	}

	if (binding === 'aria') {
		return [
			{ find: /^@octanejs\/aria$/, replacement: resolve(source, 'index.ts') },
			{ find: /^@octanejs\/aria\/(.*)$/, replacement: `${source}/$1/index.ts` },
		];
	}

	if (binding === 'docusaurus') {
		return [
			{
				find: /^@octanejs\/docusaurus\/server$/,
				replacement: resolve(source, 'server.js'),
			},
			{
				find: /^@octanejs\/remix-router$/,
				replacement: resolve(repositoryRoot, 'packages/remix-router/src/index.ts'),
			},
		];
	}

	if (binding === 'formisch') {
		return [{ find: /^@octanejs\/formisch$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'solana-kit') {
		return [
			{
				find: /^@octanejs\/solana-kit$/,
				replacement: resolve(source, 'index.ts'),
			},
		];
	}

	if (binding === 'rainbowkit') {
		return [
			{
				find: /^@octanejs\/rainbowkit$/,
				replacement: resolve(source, 'index.ts'),
			},
			{
				find: /^@octanejs\/wagmi$/,
				replacement: resolve(repositoryRoot, 'packages/wagmi/src/index.ts'),
			},
			{
				find: /^@octanejs\/tanstack-query$/,
				replacement: resolve(repositoryRoot, 'packages/tanstack-query/src/index.ts'),
			},
		];
	}

	if (binding === 'monaco-editor') {
		return [
			{
				find: /^@octanejs\/monaco-editor$/,
				replacement: resolve(source, 'index.ts'),
			},
			{
				find: /^@monaco-editor\/loader$/,
				replacement: resolve(repositoryRoot, 'packages/monaco-editor/tests/_mocks/loader.ts'),
			},
		];
	}

	if (binding === 'pdf') {
		return [
			{
				find: /^@octanejs\/pdf$/,
				replacement: resolve(source, 'index.server.ts'),
			},
		];
	}

	if (binding === 'react-map-gl') {
		return [{ find: /^@octanejs\/react-map-gl$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'tanstack-table')
		return [{ find: /^@octanejs\/tanstack-table$/, replacement: resolve(source, 'index.ts') }];

	if (binding === 'tanstack-virtual') {
		return [{ find: /^@octanejs\/tanstack-virtual$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'tanstack-query') {
		return [{ find: /^@octanejs\/tanstack-query$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'tanstack-pacer') {
		return [
			{ find: /^@octanejs\/tanstack-pacer$/, replacement: resolve(source, 'index.ts') },
			{ find: /^@octanejs\/tanstack-pacer\/(.*)$/, replacement: `${source}/$1/index.ts` },
			{
				find: /^@octanejs\/tanstack-store$/,
				replacement: resolve(repositoryRoot, 'packages/tanstack-store/src/index.ts'),
			},
		];
	}

	if (binding === 'select') return [];

	if (binding === 'testing-library') {
		// Its hydration fixtures import `octane` and nothing else — the binding
		// itself is what the TEST mounts through, never what the server renders.
		return [];
	}

	return [
		{ find: /^@octanejs\/base-ui$/, replacement: resolve(source, 'index.ts') },
		{ find: /^@octanejs\/base-ui\/(.*)$/, replacement: `${source}/$1` },
		{
			find: /^@octanejs\/floating-ui$/,
			replacement: resolve(repositoryRoot, 'packages/floating-ui/src/index.ts'),
		},
	];
}

// This module exists only inside an opted-in test SSR server. Importing it from
// both the instrumented sources and this helper avoids assuming that the outer
// Vitest worker and Vite's evaluated modules share a global object.
let hydrationTraceInvocation = 0;
const hydrationTraceModule = 'virtual:octane-test-hydration-ssr-trace';
const resolvedHydrationTraceModule = '\0' + hydrationTraceModule;
const hydrationTraceSource = String.raw`
const identities = new WeakMap();
let nextIdentity = 1;
let sequence = 0;
let phase = 'configure';
let invocation;
const events = [];
const providerWrites = [];
const evaluations = [];
let droppedEvents = 0;
let droppedProviderWrites = 0;
let droppedEvaluations = 0;
let diagnosticErrors = 0;
const moduleToken = {};
function identity(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return null;
  let id = identities.get(value);
  if (id === undefined) identities.set(value, id = nextIdentity++);
  return id;
}
function record(event) {
  if (events.length === 128) { events.shift(); droppedEvents++; }
  const entry = { sequence: ++sequence, phase, ...event };
  events.push(entry);
  if (event.kind === 'provider-write') {
    if (providerWrites.length === 64) { providerWrites.shift(); droppedProviderWrites++; }
    providerWrites.push(entry);
  }
  if (event.kind.endsWith('-evaluation') || event.kind === 'context-created') {
    if (evaluations.length === 128) { evaluations.shift(); droppedEvaluations++; }
    evaluations.push(entry);
  }
}
function observe(run) {
  try { run(); } catch { diagnosticErrors++; }
}
function scopeRecord(scope) {
  if (scope === null || scope === undefined) return null;
  const values = scope.$$ctxValues;
  return {
    id: identity(scope), parent: identity(scope.parent), map: identity(values),
    contexts: values === null ? [] : Array.from(values, ([context, value]) => ({
      context: identity(context), nonNull: value != null,
    })),
  };
}
function ancestry(scope) {
  const scopes = [];
  const seen = new Set();
  while (scope !== null && scope !== undefined) {
    if (seen.has(scope)) return { scopes, cycle: true, truncated: false };
    if (scopes.length === 1024) return { scopes, cycle: false, truncated: true };
    seen.add(scope);
    scopes.push(scopeRecord(scope));
    scope = scope.parent;
  }
  return { scopes, cycle: false, truncated: false };
}
export function configure(value) { invocation = value; }
export function setPhase(value) { phase = value; }
export function runtime(moduleId, importUrl) {
  const token = {};
  const runtime = identity(token);
  observe(() => record({ kind: 'runtime-evaluation', runtime, moduleId, importUrl }));
  return {
    context(context) { observe(() => record({ kind: 'context-created', runtime, context: identity(context) })); },
    provider(context, scope, currentScope) {
      observe(() => record({ kind: 'provider-write', runtime, context: identity(context),
        nonNull: scope.$$ctxValues.get(context) != null,
        scope: scopeRecord(scope), currentScope: scopeRecord(currentScope) }));
    },
    hit(context, currentScope, providerScope, nonNull) {
      observe(() => record({ kind: 'read-hit', runtime, context: identity(context), nonNull,
        currentScope: identity(currentScope), providerScope: identity(providerScope) }));
    },
    miss(context, currentScope) {
      observe(() => record({ kind: 'read-miss', runtime, context: identity(context),
        currentScope: identity(currentScope), ancestry: ancestry(currentScope) }));
    },
  };
}
export function contextModule(moduleId, importUrl, context) {
  observe(() => record({ kind: 'query-context-evaluation', module: identity({}), moduleId, importUrl,
    context: identity(context) }));
}
export function failure() {
  return { schema: 1, invocation, hub: identity(moduleToken), phase,
    diagnosticErrors, incomplete: diagnosticErrors !== 0,
    droppedEvents, droppedProviderWrites, droppedEvaluations, events, providerWrites, evaluations };
}
`;

type HydrationTraceModule = {
	configure(value: {
		id: string;
		node: string;
		platform: string;
		arch: string;
		binding: HydrationBinding;
		fixture: string;
		exportName: string;
	}): void;
	setPhase(value: string): void;
	failure(): Record<string, unknown>;
};

function hydrationTracePlugin() {
	const runtimeFile = resolve(repositoryRoot, 'packages/octane/src/runtime.server.ts');
	const contextFile = resolve(repositoryRoot, 'packages/tanstack-query/src/context.ts');
	const sources = new Map([runtimeFile, contextFile].map((id) => [id, readFileSync(id, 'utf8')]));
	const transformed: Array<{ id: string; sourceSha256: string }> = [];
	const replace = (source: string, before: string, after: string, id: string) => {
		if (source.split(before).length !== 2) {
			throw new Error(`Hydration SSR trace source preimage mismatch: ${id}`);
		}
		return source.replace(before, () => after);
	};
	const plugin: Plugin = {
		name: 'octane-test-hydration-ssr-trace',
		enforce: 'pre',
		resolveId(id) {
			if (id === hydrationTraceModule) return resolvedHydrationTraceModule;
		},
		load(id) {
			if (id === resolvedHydrationTraceModule) return hydrationTraceSource;
		},
		transform(code, id, options) {
			const file = id.split('?')[0];
			const source = sources.get(file);
			if (!options?.ssr || source === undefined) return;
			if (code !== source) throw new Error(`Hydration SSR trace raw source mismatch: ${id}`);
			let traced = code;
			if (file === runtimeFile) {
				traced = replace(
					traced,
					'let CURRENT_SCOPE: SSRScope | null = null;',
					`import { runtime as __testHydrationRuntimeTrace } from ${JSON.stringify(hydrationTraceModule)};\nconst __testHydrationTrace = __testHydrationRuntimeTrace(${JSON.stringify(id)}, import.meta.url);\nlet CURRENT_SCOPE: SSRScope | null = null;`,
					id,
				);
				traced = replace(
					traced,
					'\tregisterContext(ctx);\n',
					'\tregisterContext(ctx);\n\t__testHydrationTrace.context(ctx);\n',
					id,
				);
				traced = replace(
					traced,
					'\tscope.$$ctxValues.set(context, props.value);\n',
					'\tscope.$$ctxValues.set(context, props.value);\n\t__testHydrationTrace.provider(context, scope, CURRENT_SCOPE);\n',
					id,
				);
				traced = replace(
					traced,
					'\t\tif (s.$$ctxValues !== null && s.$$ctxValues.has(ctx)) return s.$$ctxValues.get(ctx) as T;\n\t}\n\treturn ctx.defaultValue;\n',
					'\t\tif (s.$$ctxValues !== null && s.$$ctxValues.has(ctx)) {\n\t\t\tconst value = s.$$ctxValues.get(ctx);\n\t\t\t__testHydrationTrace.hit(ctx, CURRENT_SCOPE, s, value != null);\n\t\t\treturn value as T;\n\t\t}\n\t}\n\t__testHydrationTrace.miss(ctx, CURRENT_SCOPE);\n\treturn ctx.defaultValue;\n',
					id,
				);
			} else {
				traced = replace(
					traced,
					'export const QueryClientContext = createContext<QueryClient | undefined>(undefined);\n',
					`import { contextModule as __testHydrationContextTrace } from ${JSON.stringify(hydrationTraceModule)};\nexport const QueryClientContext = createContext<QueryClient | undefined>(undefined);\n__testHydrationContextTrace(${JSON.stringify(id)}, import.meta.url, QueryClientContext);\n`,
					id,
				);
			}
			transformed.push({ id, sourceSha256: createHash('sha256').update(source).digest('hex') });
			return { code: traced, map: null };
		},
	};
	return { plugin, transformed };
}

function traceResolutionRule(rule: string | RegExp | (string | RegExp)[] | true | undefined) {
	if (Array.isArray(rule))
		return rule.map((value) => (typeof value === 'string' ? value : value.toString()));
	return rule instanceof RegExp ? rule.toString() : rule;
}

function hydrationTraceGraph(server: Awaited<ReturnType<typeof createServer>>) {
	const environment = server.environments.ssr;
	// Vite 8's ssrLoadModule uses this compatibility runner, not environment.runner.
	// Read its already-populated cache without creating or fetching another runner.
	const runner = Reflect.get(server, '_ssrCompatModuleRunner') as ModuleRunner | undefined;
	return {
		aliases: server.config.resolve.alias.map(({ find, replacement }) => ({
			find: typeof find === 'string' ? find : find.toString(),
			replacement,
		})),
		noExternal: traceResolutionRule(environment.config.resolve.noExternal),
		external: traceResolutionRule(environment.config.resolve.external),
		conditions: environment.config.resolve.conditions,
		externalConditions: environment.config.resolve.externalConditions,
		modules: runner
			? Array.from(runner.evaluatedModules.idToModuleMap.values(), (module) => ({
					id: module.id,
					url: module.url,
					file: module.file,
					evaluated: module.evaluated,
					imports: Array.from(module.imports),
					importers: Array.from(module.importers),
					externalize: module.meta && 'externalize' in module.meta ? module.meta.externalize : null,
				}))
			: null,
	};
}

async function withHydrationServer<T>(
	binding: HydrationBinding,
	fixture: string,
	exportName: string,
	run: (
		server: Awaited<ReturnType<typeof createServer>>,
		serverRuntime: string,
		setPhase: (phase: string) => void,
	) => Promise<T>,
): Promise<T> {
	const serverRuntime = resolve(repositoryRoot, 'packages/octane/src/server/index.ts');
	const trace = process.env.OCTANE_HYDRATION_SSR_TRACE === '1' ? hydrationTracePlugin() : null;
	const server = await createServer({
		configFile: false,
		root: repositoryRoot,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [...(trace ? [trace.plugin] : []), octane({ ssr: true })],
		ssr: {
			noExternal:
				binding === 'base-ui'
					? ['@octanejs/base-ui', '@octanejs/base-ui-utils', '@octanejs/floating-ui']
					: [],
		},
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: serverRuntime },
				{ find: /^octane\/server$/, replacement: serverRuntime },
				{
					find: /^octane\/static$/,
					replacement: resolve(repositoryRoot, 'packages/octane/src/static/index.ts'),
				},
				...bindingAliases(binding),
			],
		},
		// This server renders one immutable fixture. Unrelated parity suites create
		// tsconfig.json files under the root, which invalidate SSR even with HMR off.
		server: { middlewareMode: true, hmr: false, watch: null },
	});

	const invocation = {
		id: `${process.pid}:${++hydrationTraceInvocation}`,
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		binding,
		fixture,
		exportName,
	};
	let traceModule: HydrationTraceModule | null = null;
	try {
		if (trace) {
			traceModule = (await server.ssrLoadModule(hydrationTraceModule)) as HydrationTraceModule;
			traceModule!.configure(invocation);
		}
		return await run(server, serverRuntime, (phase) => traceModule?.setPhase(phase));
	} catch (error) {
		if (trace) {
			// A broken diagnostic must not replace the original fixture failure.
			try {
				process.stderr.write(
					'[OCTANE_HYDRATION_SSR_TRACE] ' +
						JSON.stringify({
							...(traceModule?.failure() ?? {
								schema: 1,
								invocation,
							}),
							transformed: trace.transformed,
							graph: hydrationTraceGraph(server),
						}) +
						'\n',
				);
			} catch {
				/* Preserve the original throw even if stderr is unavailable. */
			}
		}
		throw error;
	} finally {
		await server.close();
	}
}

/**
 * Render a fixture through Vite's real SSR compiler before hydrating its
 * separately client-compiled twin. Provider and component-range markers are
 * renderer-specific, so React markup cannot stand in for Octane server HTML.
 */
export async function renderHydrationFixture(
	binding: HydrationBinding,
	fixture: string,
	exportName: string,
	props?: unknown,
): Promise<RenderResult> {
	return withHydrationServer(
		binding,
		fixture,
		exportName,
		async (server, serverRuntime, setPhase) => {
			setPhase('load-render-fixture');
			const [module, runtime] = await Promise.all([
				server.ssrLoadModule(resolve(repositoryRoot, fixture)),
				server.ssrLoadModule(serverRuntime),
			]);
			const component = module[exportName];
			if (typeof component !== 'function') {
				throw new Error(`Missing server fixture export: ${fixture}#${exportName}`);
			}
			setPhase('render-fixture');
			return runtime.renderToString(component, props);
		},
	);
}

export async function executeHydrationFixture<T>(
	binding: HydrationBinding,
	fixture: string,
	exportName: string,
	...args: unknown[]
): Promise<T> {
	return withHydrationServer(
		binding,
		fixture,
		exportName,
		async (server, _serverRuntime, setPhase) => {
			setPhase('load-execute-fixture');
			const module = await server.ssrLoadModule(resolve(repositoryRoot, fixture));
			const execute = module[exportName];
			if (typeof execute !== 'function') {
				throw new Error(`Missing server fixture function: ${fixture}#${exportName}`);
			}
			setPhase('execute-fixture');
			return execute(...args) as Promise<T>;
		},
	);
}
