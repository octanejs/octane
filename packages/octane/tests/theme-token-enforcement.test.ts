// @vitest-environment node
//
// U10 — in-<style> token-contract enforcement (R5). A `var(--name)` reference
// inside a scoped <style> block is claimed by a declared contract when `--name`
// starts with the contract's namespace (`--{prefix}-`); claimed-but-undeclared
// names fail compile through the collected-diagnostics channel, identical on
// the build (compile()) and editor (compileToVolarMappings) surfaces. Raw
// `var(--*)` outside every contract namespace stays legal legacy; a contract
// the host cannot reduce to facts warns "unresolved — unverified"; with no
// resolver configured the pass is silent by construction.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
// Import through the declared entry points (index.js/vite.js ship sibling
// .d.ts files) so the test is fully typed — leaf .js modules are untyped.
import {
	compile,
	compileToVolarMappings,
	createSyncTokenContractResolver,
	type CompileOptions,
	type TokenContractFacts,
} from '../src/compiler/index.js';
import { octane } from '../src/compiler/vite.js';

const FILE = '/src/App.tsrx';
const UNDECLARED = 'octane-style-token-undeclared';
const UNRESOLVED = 'octane-style-token-contract-unresolved';
const FIXTURE = fileURLToPath(new URL('./_fixtures/token-contract', import.meta.url));

const APP_CONTRACT = {
	namespace: '--app-',
	names: ['--app-colors-primary', '--app-colors-surface', '--app-space-sm', '--app-space-md'],
};

/** Facts for './tokens', silence for anything else. */
const forTokens =
	(
		probe: TokenContractFacts | readonly TokenContractFacts[] | null = APP_CONTRACT,
	): NonNullable<CompileOptions['resolveTokenContract']> =>
	(request) =>
		request === './tokens' ? probe : undefined;

function tokenDiagnostics(source: string, options: CompileOptions = {}) {
	return (compile(source, FILE, options).diagnostics ?? []).filter((diagnostic) =>
		diagnostic.code.startsWith('octane-style-token'),
	);
}

function consumer(style: string) {
	return `import { tokens } from './tokens';
export function Badge() @{
	<div>
		<style>
			${style}
		</style>
		<span class="badge">hi</span>
	</div>
}`;
}

describe('octane-style-token-undeclared', () => {
	it('fails a var(--*) reference the claimed contract does not declare (AE3)', () => {
		const source = consumer('.badge { color: var(--app-colors-primay); }');
		const found = tokenDiagnostics(source, { resolveTokenContract: forTokens() });
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ code: UNDECLARED, severity: 'error', filename: FILE });
		// AE3: the error names the missing token and its contract.
		expect(found[0].message).toContain('--app-colors-primay');
		expect(found[0].message).toContain('./tokens');
		expect(found[0].message).toContain('--app-colors-primary');
		expect(source.slice(found[0].start.offset, found[0].end.offset)).toBe('--app-colors-primay');
	});

	it('accepts declared references, fallbacks, and @media nesting', () => {
		const source = consumer(`
			.badge {
				color: var(--app-colors-primary);
				padding: var(--app-space-md, 4px);
			}
			@media (prefers-contrast: more) {
				.badge { border-color: var(--app-colors-surface); }
			}
		`);
		expect(tokenDiagnostics(source, { resolveTokenContract: forTokens() })).toEqual([]);
	});

	it('never errors on raw var(--*) outside every contract namespace', () => {
		const source = consumer(
			'.badge { margin: var(--legacy-page-gutter); border-color: var(--other-x); }',
		);
		expect(tokenDiagnostics(source, { resolveTokenContract: forTokens() })).toEqual([]);
	});

	it('claims nothing for an unprefixed contract (namespace --)', () => {
		// Without a prefix the contract cannot be told apart from the legacy
		// channel, so it stays unenforced — enforcement requires a prefix.
		const unprefixed = forTokens({ namespace: '--', names: ['--colors-bg'] });
		const source = consumer('.badge { color: var(--colors-bgg); margin: var(--other-x); }');
		expect(tokenDiagnostics(source, { resolveTokenContract: unprefixed })).toEqual([]);
	});

	it('enforces every namespace a multi-contract module resolves to', () => {
		const both = () => [
			{ namespace: '--app-', names: ['--app-colors-fg'] },
			{ namespace: '--admin-', names: ['--admin-colors-bg'] },
		];
		const bad = consumer(
			'.badge { color: var(--app-colors-fg); background: var(--admin-colors-bgg); }',
		);
		const found = tokenDiagnostics(bad, { resolveTokenContract: forTokens(both()) });
		expect(found).toHaveLength(1);
		expect(found[0].message).toContain('--admin-colors-bgg');
	});

	it('probes only authored value imports, not type-only or bare ones', () => {
		const seen: string[] = [];
		const source = `import type { Tokens } from './types';
import './side-effect';
import { tokens } from './tokens';
export function Badge() @{
	<div>
		<style>.badge { color: var(--app-colors-x); }</style>
		<span class="badge">hi</span>
	</div>
}`;
		tokenDiagnostics(source, {
			resolveTokenContract: (request: string) => {
				seen.push(request);
				return forTokens()(request, FILE);
			},
		});
		expect(seen).toEqual(['./tokens']);
	});
});

