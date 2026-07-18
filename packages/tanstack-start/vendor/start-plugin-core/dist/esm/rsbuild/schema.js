import { parseStartConfig as parseStartConfig$1, tanstackStartOptionsObjectSchema } from "../schema.js";
import { z } from "zod";
//#region src/rsbuild/schema.ts
var rsbuildClientOutputSchema = z.enum(["module", "iife"]);
var tanstackStartRsbuildOptionsSchema = tanstackStartOptionsObjectSchema.extend({ rsbuild: z.object({
	installDevServerMiddleware: z.boolean().optional(),
	client: z.object({ output: rsbuildClientOutputSchema.optional().default("module") }).optional().prefault({})
}).optional() }).optional().prefault({});
function parseStartConfig(opts, corePluginOpts, root) {
	tanstackStartRsbuildOptionsSchema.parse(opts);
	const { rsbuild: _rsbuild, ...coreOptions } = opts ?? {};
	return parseStartConfig$1(coreOptions, corePluginOpts, root);
}
//#endregion
export { parseStartConfig, rsbuildClientOutputSchema };

//# sourceMappingURL=schema.js.map