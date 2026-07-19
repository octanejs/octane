import { configSchema, getConfig } from "./core/config.js";
import { defaultCodeSplitGroupings, splitRouteIdentNodes, tsrSplit } from "./core/constants.js";
import { getObjectPropertyKeyName } from "./core/utils.js";
import { createRouterPluginContext } from "./core/router-plugin-context.js";
import { unpluginRouterCodeSplitterFactory } from "./core/router-code-splitter-plugin.js";
import { unpluginRouterGeneratorFactory } from "./core/router-generator-plugin.js";
export { configSchema, createRouterPluginContext, defaultCodeSplitGroupings, getConfig, getObjectPropertyKeyName, splitRouteIdentNodes, tsrSplit, unpluginRouterCodeSplitterFactory, unpluginRouterGeneratorFactory };
