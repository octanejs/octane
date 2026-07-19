import { parseStartConfig as parseStartConfig$1, tanstackStartOptionsObjectSchema } from "../schema.js";
import { z } from "zod";
//#region src/vite/schema.ts
var tanstackStartViteOptionsSchema = tanstackStartOptionsObjectSchema.extend({ vite: z.object({ installDevServerMiddleware: z.boolean().optional() }).optional() }).optional().prefault({});
function parseStartConfig(opts, corePluginOpts, root) {
	tanstackStartViteOptionsSchema.parse(opts);
	const { vite: _vite, ...coreOptions } = opts ?? {};
	return parseStartConfig$1(coreOptions, corePluginOpts, root);
}
//#endregion
export { parseStartConfig };

//# sourceMappingURL=schema.js.map