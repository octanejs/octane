import * as v from 'valibot';

export const builderFrameworkSchema = v.picklist(['react', 'solid']);
export const builderPackageManagerSchema = v.picklist(['bun', 'npm', 'pnpm', 'yarn']);

export const builderStringSchema = v.pipe(v.string(), v.maxLength(200));
export const builderFeatureIdSchema = v.pipe(v.string(), v.maxLength(120));
export const builderFeatureListSchema = v.pipe(v.array(builderFeatureIdSchema), v.maxLength(80));
export const builderFeatureOptionsSchema = v.record(
	builderFeatureIdSchema,
	v.record(builderStringSchema, v.unknown()),
);
const builderFileMapSchema = v.record(
	v.pipe(v.string(), v.minLength(1), v.maxLength(260)),
	v.string(),
);

export const builderProjectDefinitionSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	framework: v.optional(builderFrameworkSchema),
	packageManager: v.optional(builderPackageManagerSchema),
	tailwind: v.optional(v.boolean()),
	features: builderFeatureListSchema,
	featureOptions: v.optional(builderFeatureOptionsSchema),
	selectedExample: v.optional(builderFeatureIdSchema),
});

export const builderCompileBodySchema = v.object({
	definition: builderProjectDefinitionSchema,
	format: v.optional(v.picklist(['full', 'summary'])),
});

export const builderValidateBodySchema = v.object({
	definition: builderProjectDefinitionSchema,
});

export const builderSuggestBodySchema = v.object({
	description: v.optional(v.pipe(v.string(), v.maxLength(4_000))),
	current: v.optional(
		v.object({
			name: v.optional(v.pipe(v.string(), v.maxLength(120))),
			framework: v.optional(builderFrameworkSchema),
			packageManager: v.optional(builderPackageManagerSchema),
			tailwind: v.optional(v.boolean()),
			features: v.optional(builderFeatureListSchema),
			featureOptions: v.optional(builderFeatureOptionsSchema),
			selectedExample: v.optional(builderFeatureIdSchema),
		}),
	),
	intent: v.optional(
		v.picklist(['full-stack', 'api-only', 'static', 'database', 'auth', 'deploy']),
	),
});

export const builderFeatureArtifactsBodySchema = v.object({
	features: builderFeatureListSchema,
	projectName: v.optional(v.pipe(v.string(), v.maxLength(120))),
	framework: v.optional(builderFrameworkSchema),
	tailwind: v.optional(v.boolean()),
	featureOptions: v.optional(builderFeatureOptionsSchema),
});

export const builderRemoteLoadBodySchema = v.object({
	url: v.pipe(v.string(), v.minLength(1), v.maxLength(2_048)),
});

export const builderDeployBodySchema = v.object({
	repoName: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	isPrivate: v.boolean(),
	projectName: v.pipe(v.string(), v.minLength(1), v.maxLength(120)),
	framework: v.optional(builderFrameworkSchema),
	packageManager: v.optional(builderPackageManagerSchema),
	features: builderFeatureListSchema,
	featureOptions: v.optional(builderFeatureOptionsSchema),
	tailwind: v.boolean(),
	files: v.optional(builderFileMapSchema),
});

export type BuilderProjectDefinition = v.InferOutput<typeof builderProjectDefinitionSchema>;
export type BuilderCompileBody = v.InferOutput<typeof builderCompileBodySchema>;
export type BuilderValidateBody = v.InferOutput<typeof builderValidateBodySchema>;
export type BuilderSuggestBody = v.InferOutput<typeof builderSuggestBodySchema>;
export type BuilderFeatureArtifactsBody = v.InferOutput<typeof builderFeatureArtifactsBodySchema>;
export type BuilderRemoteLoadBody = v.InferOutput<typeof builderRemoteLoadBodySchema>;
export type BuilderDeployBody = v.InferOutput<typeof builderDeployBodySchema>;

export function parseBuilderRequest<T>(schema: v.GenericSchema<unknown, T>, body: unknown) {
	return v.parse(schema, body);
}
