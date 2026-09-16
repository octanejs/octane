/**
 * Fence feature-bearing documents through Rspack's native module-execution
 * interceptor, before authored factories run. No compiled source is rewritten.
 * @param {import('@rspack/core').Compiler} compiler
 * @param {import('@rspack/core').Compilation} compilation
 * @param {Array<{ module: import('@rspack/core').Module, executableModule?: import('@rspack/core').Module }>} modules
 */
export function createStreamedSignalHmrRuntimeModule(compiler, compilation, modules) {
	const { RuntimeGlobals, RuntimeModule } = compiler.webpack;
	return new (class extends RuntimeModule {
		constructor() {
			super('octane streamed signal HMR fence', RuntimeModule.STAGE_TRIGGER);
		}

		generate() {
			const ids = new Set();
			for (const { module, executableModule } of modules) {
				for (const candidate of [executableModule, module, module?.rootModule]) {
					const id = candidate == null ? null : compilation.chunkGraph.getModuleId(candidate);
					if (id != null) {
						ids.add(String(id));
						break;
					}
				}
			}
			return `
var octaneSignalModules = new Set(${JSON.stringify([...ids].sort())});
var octaneSignalFenceInstalled = false;
var octaneSignalGenerationChanged = false;
var octaneSignalModuleExecuted = false;
function octaneReloadSignalDocument() {
  ${RuntimeGlobals.global}.location?.reload?.();
  throw new Error('[octane] The streamed signal client build changed. Reload this document.');
}
function octaneTrackSignalGeneration(hot) {
  if (!hot || octaneSignalFenceInstalled) return;
  octaneSignalFenceInstalled = true;
  if (hot.status() !== 'idle') octaneSignalGenerationChanged = true;
  hot.addStatusHandler(function(status) {
    if (status === 'apply') octaneSignalGenerationChanged = true;
    if (octaneSignalModuleExecuted && (status === 'check' || status === 'dispose' || status === 'apply')) octaneReloadSignalDocument();
  });
}
// A newly introduced runtime may itself arrive during hot application. The
// entry's cached hot module supplies that state before any feature executes.
for (var octaneCachedId in ${RuntimeGlobals.moduleCache}) {
  octaneTrackSignalGeneration(${RuntimeGlobals.moduleCache}[octaneCachedId].hot);
  if (octaneSignalFenceInstalled) break;
}
${RuntimeGlobals.interceptModuleExecution}.push(function(options) {
  var hot = options.module.hot;
  octaneTrackSignalGeneration(hot);
  if (!hot || !octaneSignalModules.has(String(options.id))) return;
  if (octaneSignalGenerationChanged || hot.status() !== 'idle') octaneReloadSignalDocument();
  octaneSignalModuleExecuted = true;
});`;
		}
	})();
}
