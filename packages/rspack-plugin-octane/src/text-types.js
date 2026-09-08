/**
 * Type analysis is an opt-in production build concern. Keep TypeScript out of
 * the ordinary loader's module graph and retain one project per compiler and
 * renderer configuration, rather than one TypeScript Program per module.
 */
// Rspack loads the plugin from its application's module graph and the loader
// through its loader runner. Those can instantiate this ESM module separately
// (for example under Vitest), even though both receive the same compiler.
// Keep the project on that compiler under a process-wide symbol instead of in
// module-local state. Typed builds use the main-thread loader.
const COMPILER_TEXT_TYPES = Symbol.for('@octanejs/rspack-plugin/text-types/v1');

function compilerState(compiler) {
	return compiler?.[COMPILER_TEXT_TYPES];
}

export function registerTextTypeCompiler(compiler, tsconfig, root) {
	if (compilerState(compiler)) {
		throw new Error('@octanejs/rspack-plugin: only one text type project may own a compiler.');
	}
	Object.defineProperty(compiler, COMPILER_TEXT_TYPES, {
		value: { tsconfig, root, projects: new Map(), closed: false },
		configurable: true,
	});
}

export function invalidateTextTypeCompiler(compiler) {
	const state = compilerState(compiler);
	if (!state || state.closed) return;
	for (const project of state.projects.values()) project.invalidate();
}

export function disposeTextTypeCompiler(compiler) {
	const state = compilerState(compiler);
	if (!state) return;
	state.closed = true;
	for (const project of state.projects.values()) project.dispose();
	state.projects.clear();
	delete compiler[COMPILER_TEXT_TYPES];
}

export async function textTypeFactsForLoader(compiler, tsconfig, renderers, filename, source) {
	const state = compilerState(compiler);
	if (!state || state.tsconfig !== tsconfig || state.closed) {
		throw new Error(
			'@octanejs/rspack-plugin: `textTypes` requires the OctaneRspackPlugin on the same compiler.',
		);
	}
	// The optional TypeScript peer and Volar adapter are loaded only by an opted-in
	// production compiler. import() also shares its module initialization across
	// concurrently built modules without retaining a checker in loader options.
	const { createTextTypeProject } = await import('octane/compiler/typescript');
	if (state.closed)
		throw new Error('@octanejs/rspack-plugin: compiler closed during type analysis.');
	const key = renderers?.signature ?? 'dom';
	let project = state.projects.get(key);
	if (!project) {
		project = createTextTypeProject({ tsconfig, root: state.root, renderers });
		state.projects.set(key, project);
	}
	return project.snapshot(filename, source);
}
