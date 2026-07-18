import { z } from "zod";
//#region src/filesystem/virtual/config.ts
var indexRouteSchema = z.object({
	type: z.literal("index"),
	file: z.string()
});
var layoutRouteSchema = z.object({
	type: z.literal("layout"),
	id: z.string().optional(),
	file: z.string(),
	children: z.array(z.lazy(() => virtualRouteNodeSchema)).optional()
});
var routeSchema = z.object({
	type: z.literal("route"),
	file: z.string().optional(),
	path: z.string(),
	children: z.array(z.lazy(() => virtualRouteNodeSchema)).optional()
});
var physicalSubTreeSchema = z.object({
	type: z.literal("physical"),
	directory: z.string(),
	pathPrefix: z.string()
});
var virtualRouteNodeSchema = z.union([
	indexRouteSchema,
	layoutRouteSchema,
	routeSchema,
	physicalSubTreeSchema
]);
var virtualRootRouteSchema = z.object({
	type: z.literal("root"),
	file: z.string(),
	children: z.array(virtualRouteNodeSchema).optional()
});
//#endregion
export { virtualRootRouteSchema };

//# sourceMappingURL=config.js.map