describe('octane-style-token-contract-unresolved', () => {
	it('warns — does not crash — when the claimed contract cannot be read', () => {
		const source = consumer('.badge { color: var(--app-colors-primary); }');
		const found = tokenDiagnostics(source, { resolveTokenContract: forTokens(null) });
		expect(found).toHaveLength(1);
		expect(found[0]).toMatchObject({ code: UNRESOLVED, severity: 'warning' });
		expect(found[0].message).toContain('./tokens');
		expect(found[0].message).toContain('unverified');
		expect(source.slice(found[0].start.offset, found[0].end.offset)).toBe("'./tokens'");
	});

	it('stays silent for imports the resolver does not claim', () => {
		const source = `import { helper } from './util';
export function Badge() @{
	<div>
		<style>.badge { color: var(--app-colors-x); }</style>
		<span class="badge">hi</span>
	</div>
}`;
		// No resolver claim (undefined for everything): even a contract-looking
		// reference stays silent — there is no namespace table to claim it.
		expect(tokenDiagnostics(source, { resolveTokenContract: () => undefined })).toEqual([]);
	});

	it('emits nothing at all when no resolver is configured', () => {
		const source = consumer('.badge { color: var(--app-colors-primay); }');
		expect(tokenDiagnostics(source)).toEqual([]);
	});

	it('emits nothing for a var()-free file even when a contract claim fails', () => {
		const source = `import { tokens } from './tokens';
export function Badge() @{ <div /> }`;
		expect(tokenDiagnostics(source, { resolveTokenContract: () => null })).toEqual([]);
	});
});

describe('surfaces and parity', () => {
	const BAD = consumer('.badge { color: var(--app-colors-primay); }');

	it('produces identical diagnostics through compile() and compileToVolarMappings', () => {
		const build = tokenDiagnostics(BAD, { resolveTokenContract: forTokens() });
		const editor = (
			compileToVolarMappings(BAD, FILE, {
				resolveTokenContract: forTokens(),
			}).diagnostics ?? []
		).filter((diagnostic) => diagnostic.code.startsWith('octane-style-token'));
		expect(build.length).toBeGreaterThan(0);
		expect(
			editor.map((d) => ({
				code: d.code,
				severity: d.severity,
				offset: d.start.offset,
				message: d.message,
			})),
		).toEqual(
			build.map((d) => ({
				code: d.code,
				severity: d.severity,
				offset: d.start.offset,
				message: d.message,
			})),
		);
	});

	it('promotes error-severity token diagnostics to Volar compile errors', () => {
		const result = compileToVolarMappings(BAD, FILE, {
			resolveTokenContract: forTokens(),
		});
		expect(result.errors.map((e: any) => e.code)).toContain(UNDECLARED);
	});

	it('keeps codegen byte-equal with enforcement on vs off', () => {
		for (const dev of [true, false]) {
			for (const mode of ['client', 'server'] as const) {
				const on = compile(BAD, FILE, { dev, mode, resolveTokenContract: forTokens() });
				const off = compile(BAD, FILE, { dev, mode });
				expect(on.code).toBe(off.code);
				expect(JSON.stringify(on.map)).toBe(JSON.stringify(off.map));
				expect(on.diagnostics.length).toBeGreaterThan(off.diagnostics.length);
			}
		}
	});

	it('honors octane-ignore suppression in CSS and JS comments', () => {
		const inSheet = consumer(`
			/* octane-ignore octane-style-token-undeclared */
			.badge { color: var(--app-colors-primay); }
		`);
		expect(tokenDiagnostics(inSheet, { resolveTokenContract: forTokens() })).toEqual([]);

		const atImport = `// octane-ignore octane-style-token-contract-unresolved
import { tokens } from './tokens';
export function Badge() @{
	<div>
		<style>.badge { color: var(--app-colors-primary); }</style>
		<span class="badge">hi</span>
	</div>
}`;
		expect(tokenDiagnostics(atImport, { resolveTokenContract: forTokens(null) })).toEqual([]);
	});
});

