import octaneLoader from './loader.js';

/**
 * Run the unchanged public Octane loader inside Rspack's worker pool. Rspack
 * proxies resolution, ordinary file dependencies, warnings, and asynchronous
 * callbacks, but omits module layer/buildInfo and addMissingDependency.
 */
export default function parallelOctaneLoader(source, sourceMap) {
	const missingDependencies = [];
	const module = this._module;
	const finalizer = this.loaders[this.loaderIndex - 1];
	module.layer = finalizer?.loaderItem?.data?.octaneLayer ?? undefined;

	const callback = this.callback.bind(this);
	const async = this.async.bind(this);
	const withWorkerMetadata = (finish) => (error, output, outputMap, metadata) => {
		if (error) {
			finish(error);
			return;
		}
		finish(null, output, outputMap, {
			...(metadata ?? {}),
			__octaneParallelLoader: {
				buildInfo: module.buildInfo?.octane ?? null,
				missingDependencies,
			},
		});
	};

	this.addMissingDependency = (dependency) => missingDependencies.push(dependency);
	this.callback = withWorkerMetadata(callback);
	this.async = () => withWorkerMetadata(async());
	return octaneLoader.call(this, source, sourceMap);
}
