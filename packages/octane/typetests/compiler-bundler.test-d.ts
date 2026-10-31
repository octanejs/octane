import {
	analyzeCompiledModule,
	canonicalModuleId,
	createClientReferenceManifest,
	createOctaneCompiler,
	discoverOctaneSourceDependencies,
	normalizeRendererConfig,
	resolveRendererForFile,
	type OctaneCompiler,
	type OctaneCompilerOptions,
	type OctaneTransformResult,
} from 'octane/compiler/bundler';
import * as renderers from 'octane/compiler/renderers';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertNotAny<T> = IsAny<T> extends false ? true : never;

// The default compiler, as a custom build pipeline creates it.
export const defaultCompiler: OctaneCompiler = createOctaneCompiler();
export const compilerIsTyped: AssertNotAny<typeof defaultCompiler> = true;

export const options = {
	root: process.cwd(),
	environment: 'server',
	output: 'ts',
	hmr: 'webpack',
	strong: true,
	requireDirective: true,
	exclude: ['/host-owned/'],
	renderers: {
		registry: { object: { module: '/src/object-renderer.js', server: 'client-only' } },
		rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
	},
	warn: (message: string) => console.warn(message),
} satisfies OctaneCompilerOptions;

const compiler = createOctaneCompiler(options);
export const result: OctaneTransformResult | null = compiler.transform('', '/src/App.tsrx', {
	environment: 'client',
	isVoidComponentImport: (request, imported) => request === 'octane' && imported === 'memo',
});
if (result !== null) {
	const code: string = result.code;
	const mappings: string | undefined = result.map?.mappings;
	const watched: string[] = result.dependencies;
	const lang: 'ts' | undefined = result.lang;
	void [code, mappings, watched, lang];
}
compiler.invalidate('/package.json');
compiler.invalidate();
export const packages: string[] = compiler.discoverSourceDependencies().packages;
export const discovered: string[] = discoverOctaneSourceDependencies(process.cwd());
export const canonical: string = canonicalModuleId('/root/src/App.tsrx?octane-hydrate=0', '/root');
export const reference = compiler.clientReferenceForFile('/src/Scene.object.tsrx');
export const manifestVersion: 1 = createClientReferenceManifest(
	reference === null ? [] : [{ reference, chunks: ['scene.js'] }],
).version;
export const compiled = analyzeCompiledModule('export function A() {}', '/A.js');

// A configuration normalized once keeps working as compiler input.
export const normalized = normalizeRendererConfig(options.renderers);
export const target: 'dom' | 'universal' | 'valdi' = resolveRendererForFile(
	normalized,
	'/src/App.tsrx',
).target;
createOctaneCompiler({ renderers: normalized });
export const sameRenderers: typeof renderers.resolveRendererForFile = resolveRendererForFile;

// @ts-expect-error — compiler options are a closed public surface.
createOctaneCompiler({ handWrittenBundlerShim: true });
// @ts-expect-error — the compiler has only client and server environments.
createOctaneCompiler({ environment: 'types' });
// @ts-expect-error — the HMR dialect is Vite or webpack.
createOctaneCompiler({ hmr: 'rspack' });
// @ts-expect-error — transforms read authored source text.
compiler.transform({}, '/src/App.tsrx');
// @ts-expect-error — a renderer rule names the renderer it selects.
normalizeRendererConfig({ rules: [{ include: 'src/**' }] });
