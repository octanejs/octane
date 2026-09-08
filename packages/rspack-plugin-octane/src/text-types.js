/**
 * Type analysis is an opt-in production build concern. Keep TypeScript out of
 * the ordinary loader's module graph and retain one project per compiler and
 * renderer configuration, rather than one TypeScript Program per module.
 */
const projectsByCompiler = new WeakMap();

export function registerTextTypeCompiler(compiler, tsconfig, root) {
	if (projectsByCompiler.has(compiler)) {
		throw new Error('@octanejs/rspack-plugin: only one text type project may own a compiler.');
	}
	projectsByCompiler.set(compiler, { tsconfig, root, projects: new Map(), closed: false });
}

export function invalidateTextTypeCompiler(compiler) {
	const state = projectsByCompiler.get(compiler);
	if (!state || state.closed) return;
	for (const project of state.projects.values()) project.invalidate();
}

export function disposeTextTypeCompiler(compiler) {
	const state = projectsByCompiler.get(compiler);
	if (!state) return;
	state.closed = true;
	for (const project of state.projects.values()) project.dispose();
	state.projects.clear();
	projectsByCompiler.delete(compiler);
}

export async function textTypeFactsForLoader(compiler, tsconfig, renderers, filename, source) {
	const state = projectsByCompiler.get(compiler);
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
