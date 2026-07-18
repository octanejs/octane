let zod = require("zod");
//#region src/filesystem/virtual/config.ts
var indexRouteSchema = zod.z.object({
	type: zod.z.literal("index"),
	file: zod.z.string()
});
var layoutRouteSchema = zod.z.object({
	type: zod.z.literal("layout"),
	id: zod.z.string().optional(),
	file: zod.z.string(),
	children: zod.z.array(zod.z.lazy(() => virtualRouteNodeSchema)).optional()
});
var routeSchema = zod.z.object({
	type: zod.z.literal("route"),
	file: zod.z.string().optional(),
	path: zod.z.string(),
	children: zod.z.array(zod.z.lazy(() => virtualRouteNodeSchema)).optional()
});
var physicalSubTreeSchema = zod.z.object({
	type: zod.z.literal("physical"),
	directory: zod.z.string(),
	pathPrefix: zod.z.string()
});
var virtualRouteNodeSchema = zod.z.union([
	indexRouteSchema,
	layoutRouteSchema,
	routeSchema,
	physicalSubTreeSchema
]);
var virtualRootRouteSchema = zod.z.object({
	type: zod.z.literal("root"),
	file: zod.z.string(),
	children: zod.z.array(virtualRouteNodeSchema).optional()
});
//#endregion
exports.virtualRootRouteSchema = virtualRootRouteSchema;

//# sourceMappingURL=config.cjs.map