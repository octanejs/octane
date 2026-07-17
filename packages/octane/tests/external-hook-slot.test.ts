import { describe, it, expect, vi } from 'vitest';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mount } from './_helpers';
import { slotHooks } from '../src/compiler/slot-hooks.js';
import { discoverOctaneSourceDependencies, octane } from '../src/compiler/vite.js';
import {
	TsrxSingle,
	TsrxReuse,
	TsrxNested,
	TsrxCrossModule,
} from './_fixtures/external-hook-callers.tsrx';
import { TsxApp, TsxReuse } from './_fixtures/external-hook-tsx.tsx';

// Cross-file "hooks everywhere": a custom hook in a plain .ts module gets its base
// hooks slotted by the surgical pass; a .tsrx OR .tsx caller wraps the call in
// withSlot. The combination makes the .ts hook work — single use, reuse with
// independent state, and nested composition — across the module boundary.

describe('.ts custom hook consumed from .tsrx', () => {
	it('single use works (base hooks slotted in the .ts module)', () => {
		const r = mount(TsrxSingle as any);
		expect(r.find('.s').textContent).toBe('0/n');
		r.click('.s');
		expect(r.find('.s').textContent).toBe('1/y'); // both base hooks in the .ts hook advanced
		r.unmount();
	});

	it('reused twice keeps independent state', () => {
		const r = mount(TsrxReuse as any);
		expect([r.find('.a').textContent, r.find('.b').textContent]).toEqual(['0', '100']);
		r.click('.a');
		expect([r.find('.a').textContent, r.find('.b').textContent]).toEqual(['1', '100']);
		r.click('.b');
		expect([r.find('.a').textContent, r.find('.b').textContent]).toEqual(['1', '101']);
		r.unmount();
	});

	it('a .ts hook composing another .ts hook (nested) works', () => {
		const r = mount(TsrxNested as any);
		expect(r.find('.n').textContent).toBe('x:5');
		r.click('.n');
		expect(r.find('.n').textContent).toBe('x:6');
		r.unmount();
	});

	it('nested plain-TS hooks from separate modules receive disjoint production ranges', () => {
		const r = mount(TsrxCrossModule as any);
		expect([r.find('.left').textContent, r.find('.right').textContent]).toEqual(['1', '100']);
		r.click('.right');
		expect([r.find('.left').textContent, r.find('.right').textContent]).toEqual(['1', '101']);
		r.click('.left');
		expect([r.find('.left').textContent, r.find('.right').textContent]).toEqual(['2', '101']);
		r.unmount();
	});
});

describe('.ts custom hook consumed from .tsx', () => {
	it('a .tsx component composes its own base hook + the .ts hook', () => {
		const r = mount(TsxApp as any, { base: 10 });
		expect([r.find('.local').textContent, r.find('.ext').textContent]).toEqual(['10', '0']);
		r.click('.local');
		r.click('.ext');
		expect([r.find('.local').textContent, r.find('.ext').textContent]).toEqual(['11', '1']);
		r.unmount();
	});

	it('the .ts hook reused twice in one .tsx component stays independent', () => {
		const r = mount(TsxReuse as any);
		expect([r.find('.xa').textContent, r.find('.xb').textContent]).toEqual(['0', '100']);
		r.click('.xa');
		expect([r.find('.xa').textContent, r.find('.xb').textContent]).toEqual(['1', '100']);
		r.unmount();
	});
});

