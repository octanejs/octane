import { Rspack } from '@rsbuild/core';
import { ServerFnBuildInfoLoaderContext, ServerFnMetadataLoaderOptions } from './start-compiler-metadata.js';
declare const tanStackStartCompilerMetadataLoader: Rspack.LoaderDefinition<ServerFnMetadataLoaderOptions, ServerFnBuildInfoLoaderContext>;
export default tanStackStartCompilerMetadataLoader;
