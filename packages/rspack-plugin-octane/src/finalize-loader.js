/**
 * Rspack does not copy a module's layer or buildInfo into parallel-loader
 * workers. Pitch data is structured-cloned into the worker before compilation.
 */
export function pitch() {
	this.data ??= {};
	this.data.octaneLayer = this._module?.layer ?? null;
	if (this._module?.buildInfo && typeof this._module.buildInfo === 'object') {
		delete this._module.buildInfo.octane;
	}
}

/** Restore worker-owned Octane metadata and missing-file watches on the main thread. */
export default function finalizeOctaneLoader(source, sourceMap, metadata) {
	const result = metadata?.__octaneParallelLoader;
	if (result?.buildInfo) {
		if (!this._module.buildInfo || typeof this._module.buildInfo !== 'object') {
			this._module.buildInfo = {};
		}
		this._module.buildInfo.octane = result.buildInfo;
	}
	for (const dependency of result?.missingDependencies ?? []) {
		this.addMissingDependency(dependency);
	}
	if (metadata && typeof metadata === 'object') {
		const { __octaneParallelLoader, ...remainingMetadata } = metadata;
		if (Object.keys(remainingMetadata).length > 0) {
			this.callback(null, source, sourceMap, remainingMetadata);
			return;
		}
	}
	this.callback(null, source, sourceMap);
}
