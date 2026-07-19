let zod = require("zod");
let _tanstack_router_generator = require("@tanstack/router-generator");
//#region src/core/config.ts
var splitGroupingsSchema = zod.z.array(zod.z.array(zod.z.union([
	zod.z.literal("loader"),
	zod.z.literal("component"),
	zod.z.literal("pendingComponent"),
	zod.z.literal("errorComponent"),
	zod.z.literal("notFoundComponent")
])), { message: "  Must be an Array of Arrays containing the split groupings. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']]" }).superRefine((val, ctx) => {
	const flattened = val.flat();
	if ([...new Set(flattened)].length !== flattened.length) ctx.addIssue({
		code: "custom",
		message: `  Split groupings must be unique and not repeated. i.e. i.e. [['component'], ['pendingComponent'], ['errorComponent', 'notFoundComponent']].\n  You input was: ${JSON.stringify(val)}.`
	});
});
var codeSplittingOptionsSchema = zod.z.object({
	splitBehavior: zod.z.custom((value) => typeof value === "function").optional(),
	defaultBehavior: splitGroupingsSchema.optional(),
	deleteNodes: zod.z.array(zod.z.string()).optional(),
	addHmr: zod.z.boolean().optional().default(true)
});
var configSchema = _tanstack_router_generator.configSchema.extend({
	enableRouteGeneration: zod.z.boolean().optional(),
	codeSplittingOptions: zod.z.custom((v) => {
		return codeSplittingOptionsSchema.parse(v);
	}).optional(),
	plugin: zod.z.object({
		hmr: zod.z.object({ style: zod.z.enum(["vite", "webpack"]).optional() }).optional(),
		vite: zod.z.object({ environmentName: zod.z.string().optional() }).optional()
	}).optional()
});
var getConfig = (inlineConfig, root) => {
	const config = (0, _tanstack_router_generator.getConfig)(inlineConfig, root);
	return configSchema.parse({
		...inlineConfig,
		...config
	});
};
//#endregion
exports.configSchema = configSchema;
exports.getConfig = getConfig;
exports.splitGroupingsSchema = splitGroupingsSchema;

//# sourceMappingURL=config.cjs.map