describe('slotHooks surgical pass', () => {
	const SRC = readFileSync(
		join(process.cwd(), 'packages/octane/tests/_fixtures/external-hook.ts'),
		'utf8',
	);

	it('slots base hooks and leaves all other bytes (incl. un-printable TS) verbatim', () => {
		const out = slotHooks(SRC, 'external-hook.ts');
		expect(out).not.toBeNull();
		const code = out!.code;
		// Two-item destructures retain the allocation-free public base-hook path,
		// and both calls still receive their compiler slot.
		expect(code).toMatch(/useState<number>\(start, _h\$\d+\)/);
		expect(code).toMatch(/useState<boolean>\(false, _h\$\d+\)/);
		// the un-printable TS is preserved byte-for-byte
		expect(code).toContain('[key: string]: number;');
		expect(code).toContain('export type Pair<A, B> = { a: A; b: B };');
		expect(code).toContain('export const widen = <T>(x: T): T => x;');
		// custom-hook calls are NOT wrapped here (the .tsrx/.tsx caller does that)
		expect(code).not.toContain('withSlot(');
		// Apart from inferred dependency arrays, the transform remains surgical:
		// stripping slots restores every original byte. (Default = no HMR → one
		// runtime-reserved Symbol range; Symbol.for is dev-serve only.)
		const stripped = code
			.replace(/^import \{ hookSlots as _\$hookSlots \} from 'octane';\n/gm, '')
			.replace(/^const _hs\$ = \/\* @__PURE__ \*\/ _\$hookSlots\(\d+\);\n/gm, '')
			.replace(/^const _h\$\d+ = Symbol\(_hs\$(?: \+ \d+)?\);\n/gm, '')
			.replace(/, _h\$\d+(?=[),])/g, '');
		expect(stripped).toBe(
			SRC.replace("useCallback(() => 'nd:' + label)", "useCallback(() => 'nd:' + label, [label])"),
		);
	});

	it('returns null (untouched) for modules with no octane base hook', () => {
		expect(slotHooks(`const x = 1; export { x };`, 'a.ts')).toBeNull(); // no octane import
		expect(
			slotHooks(
				`import { createContext } from 'octane';\nexport const c = createContext(0);`,
				'b.ts',
			),
		).toBeNull();
		expect(
			slotHooks(`import { useState } from 'octane';\nexport const ZERO = 0;`, 'c.ts'),
		).toBeNull(); // imported but never called
	});

	it('keeps nested hooks on the render path instead of memoizing around them', () => {
		const sources = [
			`import { use } from 'octane';
			 export function useData(load, promise) {
			   const value = use(load(use(promise)));
			   return value;
			 }`,
			`import { use, useContext } from 'octane';
			 export function useData(load, Context) {
			   const value = use(load(useContext(Context)));
			   return value;
			 }`,
			`import { use } from 'octane';
			 function useResourceKey() { return 'key'; }
			 export function useData(load) {
			   const value = use(load(useResourceKey()));
			   return value;
			 }`,
		];

		// A memo hit must never skip a nested built-in or custom hook. These
		// arguments remain unchanged until they can be analyzed as hook-free.
		for (const source of sources) expect(slotHooks(source, 'nested-hook.ts')).toBeNull();
	});
});

