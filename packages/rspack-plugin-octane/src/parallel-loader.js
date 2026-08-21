import octaneLoader from './loader.js';
import { CSS_MODULE_BUILD_INFO_KEY, CSS_MODULE_CONTEXT_KEY } from './css-module-data.js';

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
	this[CSS_MODULE_CONTEXT_KEY] = finalizer?.loaderItem?.data?.[CSS_MODULE_CONTEXT_KEY] ?? undefined;

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
				...(module.buildInfo?.[CSS_MODULE_BUILD_INFO_KEY] === undefined
					? null
					: { cssModuleBuildInfo: module.buildInfo[CSS_MODULE_BUILD_INFO_KEY] }),
				missingDependencies,
			},
		});
	};

	this.addMissingDependency = (dependency) => missingDependencies.push(dependency);
	this.callback = withWorkerMetadata(callback);
	this.async = () => withWorkerMetadata(async());
	return octaneLoader.call(this, source, sourceMap);
}
