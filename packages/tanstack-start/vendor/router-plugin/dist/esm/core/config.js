import { z } from "zod";
import { configSchema, getConfig } from "@tanstack/router-generator";
//#region src/core/config.ts
var splitGroupingsSchema = z.array(z.array(z.union([
	z.literal("loader"),
	z.literal("component"),
	z.literal("pendingComponent"),
	z.literal("errorComponent"),
	z.literal("notFoundComponent")
])), { message: "  Must be an Array of Arrays containing the split groupings. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]" }).superRefine((val, ctx) => {
	const flattened = val.flat();
	if ([...new Set(flattened)].length !== flattened.length) ctx.addIssue({
		code: "custom",
		message: `  Split groupings must be unique and not repeated. i.e. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']].\n  You input was: ${JSON.stringify(val)}.`
	});
});
var codeSplittingOptionsSchema = z.object({
	splitBehavior: z.custom((value) => typeof value === "function").optional(),
	defaultBehavior: splitGroupingsSchema.optional(),
	deleteNodes: z.array(z.string()).optional(),
	addHmr: z.boolean().optional().default(true)
});
var configSchema$1 = configSchema.extend({
	enableRouteGeneration: z.boolean().optional(),
	codeSplittingOptions: z.custom((v) => {
		return codeSplittingOptionsSchema.parse(v);
	}).optional(),
	plugin: z.object({
		hmr: z.object({ style: z.enum(["vite", "webpack"]).optional() }).optional(),
		vite: z.object({ environmentName: z.string().optional() }).optional()
	}).optional()
});
var getConfig$1 = (inlineConfig, root) => {
	const config = getConfig(inlineConfig, root);
	return configSchema$1.parse({
		...inlineConfig,
		...config
	});
};
//#endregion
export { configSchema$1 as configSchema, getConfig$1 as getConfig, splitGroupingsSchema };

//# sourceMappingURL=config.js.map