describe('vite plugin gate routing', () => {
	const plugin = octane({ exclude: ['/packages/zustand/src/'] });
	const appRoot = join(process.cwd(), 'app');
	// the transform doesn't need a real plugin `this` for the client paths
	const run = (code: string, id: string) => (plugin.transform as any).call({}, code, id);
	const HOOK = `import { useState } from 'octane';\nexport const f = () => { const [state, setState] = useState(0); return [state, setState]; };`;

	it('.ts with an octane hook → surgical slot pass', () => {
		expect(run(HOOK, join(appRoot, 'h.ts'))?.code).toMatch(/useState\(0, _h\$\d+\)/);
	});

	it('.js with an octane hook → surgical slot pass', () => {
		expect(run(HOOK, join(appRoot, 'h.js'))?.code).toMatch(/useState\(0, _h\$\d+\)/);
	});

	it('.tsx → full compiler (JSX lowered, hook slotted)', () => {
		const tsx = run(
			`import { useState } from 'octane';\nexport function C() { const [n] = useState(0); return <b>{n as string}</b>; }`,
			join(appRoot, 'c.tsx'),
		);
		expect(tsx?.code).toMatch(/_h\$\d+/); // hook slotted
		expect(tsx?.code).toMatch(/_frag\$|template\(/); // JSX lowered (slot-pass never emits these)
	});

	it('skips unrelated node_modules, the exclude option, and .d.ts', () => {
		expect(run(HOOK, '/x/node_modules/pkg/h.ts')).toBeNull();
		expect(run(`export function C() { return <b/>; }`, '/x/node_modules/pkg/c.tsx')).toBeNull();
		expect(run(HOOK, '/packages/zustand/src/index.ts')).toBeNull();
		expect(run(`import { useState } from 'octane';`, '/app/types.d.ts')).toBeNull();
	});

	it('transforms installed raw Octane packages but preserves manual-slot sources', () => {
		const installedRoot = join(process.cwd(), 'node_modules/.pnpm/node_modules/@octanejs');
		const hookForm = join(installedRoot, 'hook-form/src/__probe__.ts');
		const hookFormTsx = join(installedRoot, 'hook-form/src/__probe__.tsx');
		const zustand = join(installedRoot, 'zustand/src/__probe__.ts');

		expect(run(HOOK, hookForm)?.code).toMatch(/useState\(0, _h\$\d+\)/);
		expect(
			run(
				`import { useState } from 'octane'; export function C() { const [n] = useState(0); return <b>{n as string}</b>; }`,
				hookFormTsx,
			)?.code,
		).toMatch(/template\(/);
		// Zustand declares octane.hookSlots.manual=["src"], so installed and
		// workspace-linked copies both retain their explicit sub-slot ABI.
		expect(run(HOOK, zustand)).toBeNull();
	});

	it('configures installed Octane source packages for Vite transformation', () => {
		const websiteRoot = join(process.cwd(), 'website');
		const discovered = discoverOctaneSourceDependencies(websiteRoot);
		expect(discovered).toContain('octane');
		expect(discovered).toContain('@octanejs/visx');
		expect(discovered).toContain('@octanejs/tanstack-router');
		expect(discovered).not.toContain('@octanejs/adapter-vercel');

		const config = (octane().config as any)({ root: websiteRoot });
		expect(config.optimizeDeps.exclude).toEqual(discovered);
		expect(config.ssr.noExternal).toEqual(discovered);
		expect(config.resolve.dedupe).toContain('octane');
	});

	it('honors source-package Vite family exclusions without rebasing dependency resolution', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-vite-exclusions-'));
		try {
			writeFileSync(
				join(fixtureRoot, 'package.json'),
				JSON.stringify({
					name: 'binding-only-consumer',
					private: true,
					dependencies: {
						'@lexical/selection': '0.46.0',
						'@octanejs/lexical': '0.1.6',
					},
				}),
			);
			const scope = join(fixtureRoot, 'node_modules/@octanejs');
			mkdirSync(scope, { recursive: true });
			symlinkSync(join(process.cwd(), 'packages/lexical'), join(scope, 'lexical'), 'dir');

			const config = (octane().config as any)({ root: fixtureRoot });
			expect(config.optimizeDeps.exclude).toEqual(
				expect.arrayContaining([
					'@lexical/list',
					'@lexical/rich-text',
					'@lexical/selection',
					'@octanejs/lexical',
					'lexical',
				]),
			);
			// Vite's package resolver requires exact package IDs here. Octane expands
			// the binding-owned family rule across both the binding and app manifests.
			expect(config.optimizeDeps.exclude).not.toContain('@lexical/*');
			expect(config.resolve.dedupe).toContain('octane');
			expect(config.resolve.dedupe).not.toContain('lexical');
			expect(config.resolve.dedupe).not.toContain('@lexical/selection');
			expect(config.ssr.noExternal).toContain('@octanejs/lexical');
			expect(config.ssr.noExternal).not.toContain('lexical');
			expect(config.ssr.noExternal).not.toContain('@lexical/selection');
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('forwards declarative renderer selection through the direct Vite adapter', () => {
		const rendererPlugin = octane({
			hmr: false,
			renderers: {
				registry: { object: '/src/object-renderer.js' },
				boundaries: {
					'/src/object-boundaries.js': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
						},
					},
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});
		(rendererPlugin.config as any)({ root: appRoot });
		const transformed = (rendererPlugin.transform as any).call(
			{},
			'export function Scene() @{ <node /> }',
			join(appRoot, 'src/Scene.object.tsrx'),
		);

		expect(transformed?.code).toMatch(/from ["']\/src\/object-renderer\.js["']/);
		expect(() => octane({ renderers: { default: 'missing' } })).toThrow(
			/default references unknown renderer "missing"/,
		);
	});

	it('keeps client-only renderer identity stable while omitting its Vite server region', async () => {
		const rendererPlugin = octane({
			hmr: false,
			renderers: {
				registry: {
					object: {
						module: '/src/object-renderer.js',
						server: 'client-only',
					},
				},
				boundaries: {
					'@scene/client': {
						Canvas: {
							ownerRenderer: 'dom',
							childRenderer: 'object',
							prop: 'children',
							server: 'omit-child',
						},
					},
				},
				rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			},
		});
		(rendererPlugin.config as any)({ root: appRoot });
		const sceneId = join(appRoot, 'src/scenes/Scene.object.tsrx');
		const sceneSource = 'export default function Scene() @{ <node /> }\n';
		const client = await (rendererPlugin.transform as any).call({}, sceneSource, sceneId);
		const server = await (rendererPlugin.transform as any).call(
			{ resolve: async () => null },
			sceneSource,
			sceneId,
			{ ssr: true },
		);

		const clientReference = client.meta['octane:client-reference'];
		expect(clientReference).toEqual({
			id: 'octane-client-reference-v1:object:/src/scenes/Scene.object.tsrx',
			moduleId: '/src/scenes/Scene.object.tsrx',
			renderer: 'object',
		});
		expect(server.meta['octane:client-reference']).toEqual(clientReference);
		expect(server.code).not.toContain('<node');

		const appSource = `
import { Canvas } from '@scene/client';
import Scene from './scenes/Scene.object.tsrx';
export function App() @{ <main><Canvas><Scene /></Canvas><p>after</p></main> }
`;
		const app = await (rendererPlugin.transform as any).call(
			{
				resolve: async (request: string) => ({
					id:
						request === './scenes/Scene.object.tsrx'
							? sceneId
							: join(appRoot, 'node_modules/scene-client/index.js'),
				}),
			},
			appSource,
			join(appRoot, 'src/App.tsrx'),
			{ ssr: true },
		);
		expect(app.code).toContain('Canvas');
		expect(app.code).toContain('after');
		expect(app.code).not.toContain('Scene(');

		const liveSource = appSource.replace(
			'export function App() @{',
			'export function App() @{ const live = Scene as unknown;',
		);
		await expect(
			(rendererPlugin.transform as any).call(
				{
					resolve: async (request: string) => ({
						id:
							request === './scenes/Scene.object.tsrx'
								? sceneId
								: join(appRoot, 'node_modules/scene-client/index.js'),
					}),
				},
				liveSource,
				join(appRoot, 'src/LiveApp.tsrx'),
				{ ssr: true },
			),
		).rejects.toMatchObject({
			code: 'OCTANE_CLIENT_ONLY_SERVER_USE',
			filename: '/src/LiveApp.tsrx',
		});
	});

	it('canonicalizes client-reference identity through a symlinked Vite root', async () => {
		const parent = mkdtempSync(join(tmpdir(), 'octane-vite-renderer-root-'));
		try {
			const root = join(parent, 'real-project');
			const linkedRoot = join(parent, 'linked-project');
			mkdirSync(join(root, 'src'), { recursive: true });
			symlinkSync(root, linkedRoot, 'dir');
			const rendererPlugin = octane({
				hmr: false,
				renderers: {
					registry: {
						object: {
							module: '/src/object-renderer.js',
							server: 'client-only',
						},
					},
					rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
				},
			});
			(rendererPlugin.config as any)({ root: linkedRoot });
			const sceneId = join(realpathSync(root), 'src/Scene.object.tsrx');
			const transformed = await (rendererPlugin.transform as any).call(
				{},
				'export default function Scene() @{ <node /> }\n',
				sceneId,
			);

			expect(transformed.meta['octane:client-reference']).toEqual({
				id: 'octane-client-reference-v1:object:/src/Scene.object.tsrx',
				moduleId: '/src/Scene.object.tsrx',
				renderer: 'object',
			});
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	it('protects the profiling build constant throughout Vite config resolution', () => {
		const profiled = octane({ profile: true });
		expect(() =>
			(profiled.config as any)({
				root: appRoot,
				define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			}),
		).toThrow(/__OCTANE_PROFILE_ENABLED__.*reserved/);

		// The resolved check catches a plugin that overwrites Octane's earlier config.
		expect(() =>
			(profiled.configResolved as any)({
				root: appRoot,
				command: 'build',
				define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			}),
		).toThrow(/__OCTANE_PROFILE_ENABLED__.*reserved/);
	});

	it('warns that the removed parallelUse option is ignored', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			octane({ parallelUse: false } as any);
			expect(warn).toHaveBeenCalledTimes(1);
			expect(warn.mock.calls[0][0]).toMatch(/`parallelUse` option was removed/);
			warn.mockClear();
			octane();
			expect(warn).not.toHaveBeenCalled();
		} finally {
			warn.mockRestore();
		}
	});

	it('recursively discovers raw Octane bindings behind another binding', () => {
		const fixtureRoot = mkdtempSync(join(tmpdir(), 'octane-source-discovery-'));
		try {
			writeFileSync(
				join(fixtureRoot, 'package.json'),
				JSON.stringify({
					name: 'consumer',
					private: true,
					dependencies: { '@octanejs/base-ui': '0.1.3' },
				}),
			);
			const scope = join(fixtureRoot, 'node_modules/@octanejs');
			mkdirSync(scope, { recursive: true });
			symlinkSync(join(process.cwd(), 'packages/base-ui'), join(scope, 'base-ui'), 'dir');

			const discovered = discoverOctaneSourceDependencies(fixtureRoot);
			expect(discovered).toContain('@octanejs/base-ui');
			expect(discovered).toContain('@octanejs/floating-ui');
		} finally {
			rmSync(fixtureRoot, { recursive: true, force: true });
		}
	});

	it('aliases bare Octane imports to the server runtime for SSR', async () => {
		const plugin = octane();
		const resolved = await (plugin.resolveId as any).call(
			{
				resolve(source: string) {
					return { id: '/consumer/node_modules/' + source + '/index.js' };
				},
			},
			'octane',
			'/consumer/node_modules/@octanejs/hook-form/src/useForm.ts',
			{ ssr: true },
		);
		expect(resolved).toBe('/consumer/node_modules/octane/server/index.js');
	});

	it('follows resolved and virtual module output when specializing production roots', async () => {
		const root = mkdtempSync(join(tmpdir(), 'octane-vite-root-proof-'));
		try {
			const src = join(root, 'src');
			mkdirSync(src);
			writeFileSync(join(root, 'package.json'), '{"name":"root-proof","private":true}\n');
			const entry = join(src, 'main.js');
			const requested = join(src, 'Main.tsrx');
			const aliased = join(src, 'Aliased.tsrx');
			const entrySource =
				"import { createRoot } from 'octane';\n" +
				"import Main from './Main.tsrx';\n" +
				'createRoot(document.body).render(Main);\n';
			const plugin = octane({ hmr: false });
			(plugin.configResolved as any)({ root, command: 'build', define: {} });

			// The requested disk file returns a value, but Vite aliases the import to
			// a compiled void component. The resolved module is authoritative.
			writeFileSync(requested, "export default function Main() { return 'disk value'; }\n");
			const aliasedModule = await (plugin.transform as any).call(
				{},
				'export default function Main() @{ <main>alias</main> }\n',
				aliased,
			);
			const aliasedEntry = await (plugin.transform as any).call(
				{
					resolve: async () => ({ id: aliased }),
					load: async () => ({
						id: aliased,
						code: aliasedModule.code,
						meta: aliasedModule.meta,
					}),
				},
				entrySource,
				entry,
			);
			expect(aliasedEntry?.code).toContain('__createVoidRoot');
			const changedAfterOctane = await (plugin.transform as any).call(
				{
					resolve: async () => ({ id: aliased }),
					load: async () => ({
						id: aliased,
						code: aliasedModule.code + '\n// changed by a later transform',
						meta: aliasedModule.meta,
					}),
				},
				entrySource,
				entry,
			);
			expect(changedAfterOctane).toBeNull();

			// Conversely, a virtual loader can replace a void-looking disk file with
			// a value-returning component. That actual loaded module must stay on the
			// generic root contract.
			writeFileSync(requested, 'export default function Main() @{ <main>disk</main> }\n');
			const virtualId = '\0virtual:Main.tsrx';
			const virtualModule = await (plugin.transform as any).call(
				{},
				"export default function Main() { return 'virtual value'; }\n",
				virtualId,
			);
			const virtualEntry = await (plugin.transform as any).call(
				{
					resolve: async () => ({ id: virtualId }),
					load: async () => ({
						id: virtualId,
						code: virtualModule.code,
						meta: virtualModule.meta,
					}),
				},
				entrySource,
				entry,
			);
			expect(virtualEntry).toBeNull();

			const watchPlugin = octane({ hmr: false });
			(watchPlugin.configResolved as any)({
				root,
				command: 'build',
				build: { watch: {} },
				define: {},
			});
			const watchedEntry = await (watchPlugin.transform as any).call(
				{
					resolve: async () => ({ id: aliased }),
					load: async () => ({
						id: aliased,
						code: aliasedModule.code,
						meta: aliasedModule.meta,
					}),
				},
				entrySource,
				entry,
			);
			expect(watchedEntry).toBeNull();
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('honors the // octane-no-slot opt-out and skips non-octane files', () => {
		expect(run(`// octane-no-slot\n${HOOK}`, '/app/binding.ts')).toBeNull();
		expect(run(`export const x = 1;`, '/app/plain.ts')).toBeNull();
	});
});

describe('manifest-declared manual hook slots', () => {
	// Bindings whose `.ts` sources hand-forward hook slots declare
	// `"octane": { "hookSlots": { "manual": ["src"] } }` in their OWN
	// package.json; the plugin finds the nearest manifest and skips the surgical
	// pass for files under the declared directories — no per-config `exclude`
	// lists. These transforms use REAL workspace paths so the walk hits the
	// actual manifests.
	const plugin = octane();
	const run = (code: string, id: string) => (plugin.transform as any).call({}, code, id);
	const HOOK = `import { useState } from 'octane';\nexport const f = () => { const [state, setState] = useState(0); return [state, setState]; };`;

	it('skips files under a directory declared manual', () => {
		const id = join(process.cwd(), 'packages/zustand/src/__probe__.ts');
		expect(run(HOOK, id)).toBeNull();
	});

	it("still slots the declaring package's OWN test files (scope is src, not the package)", () => {
		// Inline hook callbacks in a binding's tests rely on call-site slots —
		// the declaration must not swallow the whole package directory.
		const id = join(process.cwd(), 'packages/testing-library/tests/__probe__.ts');
		expect(run(HOOK, id)?.code).toMatch(/useState\(0, _h\$\d+\)/);
	});

	it('still slots packages without the declaration (redux is auto-slotted)', () => {
		const id = join(process.cwd(), 'packages/redux/src/__probe__.ts');
		expect(run(HOOK, id)?.code).toMatch(/useState\(0, _h\$\d+\)/);
	});

	it('still slots app files outside any declaring package', () => {
		const id = join(process.cwd(), 'packages/octane/tests/_fixtures/__probe__.ts');
		expect(run(HOOK, id)?.code).toMatch(/useState\(0, _h\$\d+\)/);
	});

	it('the declaration registry matches the hand-slot-forwarding bindings exactly', () => {
		// The definitive list. Adding a binding here without the manifest flag (or
		// removing the flag from a listed one) means its sources double-slot the
		// moment ANOTHER project imports them — the exact drift the declaration
		// exists to prevent. Redux, Recharts, and Hook Form are auto-slotted by
		// design and therefore carry no flag.
		const packagesDir = join(process.cwd(), 'packages');
		const declared = readdirSync(packagesDir)
			.filter((dir) => {
				try {
					const pkg = JSON.parse(readFileSync(join(packagesDir, dir, 'package.json'), 'utf8'));
					return Array.isArray(pkg.octane?.hookSlots?.manual);
				} catch {
					return false;
				}
			})
			.sort();
		expect(declared).toEqual([
			'aria',
			'base-ui',
			'dexie',
			'dnd-kit',
			'floating-ui',
			'i18next',
			'jotai',
			'lexical',
			'lucide',
			'mdx',
			'motion',
			'radix',
			'remix-router',
			'styled-components',
			'stylex',
			'tanstack-query',
			'tanstack-router',
			'tanstack-store',
			'tanstack-table',
			'tanstack-virtual',
			'testing-library',
			'three',
			'tiptap',
			'zustand',
		]);
	});
});
