export { configSchema, getConfig } from './core/config.js';
export { unpluginRouterCodeSplitterFactory } from './core/router-code-splitter-plugin.js';
export { unpluginRouterGeneratorFactory } from './core/router-generator-plugin.js';
export { createRouterPluginContext } from './core/router-plugin-context.js';
export type { Config, ConfigInput, ConfigOutput, CodeSplittingOptions, DeletableNodes, HmrOptions, } from './core/config.js';
export type { RouterPluginContext } from './core/router-plugin-context.js';
export { getObjectPropertyKeyName } from './core/utils.js';
export type { ReferenceRouteCompilerPlugin, ReferenceRouteCompilerPluginContext, } from './core/code-splitter/plugins.js';
export { tsrSplit, splitRouteIdentNodes, defaultCodeSplitGroupings, } from './core/constants.js';
