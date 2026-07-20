import path from 'node:path';
import { z } from 'zod';
import { configSchema, getConfig } from '#tanstack-start/router-plugin';
//#region src/schema.ts
var tsrConfig = configSchema
	.omit({
		autoCodeSplitting: true,
		target: true,
	})
	.partial();
var patternSchema = z.union([z.string(), z.instanceof(RegExp)]);
var importProtectionBehaviorSchema = z.enum(['error', 'mock']);
var importProtectionEnvRulesSchema = z.object({
	specifiers: z.array(patternSchema).optional(),
	files: z.array(patternSchema).optional(),
	excludeFiles: z.array(patternSchema).optional(),
});
var importProtectionOptionsSchema = z
	.object({
		enabled: z.boolean().optional(),
		behavior: z
			.union([
				importProtectionBehaviorSchema,
				z.object({
					dev: importProtectionBehaviorSchema.optional(),
					build: importProtectionBehaviorSchema.optional(),
				}),
			])
			.optional(),
		/**
		 * In `behavior: 'mock'`, control whether mocked imports emit a runtime
		 * console diagnostic when accessed.
		 *
		 * - 'error': console.error(new Error(...)) (default)
		 * - 'warn': console.warn(new Error(...))
		 * - 'off': disable runtime diagnostics
		 */
		mockAccess: z.enum(['error', 'warn', 'off']).optional(),
		onViolation: z.custom((value) => typeof value === 'function').optional(),
		include: z.array(patternSchema).optional(),
		exclude: z.array(patternSchema).optional(),
		client: importProtectionEnvRulesSchema.optional(),
		server: importProtectionEnvRulesSchema.optional(),
		ignoreImporters: z.array(patternSchema).optional(),
		maxTraceDepth: z.number().optional(),
		log: z.enum(['once', 'always']).optional(),
	})
	.optional();
function parseStartConfig(opts, corePluginOpts, root) {
	const rawRouterOptions = (opts ?? {}).router ?? {};
	const options = tanstackStartOptionsSchema.parse(opts);
	const srcDirectory = options.srcDirectory;
	const routesDirectory = path.resolve(
		root,
		srcDirectory,
		rawRouterOptions.routesDirectory ?? 'routes',
	);
	const generatedRouteTree = path.resolve(
		root,
		srcDirectory,
		rawRouterOptions.generatedRouteTree ?? 'routeTree.gen.ts',
	);
	return {
		...options,
		router: {
			...options.router,
			...getConfig(
				{
					...options.router,
					target: corePluginOpts.framework,
					routesDirectory,
					generatedRouteTree,
				},
				root,
			),
			target: corePluginOpts.framework,
		},
	};
}
var pageSitemapOptionsSchema = z.object({
	exclude: z.boolean().optional(),
	priority: z.number().min(0).max(1).optional(),
	changefreq: z
		.enum(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])
		.optional(),
	lastmod: z.union([z.string(), z.date()]).optional(),
	alternateRefs: z
		.array(
			z.object({
				href: z.string(),
				hreflang: z.string(),
			}),
		)
		.optional(),
	images: z
		.array(
			z.object({
				loc: z.string(),
				caption: z.string().optional(),
				title: z.string().optional(),
			}),
		)
		.optional(),
	news: z
		.object({
			publication: z.object({
				name: z.string(),
				language: z.string(),
			}),
			publicationDate: z.union([z.string(), z.date()]),
			title: z.string(),
		})
		.optional(),
});
var pageBaseSchema = z.object({
	path: z.string(),
	sitemap: pageSitemapOptionsSchema.optional(),
	fromCrawl: z.boolean().optional(),
});
var pagePrerenderOptionsSchema = z.object({
	enabled: z.boolean().optional(),
	outputPath: z.string().optional(),
	autoSubfolderIndex: z.boolean().optional(),
	crawlLinks: z.boolean().optional(),
	retryCount: z.number().optional(),
	retryDelay: z.number().optional(),
	onSuccess: z.custom((value) => typeof value === 'function').optional(),
	headers: z.record(z.string(), z.string()).optional(),
});
var spaSchema = z.object({
	enabled: z.boolean().optional().default(true),
	maskPath: z.string().optional().default('/'),
	prerender: pagePrerenderOptionsSchema
		.optional()
		.prefault({})
		.transform((opts) => ({
			outputPath: opts.outputPath ?? '/_shell',
			crawlLinks: false,
			retryCount: 0,
			...opts,
			enabled: true,
		})),
});
var inlineCssSchema = z
	.union([
		z.boolean(),
		z.object({
			/**
			 * Inline route CSS into the server-rendered HTML response.
			 *
			 * @experimental This option is experimental!
			 */
			enabled: z.boolean().optional().default(true),
			/**
			 * Emit build-time templates that allow `transformAssets` to rewrite
			 * `url(...)` references inside inlined CSS at runtime.
			 */
			transformAssets: z.boolean().optional().default(false),
		}),
	])
	.optional()
	.default(false)
	.transform((value) => {
		if (typeof value === 'boolean')
			return {
				enabled: value,
				transformAssets: false,
			};
		return value;
	});
var pageSchema = pageBaseSchema.extend({ prerender: pagePrerenderOptionsSchema.optional() });
var tanstackStartOptionsObjectSchema = z.object({
	srcDirectory: z.string().optional().default('src'),
	start: z.object({ entry: z.string().optional() }).optional().prefault({}),
	router: z
		.object({
			entry: z.string().optional(),
			basepath: z.string().optional(),
		})
		.and(tsrConfig.optional().prefault({}))
		.optional()
		.prefault({}),
	client: z
		.object({
			entry: z.string().optional(),
			base: z.string().optional().default('/_build'),
		})
		.optional()
		.prefault({}),
	server: z
		.object({
			entry: z.string().optional(),
			build: z
				.object({
					staticNodeEnv: z.boolean().optional().default(true),
					/**
					 * Inline route CSS into the server-rendered HTML response.
					 *
					 * @experimental This option is experimental!
					 */
					inlineCss: inlineCssSchema,
				})
				.optional()
				.prefault({}),
		})
		.optional()
		.prefault({}),
	serverFns: z
		.object({
			base: z.string().optional().default('/_serverFn'),
			disableCsrfMiddlewareWarning: z.boolean().optional().default(false),
			generateFunctionId: z.custom((value) => typeof value === 'function').optional(),
		})
		.optional()
		.prefault({}),
	pages: z.array(pageSchema).optional().default([]),
	sitemap: z
		.object({
			enabled: z.boolean().optional().default(true),
			host: z.string().optional(),
			outputPath: z.string().optional().default('sitemap.xml'),
		})
		.optional(),
	prerender: z
		.object({
			enabled: z.boolean().optional(),
			concurrency: z.number().optional(),
			filter: z.custom((value) => typeof value === 'function').optional(),
			failOnError: z.boolean().optional(),
			autoStaticPathsDiscovery: z.boolean().optional(),
			maxRedirects: z.number().min(0).optional(),
		})
		.and(pagePrerenderOptionsSchema.optional())
		.optional(),
	dev: z
		.object({
			ssrStyles: z
				.object({
					enabled: z.boolean().optional().default(true),
					basepath: z.string().optional(),
				})
				.optional()
				.prefault({}),
		})
		.optional()
		.prefault({}),
	spa: spaSchema.optional(),
	importProtection: importProtectionOptionsSchema,
});
var tanstackStartOptionsSchema = tanstackStartOptionsObjectSchema.optional().prefault({});
//#endregion
export { parseStartConfig, tanstackStartOptionsObjectSchema };