describe('createSyncTokenContractResolver', () => {
	const resolver = createSyncTokenContractResolver({ existsSync, readFileSync });
	const importer = join(FIXTURE, 'consumer.tsrx');

	it('reads a contract module into namespaced facts', () => {
		expect(resolver('./tokens', importer)).toEqual(APP_CONTRACT);
	});

	it('returns a fact list for a multi-contract module', () => {
		expect(resolver('./multi', importer)).toEqual([
			{ namespace: '--app-', names: ['--app-colors-fg'] },
			{ namespace: '--admin-', names: ['--admin-colors-bg'] },
		]);
	});

	it('distinguishes not-a-contract from claimed-but-unreadable', () => {
		expect(resolver('./plain', importer)).toBeUndefined();
		expect(resolver('./does-not-exist', importer)).toBeUndefined();
		expect(resolver('./broken', importer)).toBeNull();
	});

	it('memoizes reads per resolved file', () => {
		let reads = 0;
		const counting = createSyncTokenContractResolver({
			existsSync,
			readFileSync: (file: string) => {
				reads++;
				return readFileSync(file, 'utf8');
			},
		});
		expect(counting('./tokens', importer)).toEqual(APP_CONTRACT);
		expect(counting('./tokens', importer)).toEqual(APP_CONTRACT);
		expect(reads).toBe(1);
	});

	it('drives compile() end-to-end from real files', () => {
		const source = `import { tokens } from './_fixtures/token-contract/tokens';
export function Badge() @{
	<div>
		<style>.badge { color: var(--app-colors-primay); }</style>
		<span class="badge">hi</span>
	</div>
}`;
		// Only the importer's dirname matters to the resolver.
		const file = join(FIXTURE, '../../consumer.tsrx');
		const found = (
			compile(source, file, { resolveTokenContract: resolver }).diagnostics ?? []
		).filter((d) => d.code.startsWith('octane-style-token'));
		expect(found).toHaveLength(1);
		expect(found[0].code).toBe(UNDECLARED);
	});
});

describe('vite host plumbing', () => {
	const BAD = consumer('.badge { color: var(--app-colors-primay); }');
	const importer = join(FIXTURE, 'Badge.tsrx');

	function pluginContext(warn: ReturnType<typeof vi.fn>) {
		const watched: string[] = [];
		return {
			watched,
			context: {
				environment: 'client',
				addWatchFile: (id: string) => watched.push(id),
				// The bundler resolves the authored request before compile() runs.
				resolve: async (request: string) =>
					request === './tokens' ? { id: join(FIXTURE, 'tokens.ts') } : null,
			},
			pluginConfig: {
				root: FIXTURE,
				command: 'build' as const,
				build: {},
				define: {},
				logger: { warn },
			},
		};
	}

	it('resolves the imported contract through the plugin context before compile', async () => {
		const warn = vi.fn();
		const { context, pluginConfig, watched } = pluginContext(warn);
		const plugin = octane({ hmr: false });
		await (plugin.config as any)({ root: FIXTURE }, { command: 'build' });
		await (plugin.configResolved as any)(pluginConfig);
		const result = await (plugin.transform as any).call(context, BAD, importer, { ssr: false });
		expect(typeof result?.code).toBe('string');
		// The resolved contract file is watched so edits invalidate its facts.
		expect(watched).toContain(join(FIXTURE, 'tokens.ts'));
		// Diagnostics reach the host through the plugin's logger channel.
		expect(warn.mock.calls.flat().map(String).join('\n')).toContain(UNDECLARED);
	});

	it('warns unresolved for a claimed contract that fails extraction', async () => {
		const warn = vi.fn();
		const { context, pluginConfig } = pluginContext(warn);
		context.resolve = async (request: string) =>
			request === './tokens' ? { id: join(FIXTURE, 'broken.ts') } : null;
		const plugin = octane({ hmr: false });
		await (plugin.config as any)({ root: FIXTURE }, { command: 'build' });
		await (plugin.configResolved as any)(pluginConfig);
		await (plugin.transform as any).call(context, BAD, importer, { ssr: false });
		expect(warn.mock.calls.flat().map(String).join('\n')).toContain(UNRESOLVED);
	});

	it('stays silent when no import resolves to a contract', async () => {
		const warn = vi.fn();
		const { context, pluginConfig } = pluginContext(warn);
		context.resolve = async () => null;
		const plugin = octane({ hmr: false });
		await (plugin.config as any)({ root: FIXTURE }, { command: 'build' });
		await (plugin.configResolved as any)(pluginConfig);
		const result = await (plugin.transform as any).call(context, BAD, importer, { ssr: false });
		expect(typeof result?.code).toBe('string');
		expect(warn.mock.calls.flat().map(String).join('\n')).not.toContain('octane-style-token');
	});
});
