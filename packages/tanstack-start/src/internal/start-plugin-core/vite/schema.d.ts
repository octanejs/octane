import { z } from 'zod';
import { CompileStartFrameworkOptions } from '../types.js';
import { InlineCssInputOptions } from '../schema.js';
export declare const tanstackStartViteOptionsSchema: z.ZodPrefault<
	z.ZodOptional<
		z.ZodObject<
			{
				srcDirectory: z.ZodDefault<z.ZodOptional<z.ZodString>>;
				start: z.ZodPrefault<
					z.ZodOptional<
						z.ZodObject<
							{
								entry: z.ZodOptional<z.ZodString>;
							},
							z.core.$strip
						>
					>
				>;
				router: z.ZodPrefault<
					z.ZodOptional<
						z.ZodIntersection<
							z.ZodObject<
								{
									entry: z.ZodOptional<z.ZodString>;
									basepath: z.ZodOptional<z.ZodString>;
								},
								z.core.$strip
							>,
							z.ZodPrefault<
								z.ZodOptional<
									z.ZodObject<
										{
											virtualRouteConfig: z.ZodOptional<
												z.ZodOptional<
													z.ZodUnion<
														[
															z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>,
															z.ZodString,
														]
													>
												>
											>;
											routeFilePrefix: z.ZodOptional<z.ZodOptional<z.ZodString>>;
											routeFileIgnorePrefix: z.ZodOptional<
												z.ZodDefault<z.ZodOptional<z.ZodString>>
											>;
											routeFileIgnorePattern: z.ZodOptional<z.ZodOptional<z.ZodString>>;
											routesDirectory: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodString>>>;
											quoteStyle: z.ZodOptional<
												z.ZodDefault<
													z.ZodOptional<
														z.ZodEnum<{
															single: 'single';
															double: 'double';
														}>
													>
												>
											>;
											semicolons: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>>;
											disableLogging: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>>;
											routeTreeFileHeader: z.ZodOptional<
												z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>
											>;
											indexToken: z.ZodOptional<
												z.ZodDefault<
													z.ZodOptional<
														z.ZodUnion<
															readonly [
																z.ZodString,
																z.ZodCustom<RegExp, RegExp>,
																z.ZodObject<
																	{
																		regex: z.ZodString;
																		flags: z.ZodOptional<z.ZodString>;
																	},
																	z.core.$strip
																>,
															]
														>
													>
												>
											>;
											routeToken: z.ZodOptional<
												z.ZodDefault<
													z.ZodOptional<
														z.ZodUnion<
															readonly [
																z.ZodString,
																z.ZodCustom<RegExp, RegExp>,
																z.ZodObject<
																	{
																		regex: z.ZodString;
																		flags: z.ZodOptional<z.ZodString>;
																	},
																	z.core.$strip
																>,
															]
														>
													>
												>
											>;
											pathParamsAllowedCharacters: z.ZodOptional<
												z.ZodOptional<
													z.ZodArray<
														z.ZodEnum<{
															':': ':';
															$: '$';
															';': ';';
															'@': '@';
															'&': '&';
															'=': '=';
															'+': '+';
															',': ',';
														}>
													>
												>
											>;
											generatedRouteTree: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodString>>>;
											disableTypes: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>>;
											addExtensions: z.ZodOptional<
												z.ZodPipe<
													z.ZodDefault<
														z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>
													>,
													z.ZodTransform<string | boolean, string | boolean>
												>
											>;
											enableRouteTreeFormatting: z.ZodOptional<
												z.ZodDefault<z.ZodOptional<z.ZodBoolean>>
											>;
											routeTreeFileFooter: z.ZodOptional<
												z.ZodOptional<
													z.ZodUnion<
														readonly [
															z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>,
															z.ZodCustom<() => Array<string>, () => Array<string>>,
														]
													>
												>
											>;
											customScaffolding: z.ZodOptional<
												z.ZodOptional<
													z.ZodObject<
														{
															routeTemplate: z.ZodOptional<z.ZodString>;
															lazyRouteTemplate: z.ZodOptional<z.ZodString>;
														},
														z.core.$strip
													>
												>
											>;
											experimental: z.ZodOptional<
												z.ZodOptional<
													z.ZodObject<
														{
															enableCodeSplitting: z.ZodOptional<z.ZodBoolean>;
														},
														z.core.$strip
													>
												>
											>;
											plugins: z.ZodOptional<
												z.ZodOptional<
													z.ZodArray<
														z.ZodCustom<
															import('#tanstack-start/router-generator').GeneratorPlugin,
															import('#tanstack-start/router-generator').GeneratorPlugin
														>
													>
												>
											>;
											tmpDir: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodString>>>;
											importRoutesUsingAbsolutePaths: z.ZodOptional<
												z.ZodDefault<z.ZodOptional<z.ZodBoolean>>
											>;
											enableRouteGeneration: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
											codeSplittingOptions: z.ZodOptional<
												z.ZodOptional<
													z.ZodCustom<
														import('#tanstack-start/router-plugin').CodeSplittingOptions,
														import('#tanstack-start/router-plugin').CodeSplittingOptions
													>
												>
											>;
											plugin: z.ZodOptional<
												z.ZodOptional<
													z.ZodObject<
														{
															hmr: z.ZodOptional<
																z.ZodObject<
																	{
																		style: z.ZodOptional<
																			z.ZodEnum<{
																				vite: 'vite';
																				webpack: 'webpack';
																			}>
																		>;
																	},
																	z.core.$strip
																>
															>;
															vite: z.ZodOptional<
																z.ZodObject<
																	{
																		environmentName: z.ZodOptional<z.ZodString>;
																	},
																	z.core.$strip
																>
															>;
														},
														z.core.$strip
													>
												>
											>;
										},
										z.core.$strip
									>
								>
							>
						>
					>
				>;
				client: z.ZodPrefault<
					z.ZodOptional<
						z.ZodObject<
							{
								entry: z.ZodOptional<z.ZodString>;
								base: z.ZodDefault<z.ZodOptional<z.ZodString>>;
							},
							z.core.$strip
						>
					>
				>;
				server: z.ZodPrefault<
					z.ZodOptional<
						z.ZodObject<
							{
								entry: z.ZodOptional<z.ZodString>;
								build: z.ZodPrefault<
									z.ZodOptional<
										z.ZodObject<
											{
												staticNodeEnv: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
												inlineCss: z.ZodPipe<
													z.ZodDefault<
														z.ZodOptional<
															z.ZodUnion<
																readonly [
																	z.ZodBoolean,
																	z.ZodObject<
																		{
																			enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
																			transformAssets: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
																		},
																		z.core.$strip
																	>,
																]
															>
														>
													>,
													z.ZodTransform<
														{
															enabled: boolean;
															transformAssets: boolean;
														},
														| boolean
														| {
																enabled: boolean;
																transformAssets: boolean;
														  }
													>
												>;
											},
											z.core.$strip
										>
									>
								>;
							},
							z.core.$strip
						>
					>
				>;
				serverFns: z.ZodPrefault<
					z.ZodOptional<
						z.ZodObject<
							{
								base: z.ZodDefault<z.ZodOptional<z.ZodString>>;
								disableCsrfMiddlewareWarning: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
								generateFunctionId: z.ZodOptional<
									z.ZodCustom<
										(opts: { filename: string; functionName: string }) => string | undefined,
										(opts: { filename: string; functionName: string }) => string | undefined
									>
								>;
							},
							z.core.$strip
						>
					>
				>;
				pages: z.ZodDefault<
					z.ZodOptional<
						z.ZodArray<
							z.ZodObject<
								{
									path: z.ZodString;
									sitemap: z.ZodOptional<
										z.ZodObject<
											{
												exclude: z.ZodOptional<z.ZodBoolean>;
												priority: z.ZodOptional<z.ZodNumber>;
												changefreq: z.ZodOptional<
													z.ZodEnum<{
														never: 'never';
														always: 'always';
														hourly: 'hourly';
														daily: 'daily';
														weekly: 'weekly';
														monthly: 'monthly';
														yearly: 'yearly';
													}>
												>;
												lastmod: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
												alternateRefs: z.ZodOptional<
													z.ZodArray<
														z.ZodObject<
															{
																href: z.ZodString;
																hreflang: z.ZodString;
															},
															z.core.$strip
														>
													>
												>;
												images: z.ZodOptional<
													z.ZodArray<
														z.ZodObject<
															{
																loc: z.ZodString;
																caption: z.ZodOptional<z.ZodString>;
																title: z.ZodOptional<z.ZodString>;
															},
															z.core.$strip
														>
													>
												>;
												news: z.ZodOptional<
													z.ZodObject<
														{
															publication: z.ZodObject<
																{
																	name: z.ZodString;
																	language: z.ZodString;
																},
																z.core.$strip
															>;
															publicationDate: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
															title: z.ZodString;
														},
														z.core.$strip
													>
												>;
											},
											z.core.$strip
										>
									>;
									fromCrawl: z.ZodOptional<z.ZodBoolean>;
									prerender: z.ZodOptional<
										z.ZodObject<
											{
												enabled: z.ZodOptional<z.ZodBoolean>;
												outputPath: z.ZodOptional<z.ZodString>;
												autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
												crawlLinks: z.ZodOptional<z.ZodBoolean>;
												retryCount: z.ZodOptional<z.ZodNumber>;
												retryDelay: z.ZodOptional<z.ZodNumber>;
												onSuccess: z.ZodOptional<
													z.ZodCustom<
														(result: {
															page: z.infer<
																z.ZodObject<
																	{
																		path: z.ZodString;
																		sitemap: z.ZodOptional<
																			z.ZodObject<
																				{
																					exclude: z.ZodOptional<z.ZodBoolean>;
																					priority: z.ZodOptional<z.ZodNumber>;
																					changefreq: z.ZodOptional<
																						z.ZodEnum<{
																							never: 'never';
																							always: 'always';
																							hourly: 'hourly';
																							daily: 'daily';
																							weekly: 'weekly';
																							monthly: 'monthly';
																							yearly: 'yearly';
																						}>
																					>;
																					lastmod: z.ZodOptional<
																						z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																					>;
																					alternateRefs: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									href: z.ZodString;
																									hreflang: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					images: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									loc: z.ZodString;
																									caption: z.ZodOptional<z.ZodString>;
																									title: z.ZodOptional<z.ZodString>;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					news: z.ZodOptional<
																						z.ZodObject<
																							{
																								publication: z.ZodObject<
																									{
																										name: z.ZodString;
																										language: z.ZodString;
																									},
																									z.core.$strip
																								>;
																								publicationDate: z.ZodUnion<
																									readonly [z.ZodString, z.ZodDate]
																								>;
																								title: z.ZodString;
																							},
																							z.core.$strip
																						>
																					>;
																				},
																				z.core.$strip
																			>
																		>;
																		fromCrawl: z.ZodOptional<z.ZodBoolean>;
																	},
																	z.core.$strip
																>
															>;
															html: string;
														}) => unknown,
														(result: {
															page: z.infer<
																z.ZodObject<
																	{
																		path: z.ZodString;
																		sitemap: z.ZodOptional<
																			z.ZodObject<
																				{
																					exclude: z.ZodOptional<z.ZodBoolean>;
																					priority: z.ZodOptional<z.ZodNumber>;
																					changefreq: z.ZodOptional<
																						z.ZodEnum<{
																							never: 'never';
																							always: 'always';
																							hourly: 'hourly';
																							daily: 'daily';
																							weekly: 'weekly';
																							monthly: 'monthly';
																							yearly: 'yearly';
																						}>
																					>;
																					lastmod: z.ZodOptional<
																						z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																					>;
																					alternateRefs: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									href: z.ZodString;
																									hreflang: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					images: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									loc: z.ZodString;
																									caption: z.ZodOptional<z.ZodString>;
																									title: z.ZodOptional<z.ZodString>;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					news: z.ZodOptional<
																						z.ZodObject<
																							{
																								publication: z.ZodObject<
																									{
																										name: z.ZodString;
																										language: z.ZodString;
																									},
																									z.core.$strip
																								>;
																								publicationDate: z.ZodUnion<
																									readonly [z.ZodString, z.ZodDate]
																								>;
																								title: z.ZodString;
																							},
																							z.core.$strip
																						>
																					>;
																				},
																				z.core.$strip
																			>
																		>;
																		fromCrawl: z.ZodOptional<z.ZodBoolean>;
																	},
																	z.core.$strip
																>
															>;
															html: string;
														}) => unknown
													>
												>;
												headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
											},
											z.core.$strip
										>
									>;
								},
								z.core.$strip
							>
						>
					>
				>;
				sitemap: z.ZodOptional<
					z.ZodObject<
						{
							enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
							host: z.ZodOptional<z.ZodString>;
							outputPath: z.ZodDefault<z.ZodOptional<z.ZodString>>;
						},
						z.core.$strip
					>
				>;
				prerender: z.ZodOptional<
					z.ZodIntersection<
						z.ZodObject<
							{
								enabled: z.ZodOptional<z.ZodBoolean>;
								concurrency: z.ZodOptional<z.ZodNumber>;
								filter: z.ZodOptional<
									z.ZodCustom<
										(
											page: z.infer<
												z.ZodObject<
													{
														path: z.ZodString;
														sitemap: z.ZodOptional<
															z.ZodObject<
																{
																	exclude: z.ZodOptional<z.ZodBoolean>;
																	priority: z.ZodOptional<z.ZodNumber>;
																	changefreq: z.ZodOptional<
																		z.ZodEnum<{
																			never: 'never';
																			always: 'always';
																			hourly: 'hourly';
																			daily: 'daily';
																			weekly: 'weekly';
																			monthly: 'monthly';
																			yearly: 'yearly';
																		}>
																	>;
																	lastmod: z.ZodOptional<
																		z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																	>;
																	alternateRefs: z.ZodOptional<
																		z.ZodArray<
																			z.ZodObject<
																				{
																					href: z.ZodString;
																					hreflang: z.ZodString;
																				},
																				z.core.$strip
																			>
																		>
																	>;
																	images: z.ZodOptional<
																		z.ZodArray<
																			z.ZodObject<
																				{
																					loc: z.ZodString;
																					caption: z.ZodOptional<z.ZodString>;
																					title: z.ZodOptional<z.ZodString>;
																				},
																				z.core.$strip
																			>
																		>
																	>;
																	news: z.ZodOptional<
																		z.ZodObject<
																			{
																				publication: z.ZodObject<
																					{
																						name: z.ZodString;
																						language: z.ZodString;
																					},
																					z.core.$strip
																				>;
																				publicationDate: z.ZodUnion<
																					readonly [z.ZodString, z.ZodDate]
																				>;
																				title: z.ZodString;
																			},
																			z.core.$strip
																		>
																	>;
																},
																z.core.$strip
															>
														>;
														fromCrawl: z.ZodOptional<z.ZodBoolean>;
														prerender: z.ZodOptional<
															z.ZodObject<
																{
																	enabled: z.ZodOptional<z.ZodBoolean>;
																	outputPath: z.ZodOptional<z.ZodString>;
																	autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
																	crawlLinks: z.ZodOptional<z.ZodBoolean>;
																	retryCount: z.ZodOptional<z.ZodNumber>;
																	retryDelay: z.ZodOptional<z.ZodNumber>;
																	onSuccess: z.ZodOptional<
																		z.ZodCustom<
																			(result: {
																				page: z.infer<
																					z.ZodObject<
																						{
																							path: z.ZodString;
																							sitemap: z.ZodOptional<
																								z.ZodObject<
																									{
																										exclude: z.ZodOptional<z.ZodBoolean>;
																										priority: z.ZodOptional<z.ZodNumber>;
																										changefreq: z.ZodOptional<
																											z.ZodEnum<{
																												never: 'never';
																												always: 'always';
																												hourly: 'hourly';
																												daily: 'daily';
																												weekly: 'weekly';
																												monthly: 'monthly';
																												yearly: 'yearly';
																											}>
																										>;
																										lastmod: z.ZodOptional<
																											z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																										>;
																										alternateRefs: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														href: z.ZodString;
																														hreflang: z.ZodString;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										images: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														loc: z.ZodString;
																														caption: z.ZodOptional<z.ZodString>;
																														title: z.ZodOptional<z.ZodString>;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										news: z.ZodOptional<
																											z.ZodObject<
																												{
																													publication: z.ZodObject<
																														{
																															name: z.ZodString;
																															language: z.ZodString;
																														},
																														z.core.$strip
																													>;
																													publicationDate: z.ZodUnion<
																														readonly [z.ZodString, z.ZodDate]
																													>;
																													title: z.ZodString;
																												},
																												z.core.$strip
																											>
																										>;
																									},
																									z.core.$strip
																								>
																							>;
																							fromCrawl: z.ZodOptional<z.ZodBoolean>;
																						},
																						z.core.$strip
																					>
																				>;
																				html: string;
																			}) => unknown,
																			(result: {
																				page: z.infer<
																					z.ZodObject<
																						{
																							path: z.ZodString;
																							sitemap: z.ZodOptional<
																								z.ZodObject<
																									{
																										exclude: z.ZodOptional<z.ZodBoolean>;
																										priority: z.ZodOptional<z.ZodNumber>;
																										changefreq: z.ZodOptional<
																											z.ZodEnum<{
																												never: 'never';
																												always: 'always';
																												hourly: 'hourly';
																												daily: 'daily';
																												weekly: 'weekly';
																												monthly: 'monthly';
																												yearly: 'yearly';
																											}>
																										>;
																										lastmod: z.ZodOptional<
																											z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																										>;
																										alternateRefs: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														href: z.ZodString;
																														hreflang: z.ZodString;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										images: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														loc: z.ZodString;
																														caption: z.ZodOptional<z.ZodString>;
																														title: z.ZodOptional<z.ZodString>;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										news: z.ZodOptional<
																											z.ZodObject<
																												{
																													publication: z.ZodObject<
																														{
																															name: z.ZodString;
																															language: z.ZodString;
																														},
																														z.core.$strip
																													>;
																													publicationDate: z.ZodUnion<
																														readonly [z.ZodString, z.ZodDate]
																													>;
																													title: z.ZodString;
																												},
																												z.core.$strip
																											>
																										>;
																									},
																									z.core.$strip
																								>
																							>;
																							fromCrawl: z.ZodOptional<z.ZodBoolean>;
																						},
																						z.core.$strip
																					>
																				>;
																				html: string;
																			}) => unknown
																		>
																	>;
																	headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
																},
																z.core.$strip
															>
														>;
													},
													z.core.$strip
												>
											>,
										) => unknown,
										(
											page: z.infer<
												z.ZodObject<
													{
														path: z.ZodString;
														sitemap: z.ZodOptional<
															z.ZodObject<
																{
																	exclude: z.ZodOptional<z.ZodBoolean>;
																	priority: z.ZodOptional<z.ZodNumber>;
																	changefreq: z.ZodOptional<
																		z.ZodEnum<{
																			never: 'never';
																			always: 'always';
																			hourly: 'hourly';
																			daily: 'daily';
																			weekly: 'weekly';
																			monthly: 'monthly';
																			yearly: 'yearly';
																		}>
																	>;
																	lastmod: z.ZodOptional<
																		z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																	>;
																	alternateRefs: z.ZodOptional<
																		z.ZodArray<
																			z.ZodObject<
																				{
																					href: z.ZodString;
																					hreflang: z.ZodString;
																				},
																				z.core.$strip
																			>
																		>
																	>;
																	images: z.ZodOptional<
																		z.ZodArray<
																			z.ZodObject<
																				{
																					loc: z.ZodString;
																					caption: z.ZodOptional<z.ZodString>;
																					title: z.ZodOptional<z.ZodString>;
																				},
																				z.core.$strip
																			>
																		>
																	>;
																	news: z.ZodOptional<
																		z.ZodObject<
																			{
																				publication: z.ZodObject<
																					{
																						name: z.ZodString;
																						language: z.ZodString;
																					},
																					z.core.$strip
																				>;
																				publicationDate: z.ZodUnion<
																					readonly [z.ZodString, z.ZodDate]
																				>;
																				title: z.ZodString;
																			},
																			z.core.$strip
																		>
																	>;
																},
																z.core.$strip
															>
														>;
														fromCrawl: z.ZodOptional<z.ZodBoolean>;
														prerender: z.ZodOptional<
															z.ZodObject<
																{
																	enabled: z.ZodOptional<z.ZodBoolean>;
																	outputPath: z.ZodOptional<z.ZodString>;
																	autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
																	crawlLinks: z.ZodOptional<z.ZodBoolean>;
																	retryCount: z.ZodOptional<z.ZodNumber>;
																	retryDelay: z.ZodOptional<z.ZodNumber>;
																	onSuccess: z.ZodOptional<
																		z.ZodCustom<
																			(result: {
																				page: z.infer<
																					z.ZodObject<
																						{
																							path: z.ZodString;
																							sitemap: z.ZodOptional<
																								z.ZodObject<
																									{
																										exclude: z.ZodOptional<z.ZodBoolean>;
																										priority: z.ZodOptional<z.ZodNumber>;
																										changefreq: z.ZodOptional<
																											z.ZodEnum<{
																												never: 'never';
																												always: 'always';
																												hourly: 'hourly';
																												daily: 'daily';
																												weekly: 'weekly';
																												monthly: 'monthly';
																												yearly: 'yearly';
																											}>
																										>;
																										lastmod: z.ZodOptional<
																											z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																										>;
																										alternateRefs: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														href: z.ZodString;
																														hreflang: z.ZodString;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										images: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														loc: z.ZodString;
																														caption: z.ZodOptional<z.ZodString>;
																														title: z.ZodOptional<z.ZodString>;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										news: z.ZodOptional<
																											z.ZodObject<
																												{
																													publication: z.ZodObject<
																														{
																															name: z.ZodString;
																															language: z.ZodString;
																														},
																														z.core.$strip
																													>;
																													publicationDate: z.ZodUnion<
																														readonly [z.ZodString, z.ZodDate]
																													>;
																													title: z.ZodString;
																												},
																												z.core.$strip
																											>
																										>;
																									},
																									z.core.$strip
																								>
																							>;
																							fromCrawl: z.ZodOptional<z.ZodBoolean>;
																						},
																						z.core.$strip
																					>
																				>;
																				html: string;
																			}) => unknown,
																			(result: {
																				page: z.infer<
																					z.ZodObject<
																						{
																							path: z.ZodString;
																							sitemap: z.ZodOptional<
																								z.ZodObject<
																									{
																										exclude: z.ZodOptional<z.ZodBoolean>;
																										priority: z.ZodOptional<z.ZodNumber>;
																										changefreq: z.ZodOptional<
																											z.ZodEnum<{
																												never: 'never';
																												always: 'always';
																												hourly: 'hourly';
																												daily: 'daily';
																												weekly: 'weekly';
																												monthly: 'monthly';
																												yearly: 'yearly';
																											}>
																										>;
																										lastmod: z.ZodOptional<
																											z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																										>;
																										alternateRefs: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														href: z.ZodString;
																														hreflang: z.ZodString;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										images: z.ZodOptional<
																											z.ZodArray<
																												z.ZodObject<
																													{
																														loc: z.ZodString;
																														caption: z.ZodOptional<z.ZodString>;
																														title: z.ZodOptional<z.ZodString>;
																													},
																													z.core.$strip
																												>
																											>
																										>;
																										news: z.ZodOptional<
																											z.ZodObject<
																												{
																													publication: z.ZodObject<
																														{
																															name: z.ZodString;
																															language: z.ZodString;
																														},
																														z.core.$strip
																													>;
																													publicationDate: z.ZodUnion<
																														readonly [z.ZodString, z.ZodDate]
																													>;
																													title: z.ZodString;
																												},
																												z.core.$strip
																											>
																										>;
																									},
																									z.core.$strip
																								>
																							>;
																							fromCrawl: z.ZodOptional<z.ZodBoolean>;
																						},
																						z.core.$strip
																					>
																				>;
																				html: string;
																			}) => unknown
																		>
																	>;
																	headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
																},
																z.core.$strip
															>
														>;
													},
													z.core.$strip
												>
											>,
										) => unknown
									>
								>;
								failOnError: z.ZodOptional<z.ZodBoolean>;
								autoStaticPathsDiscovery: z.ZodOptional<z.ZodBoolean>;
								maxRedirects: z.ZodOptional<z.ZodNumber>;
							},
							z.core.$strip
						>,
						z.ZodOptional<
							z.ZodObject<
								{
									enabled: z.ZodOptional<z.ZodBoolean>;
									outputPath: z.ZodOptional<z.ZodString>;
									autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
									crawlLinks: z.ZodOptional<z.ZodBoolean>;
									retryCount: z.ZodOptional<z.ZodNumber>;
									retryDelay: z.ZodOptional<z.ZodNumber>;
									onSuccess: z.ZodOptional<
										z.ZodCustom<
											(result: {
												page: z.infer<
													z.ZodObject<
														{
															path: z.ZodString;
															sitemap: z.ZodOptional<
																z.ZodObject<
																	{
																		exclude: z.ZodOptional<z.ZodBoolean>;
																		priority: z.ZodOptional<z.ZodNumber>;
																		changefreq: z.ZodOptional<
																			z.ZodEnum<{
																				never: 'never';
																				always: 'always';
																				hourly: 'hourly';
																				daily: 'daily';
																				weekly: 'weekly';
																				monthly: 'monthly';
																				yearly: 'yearly';
																			}>
																		>;
																		lastmod: z.ZodOptional<
																			z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																		>;
																		alternateRefs: z.ZodOptional<
																			z.ZodArray<
																				z.ZodObject<
																					{
																						href: z.ZodString;
																						hreflang: z.ZodString;
																					},
																					z.core.$strip
																				>
																			>
																		>;
																		images: z.ZodOptional<
																			z.ZodArray<
																				z.ZodObject<
																					{
																						loc: z.ZodString;
																						caption: z.ZodOptional<z.ZodString>;
																						title: z.ZodOptional<z.ZodString>;
																					},
																					z.core.$strip
																				>
																			>
																		>;
																		news: z.ZodOptional<
																			z.ZodObject<
																				{
																					publication: z.ZodObject<
																						{
																							name: z.ZodString;
																							language: z.ZodString;
																						},
																						z.core.$strip
																					>;
																					publicationDate: z.ZodUnion<
																						readonly [z.ZodString, z.ZodDate]
																					>;
																					title: z.ZodString;
																				},
																				z.core.$strip
																			>
																		>;
																	},
																	z.core.$strip
																>
															>;
															fromCrawl: z.ZodOptional<z.ZodBoolean>;
														},
														z.core.$strip
													>
												>;
												html: string;
											}) => unknown,
											(result: {
												page: z.infer<
													z.ZodObject<
														{
															path: z.ZodString;
															sitemap: z.ZodOptional<
																z.ZodObject<
																	{
																		exclude: z.ZodOptional<z.ZodBoolean>;
																		priority: z.ZodOptional<z.ZodNumber>;
																		changefreq: z.ZodOptional<
																			z.ZodEnum<{
																				never: 'never';
																				always: 'always';
																				hourly: 'hourly';
																				daily: 'daily';
																				weekly: 'weekly';
																				monthly: 'monthly';
																				yearly: 'yearly';
																			}>
																		>;
																		lastmod: z.ZodOptional<
																			z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																		>;
																		alternateRefs: z.ZodOptional<
																			z.ZodArray<
																				z.ZodObject<
																					{
																						href: z.ZodString;
																						hreflang: z.ZodString;
																					},
																					z.core.$strip
																				>
																			>
																		>;
																		images: z.ZodOptional<
																			z.ZodArray<
																				z.ZodObject<
																					{
																						loc: z.ZodString;
																						caption: z.ZodOptional<z.ZodString>;
																						title: z.ZodOptional<z.ZodString>;
																					},
																					z.core.$strip
																				>
																			>
																		>;
																		news: z.ZodOptional<
																			z.ZodObject<
																				{
																					publication: z.ZodObject<
																						{
																							name: z.ZodString;
																							language: z.ZodString;
																						},
																						z.core.$strip
																					>;
																					publicationDate: z.ZodUnion<
																						readonly [z.ZodString, z.ZodDate]
																					>;
																					title: z.ZodString;
																				},
																				z.core.$strip
																			>
																		>;
																	},
																	z.core.$strip
																>
															>;
															fromCrawl: z.ZodOptional<z.ZodBoolean>;
														},
														z.core.$strip
													>
												>;
												html: string;
											}) => unknown
										>
									>;
									headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
								},
								z.core.$strip
							>
						>
					>
				>;
				dev: z.ZodPrefault<
					z.ZodOptional<
						z.ZodObject<
							{
								ssrStyles: z.ZodPrefault<
									z.ZodOptional<
										z.ZodObject<
											{
												enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
												basepath: z.ZodOptional<z.ZodString>;
											},
											z.core.$strip
										>
									>
								>;
							},
							z.core.$strip
						>
					>
				>;
				spa: z.ZodOptional<
					z.ZodObject<
						{
							enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
							maskPath: z.ZodDefault<z.ZodOptional<z.ZodString>>;
							prerender: z.ZodPipe<
								z.ZodPrefault<
									z.ZodOptional<
										z.ZodObject<
											{
												enabled: z.ZodOptional<z.ZodBoolean>;
												outputPath: z.ZodOptional<z.ZodString>;
												autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
												crawlLinks: z.ZodOptional<z.ZodBoolean>;
												retryCount: z.ZodOptional<z.ZodNumber>;
												retryDelay: z.ZodOptional<z.ZodNumber>;
												onSuccess: z.ZodOptional<
													z.ZodCustom<
														(result: {
															page: z.infer<
																z.ZodObject<
																	{
																		path: z.ZodString;
																		sitemap: z.ZodOptional<
																			z.ZodObject<
																				{
																					exclude: z.ZodOptional<z.ZodBoolean>;
																					priority: z.ZodOptional<z.ZodNumber>;
																					changefreq: z.ZodOptional<
																						z.ZodEnum<{
																							never: 'never';
																							always: 'always';
																							hourly: 'hourly';
																							daily: 'daily';
																							weekly: 'weekly';
																							monthly: 'monthly';
																							yearly: 'yearly';
																						}>
																					>;
																					lastmod: z.ZodOptional<
																						z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																					>;
																					alternateRefs: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									href: z.ZodString;
																									hreflang: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					images: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									loc: z.ZodString;
																									caption: z.ZodOptional<z.ZodString>;
																									title: z.ZodOptional<z.ZodString>;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					news: z.ZodOptional<
																						z.ZodObject<
																							{
																								publication: z.ZodObject<
																									{
																										name: z.ZodString;
																										language: z.ZodString;
																									},
																									z.core.$strip
																								>;
																								publicationDate: z.ZodUnion<
																									readonly [z.ZodString, z.ZodDate]
																								>;
																								title: z.ZodString;
																							},
																							z.core.$strip
																						>
																					>;
																				},
																				z.core.$strip
																			>
																		>;
																		fromCrawl: z.ZodOptional<z.ZodBoolean>;
																	},
																	z.core.$strip
																>
															>;
															html: string;
														}) => unknown,
														(result: {
															page: z.infer<
																z.ZodObject<
																	{
																		path: z.ZodString;
																		sitemap: z.ZodOptional<
																			z.ZodObject<
																				{
																					exclude: z.ZodOptional<z.ZodBoolean>;
																					priority: z.ZodOptional<z.ZodNumber>;
																					changefreq: z.ZodOptional<
																						z.ZodEnum<{
																							never: 'never';
																							always: 'always';
																							hourly: 'hourly';
																							daily: 'daily';
																							weekly: 'weekly';
																							monthly: 'monthly';
																							yearly: 'yearly';
																						}>
																					>;
																					lastmod: z.ZodOptional<
																						z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																					>;
																					alternateRefs: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									href: z.ZodString;
																									hreflang: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					images: z.ZodOptional<
																						z.ZodArray<
																							z.ZodObject<
																								{
																									loc: z.ZodString;
																									caption: z.ZodOptional<z.ZodString>;
																									title: z.ZodOptional<z.ZodString>;
																								},
																								z.core.$strip
																							>
																						>
																					>;
																					news: z.ZodOptional<
																						z.ZodObject<
																							{
																								publication: z.ZodObject<
																									{
																										name: z.ZodString;
																										language: z.ZodString;
																									},
																									z.core.$strip
																								>;
																								publicationDate: z.ZodUnion<
																									readonly [z.ZodString, z.ZodDate]
																								>;
																								title: z.ZodString;
																							},
																							z.core.$strip
																						>
																					>;
																				},
																				z.core.$strip
																			>
																		>;
																		fromCrawl: z.ZodOptional<z.ZodBoolean>;
																	},
																	z.core.$strip
																>
															>;
															html: string;
														}) => unknown
													>
												>;
												headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
											},
											z.core.$strip
										>
									>
								>,
								z.ZodTransform<
									{
										enabled: boolean;
										outputPath: string;
										autoSubfolderIndex?: boolean | undefined;
										crawlLinks: boolean;
										retryCount: number;
										retryDelay?: number | undefined;
										onSuccess?:
											| ((result: {
													page: z.infer<
														z.ZodObject<
															{
																path: z.ZodString;
																sitemap: z.ZodOptional<
																	z.ZodObject<
																		{
																			exclude: z.ZodOptional<z.ZodBoolean>;
																			priority: z.ZodOptional<z.ZodNumber>;
																			changefreq: z.ZodOptional<
																				z.ZodEnum<{
																					never: 'never';
																					always: 'always';
																					hourly: 'hourly';
																					daily: 'daily';
																					weekly: 'weekly';
																					monthly: 'monthly';
																					yearly: 'yearly';
																				}>
																			>;
																			lastmod: z.ZodOptional<
																				z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																			>;
																			alternateRefs: z.ZodOptional<
																				z.ZodArray<
																					z.ZodObject<
																						{
																							href: z.ZodString;
																							hreflang: z.ZodString;
																						},
																						z.core.$strip
																					>
																				>
																			>;
																			images: z.ZodOptional<
																				z.ZodArray<
																					z.ZodObject<
																						{
																							loc: z.ZodString;
																							caption: z.ZodOptional<z.ZodString>;
																							title: z.ZodOptional<z.ZodString>;
																						},
																						z.core.$strip
																					>
																				>
																			>;
																			news: z.ZodOptional<
																				z.ZodObject<
																					{
																						publication: z.ZodObject<
																							{
																								name: z.ZodString;
																								language: z.ZodString;
																							},
																							z.core.$strip
																						>;
																						publicationDate: z.ZodUnion<
																							readonly [z.ZodString, z.ZodDate]
																						>;
																						title: z.ZodString;
																					},
																					z.core.$strip
																				>
																			>;
																		},
																		z.core.$strip
																	>
																>;
																fromCrawl: z.ZodOptional<z.ZodBoolean>;
															},
															z.core.$strip
														>
													>;
													html: string;
											  }) => unknown)
											| undefined;
										headers?: Record<string, string> | undefined;
									},
									{
										enabled?: boolean | undefined;
										outputPath?: string | undefined;
										autoSubfolderIndex?: boolean | undefined;
										crawlLinks?: boolean | undefined;
										retryCount?: number | undefined;
										retryDelay?: number | undefined;
										onSuccess?:
											| ((result: {
													page: z.infer<
														z.ZodObject<
															{
																path: z.ZodString;
																sitemap: z.ZodOptional<
																	z.ZodObject<
																		{
																			exclude: z.ZodOptional<z.ZodBoolean>;
																			priority: z.ZodOptional<z.ZodNumber>;
																			changefreq: z.ZodOptional<
																				z.ZodEnum<{
																					never: 'never';
																					always: 'always';
																					hourly: 'hourly';
																					daily: 'daily';
																					weekly: 'weekly';
																					monthly: 'monthly';
																					yearly: 'yearly';
																				}>
																			>;
																			lastmod: z.ZodOptional<
																				z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																			>;
																			alternateRefs: z.ZodOptional<
																				z.ZodArray<
																					z.ZodObject<
																						{
																							href: z.ZodString;
																							hreflang: z.ZodString;
																						},
																						z.core.$strip
																					>
																				>
																			>;
																			images: z.ZodOptional<
																				z.ZodArray<
																					z.ZodObject<
																						{
																							loc: z.ZodString;
																							caption: z.ZodOptional<z.ZodString>;
																							title: z.ZodOptional<z.ZodString>;
																						},
																						z.core.$strip
																					>
																				>
																			>;
																			news: z.ZodOptional<
																				z.ZodObject<
																					{
																						publication: z.ZodObject<
																							{
																								name: z.ZodString;
																								language: z.ZodString;
																							},
																							z.core.$strip
																						>;
																						publicationDate: z.ZodUnion<
																							readonly [z.ZodString, z.ZodDate]
																						>;
																						title: z.ZodString;
																					},
																					z.core.$strip
																				>
																			>;
																		},
																		z.core.$strip
																	>
																>;
																fromCrawl: z.ZodOptional<z.ZodBoolean>;
															},
															z.core.$strip
														>
													>;
													html: string;
											  }) => unknown)
											| undefined;
										headers?: Record<string, string> | undefined;
									}
								>
							>;
						},
						z.core.$strip
					>
				>;
				importProtection: z.ZodOptional<
					z.ZodObject<
						{
							enabled: z.ZodOptional<z.ZodBoolean>;
							behavior: z.ZodOptional<
								z.ZodUnion<
									readonly [
										z.ZodEnum<{
											error: 'error';
											mock: 'mock';
										}>,
										z.ZodObject<
											{
												dev: z.ZodOptional<
													z.ZodEnum<{
														error: 'error';
														mock: 'mock';
													}>
												>;
												build: z.ZodOptional<
													z.ZodEnum<{
														error: 'error';
														mock: 'mock';
													}>
												>;
											},
											z.core.$strip
										>,
									]
								>
							>;
							mockAccess: z.ZodOptional<
								z.ZodEnum<{
									error: 'error';
									warn: 'warn';
									off: 'off';
								}>
							>;
							onViolation: z.ZodOptional<
								z.ZodCustom<
									(violation: unknown) => boolean | void | Promise<boolean | void>,
									(violation: unknown) => boolean | void | Promise<boolean | void>
								>
							>;
							include: z.ZodOptional<
								z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
							>;
							exclude: z.ZodOptional<
								z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
							>;
							client: z.ZodOptional<
								z.ZodObject<
									{
										specifiers: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
										files: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
										excludeFiles: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
									},
									z.core.$strip
								>
							>;
							server: z.ZodOptional<
								z.ZodObject<
									{
										specifiers: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
										files: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
										excludeFiles: z.ZodOptional<
											z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
										>;
									},
									z.core.$strip
								>
							>;
							ignoreImporters: z.ZodOptional<
								z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>]>>
							>;
							maxTraceDepth: z.ZodOptional<z.ZodNumber>;
							log: z.ZodOptional<
								z.ZodEnum<{
									always: 'always';
									once: 'once';
								}>
							>;
						},
						z.core.$strip
					>
				>;
				vite: z.ZodOptional<
					z.ZodObject<
						{
							installDevServerMiddleware: z.ZodOptional<z.ZodBoolean>;
						},
						z.core.$strip
					>
				>;
			},
			z.core.$strip
		>
	>
>;
export declare function parseStartConfig(
	opts: z.input<typeof tanstackStartViteOptionsSchema>,
	corePluginOpts: {
		framework: CompileStartFrameworkOptions;
	},
	root: string,
): {
	router: {
		target: 'react' | 'solid' | 'vue' | 'octane';
		routeFileIgnorePrefix: string;
		routesDirectory: string;
		quoteStyle: 'single' | 'double';
		semicolons: boolean;
		disableLogging: boolean;
		routeTreeFileHeader: string[];
		indexToken:
			| string
			| RegExp
			| {
					regex: string;
					flags?: string | undefined;
			  };
		routeToken:
			| string
			| RegExp
			| {
					regex: string;
					flags?: string | undefined;
			  };
		generatedRouteTree: string;
		disableTypes: boolean;
		addExtensions: string | boolean;
		enableRouteTreeFormatting: boolean;
		tmpDir: string;
		importRoutesUsingAbsolutePaths: boolean;
		virtualRouteConfig?: any;
		routeFilePrefix?: string | undefined;
		routeFileIgnorePattern?: string | undefined;
		pathParamsAllowedCharacters?: (':' | '$' | ';' | '@' | '&' | '=' | '+' | ',')[] | undefined;
		routeTreeFileFooter?: string[] | (() => Array<string>) | undefined;
		autoCodeSplitting?: boolean | undefined;
		customScaffolding?:
			| {
					routeTemplate?: string | undefined;
					lazyRouteTemplate?: string | undefined;
			  }
			| undefined;
		experimental?:
			| {
					enableCodeSplitting?: boolean | undefined;
			  }
			| undefined;
		plugins?: import('#tanstack-start/router-generator').GeneratorPlugin[] | undefined;
		enableRouteGeneration?: boolean | undefined;
		codeSplittingOptions?: import('#tanstack-start/router-plugin').CodeSplittingOptions | undefined;
		plugin?:
			| {
					hmr?:
						| {
								style?: 'vite' | 'webpack' | undefined;
						  }
						| undefined;
					vite?:
						| {
								environmentName?: string | undefined;
						  }
						| undefined;
			  }
			| undefined;
		entry?: string | undefined;
		basepath?: string | undefined;
	};
	srcDirectory: string;
	start: {
		entry?: string | undefined;
	};
	client: {
		base: string;
		entry?: string | undefined;
	};
	server: {
		build: {
			staticNodeEnv: boolean;
			inlineCss: {
				enabled: boolean;
				transformAssets: boolean;
			};
		};
		entry?: string | undefined;
	};
	serverFns: {
		base: string;
		disableCsrfMiddlewareWarning: boolean;
		generateFunctionId?:
			((opts: { filename: string; functionName: string }) => string | undefined) | undefined;
	};
	pages: {
		path: string;
		sitemap?:
			| {
					exclude?: boolean | undefined;
					priority?: number | undefined;
					changefreq?:
						'never' | 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | undefined;
					lastmod?: string | Date | undefined;
					alternateRefs?:
						| {
								href: string;
								hreflang: string;
						  }[]
						| undefined;
					images?:
						| {
								loc: string;
								caption?: string | undefined;
								title?: string | undefined;
						  }[]
						| undefined;
					news?:
						| {
								publication: {
									name: string;
									language: string;
								};
								publicationDate: string | Date;
								title: string;
						  }
						| undefined;
			  }
			| undefined;
		fromCrawl?: boolean | undefined;
		prerender?:
			| {
					enabled?: boolean | undefined;
					outputPath?: string | undefined;
					autoSubfolderIndex?: boolean | undefined;
					crawlLinks?: boolean | undefined;
					retryCount?: number | undefined;
					retryDelay?: number | undefined;
					onSuccess?:
						| ((result: {
								page: z.infer<
									z.ZodObject<
										{
											path: z.ZodString;
											sitemap: z.ZodOptional<
												z.ZodObject<
													{
														exclude: z.ZodOptional<z.ZodBoolean>;
														priority: z.ZodOptional<z.ZodNumber>;
														changefreq: z.ZodOptional<
															z.ZodEnum<{
																never: 'never';
																always: 'always';
																hourly: 'hourly';
																daily: 'daily';
																weekly: 'weekly';
																monthly: 'monthly';
																yearly: 'yearly';
															}>
														>;
														lastmod: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
														alternateRefs: z.ZodOptional<
															z.ZodArray<
																z.ZodObject<
																	{
																		href: z.ZodString;
																		hreflang: z.ZodString;
																	},
																	z.core.$strip
																>
															>
														>;
														images: z.ZodOptional<
															z.ZodArray<
																z.ZodObject<
																	{
																		loc: z.ZodString;
																		caption: z.ZodOptional<z.ZodString>;
																		title: z.ZodOptional<z.ZodString>;
																	},
																	z.core.$strip
																>
															>
														>;
														news: z.ZodOptional<
															z.ZodObject<
																{
																	publication: z.ZodObject<
																		{
																			name: z.ZodString;
																			language: z.ZodString;
																		},
																		z.core.$strip
																	>;
																	publicationDate: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
																	title: z.ZodString;
																},
																z.core.$strip
															>
														>;
													},
													z.core.$strip
												>
											>;
											fromCrawl: z.ZodOptional<z.ZodBoolean>;
										},
										z.core.$strip
									>
								>;
								html: string;
						  }) => unknown)
						| undefined;
					headers?: Record<string, string> | undefined;
			  }
			| undefined;
	}[];
	dev: {
		ssrStyles: {
			enabled: boolean;
			basepath?: string | undefined;
		};
	};
	sitemap?:
		| {
				enabled: boolean;
				outputPath: string;
				host?: string | undefined;
		  }
		| undefined;
	prerender?:
		| ({
				enabled?: boolean | undefined;
				concurrency?: number | undefined;
				filter?:
					| ((
							page: z.infer<
								z.ZodObject<
									{
										path: z.ZodString;
										sitemap: z.ZodOptional<
											z.ZodObject<
												{
													exclude: z.ZodOptional<z.ZodBoolean>;
													priority: z.ZodOptional<z.ZodNumber>;
													changefreq: z.ZodOptional<
														z.ZodEnum<{
															never: 'never';
															always: 'always';
															hourly: 'hourly';
															daily: 'daily';
															weekly: 'weekly';
															monthly: 'monthly';
															yearly: 'yearly';
														}>
													>;
													lastmod: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
													alternateRefs: z.ZodOptional<
														z.ZodArray<
															z.ZodObject<
																{
																	href: z.ZodString;
																	hreflang: z.ZodString;
																},
																z.core.$strip
															>
														>
													>;
													images: z.ZodOptional<
														z.ZodArray<
															z.ZodObject<
																{
																	loc: z.ZodString;
																	caption: z.ZodOptional<z.ZodString>;
																	title: z.ZodOptional<z.ZodString>;
																},
																z.core.$strip
															>
														>
													>;
													news: z.ZodOptional<
														z.ZodObject<
															{
																publication: z.ZodObject<
																	{
																		name: z.ZodString;
																		language: z.ZodString;
																	},
																	z.core.$strip
																>;
																publicationDate: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
																title: z.ZodString;
															},
															z.core.$strip
														>
													>;
												},
												z.core.$strip
											>
										>;
										fromCrawl: z.ZodOptional<z.ZodBoolean>;
										prerender: z.ZodOptional<
											z.ZodObject<
												{
													enabled: z.ZodOptional<z.ZodBoolean>;
													outputPath: z.ZodOptional<z.ZodString>;
													autoSubfolderIndex: z.ZodOptional<z.ZodBoolean>;
													crawlLinks: z.ZodOptional<z.ZodBoolean>;
													retryCount: z.ZodOptional<z.ZodNumber>;
													retryDelay: z.ZodOptional<z.ZodNumber>;
													onSuccess: z.ZodOptional<
														z.ZodCustom<
															(result: {
																page: z.infer<
																	z.ZodObject<
																		{
																			path: z.ZodString;
																			sitemap: z.ZodOptional<
																				z.ZodObject<
																					{
																						exclude: z.ZodOptional<z.ZodBoolean>;
																						priority: z.ZodOptional<z.ZodNumber>;
																						changefreq: z.ZodOptional<
																							z.ZodEnum<{
																								never: 'never';
																								always: 'always';
																								hourly: 'hourly';
																								daily: 'daily';
																								weekly: 'weekly';
																								monthly: 'monthly';
																								yearly: 'yearly';
																							}>
																						>;
																						lastmod: z.ZodOptional<
																							z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																						>;
																						alternateRefs: z.ZodOptional<
																							z.ZodArray<
																								z.ZodObject<
																									{
																										href: z.ZodString;
																										hreflang: z.ZodString;
																									},
																									z.core.$strip
																								>
																							>
																						>;
																						images: z.ZodOptional<
																							z.ZodArray<
																								z.ZodObject<
																									{
																										loc: z.ZodString;
																										caption: z.ZodOptional<z.ZodString>;
																										title: z.ZodOptional<z.ZodString>;
																									},
																									z.core.$strip
																								>
																							>
																						>;
																						news: z.ZodOptional<
																							z.ZodObject<
																								{
																									publication: z.ZodObject<
																										{
																											name: z.ZodString;
																											language: z.ZodString;
																										},
																										z.core.$strip
																									>;
																									publicationDate: z.ZodUnion<
																										readonly [z.ZodString, z.ZodDate]
																									>;
																									title: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>;
																					},
																					z.core.$strip
																				>
																			>;
																			fromCrawl: z.ZodOptional<z.ZodBoolean>;
																		},
																		z.core.$strip
																	>
																>;
																html: string;
															}) => unknown,
															(result: {
																page: z.infer<
																	z.ZodObject<
																		{
																			path: z.ZodString;
																			sitemap: z.ZodOptional<
																				z.ZodObject<
																					{
																						exclude: z.ZodOptional<z.ZodBoolean>;
																						priority: z.ZodOptional<z.ZodNumber>;
																						changefreq: z.ZodOptional<
																							z.ZodEnum<{
																								never: 'never';
																								always: 'always';
																								hourly: 'hourly';
																								daily: 'daily';
																								weekly: 'weekly';
																								monthly: 'monthly';
																								yearly: 'yearly';
																							}>
																						>;
																						lastmod: z.ZodOptional<
																							z.ZodUnion<readonly [z.ZodString, z.ZodDate]>
																						>;
																						alternateRefs: z.ZodOptional<
																							z.ZodArray<
																								z.ZodObject<
																									{
																										href: z.ZodString;
																										hreflang: z.ZodString;
																									},
																									z.core.$strip
																								>
																							>
																						>;
																						images: z.ZodOptional<
																							z.ZodArray<
																								z.ZodObject<
																									{
																										loc: z.ZodString;
																										caption: z.ZodOptional<z.ZodString>;
																										title: z.ZodOptional<z.ZodString>;
																									},
																									z.core.$strip
																								>
																							>
																						>;
																						news: z.ZodOptional<
																							z.ZodObject<
																								{
																									publication: z.ZodObject<
																										{
																											name: z.ZodString;
																											language: z.ZodString;
																										},
																										z.core.$strip
																									>;
																									publicationDate: z.ZodUnion<
																										readonly [z.ZodString, z.ZodDate]
																									>;
																									title: z.ZodString;
																								},
																								z.core.$strip
																							>
																						>;
																					},
																					z.core.$strip
																				>
																			>;
																			fromCrawl: z.ZodOptional<z.ZodBoolean>;
																		},
																		z.core.$strip
																	>
																>;
																html: string;
															}) => unknown
														>
													>;
													headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
												},
												z.core.$strip
											>
										>;
									},
									z.core.$strip
								>
							>,
					  ) => unknown)
					| undefined;
				failOnError?: boolean | undefined;
				autoStaticPathsDiscovery?: boolean | undefined;
				maxRedirects?: number | undefined;
		  } & {
				enabled?: boolean | undefined;
				outputPath?: string | undefined;
				autoSubfolderIndex?: boolean | undefined;
				crawlLinks?: boolean | undefined;
				retryCount?: number | undefined;
				retryDelay?: number | undefined;
				onSuccess?:
					| ((result: {
							page: z.infer<
								z.ZodObject<
									{
										path: z.ZodString;
										sitemap: z.ZodOptional<
											z.ZodObject<
												{
													exclude: z.ZodOptional<z.ZodBoolean>;
													priority: z.ZodOptional<z.ZodNumber>;
													changefreq: z.ZodOptional<
														z.ZodEnum<{
															never: 'never';
															always: 'always';
															hourly: 'hourly';
															daily: 'daily';
															weekly: 'weekly';
															monthly: 'monthly';
															yearly: 'yearly';
														}>
													>;
													lastmod: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
													alternateRefs: z.ZodOptional<
														z.ZodArray<
															z.ZodObject<
																{
																	href: z.ZodString;
																	hreflang: z.ZodString;
																},
																z.core.$strip
															>
														>
													>;
													images: z.ZodOptional<
														z.ZodArray<
															z.ZodObject<
																{
																	loc: z.ZodString;
																	caption: z.ZodOptional<z.ZodString>;
																	title: z.ZodOptional<z.ZodString>;
																},
																z.core.$strip
															>
														>
													>;
													news: z.ZodOptional<
														z.ZodObject<
															{
																publication: z.ZodObject<
																	{
																		name: z.ZodString;
																		language: z.ZodString;
																	},
																	z.core.$strip
																>;
																publicationDate: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
																title: z.ZodString;
															},
															z.core.$strip
														>
													>;
												},
												z.core.$strip
											>
										>;
										fromCrawl: z.ZodOptional<z.ZodBoolean>;
									},
									z.core.$strip
								>
							>;
							html: string;
					  }) => unknown)
					| undefined;
				headers?: Record<string, string> | undefined;
		  })
		| undefined;
	spa?:
		| {
				enabled: boolean;
				maskPath: string;
				prerender: {
					enabled: boolean;
					outputPath: string;
					autoSubfolderIndex?: boolean | undefined;
					crawlLinks: boolean;
					retryCount: number;
					retryDelay?: number | undefined;
					onSuccess?:
						| ((result: {
								page: z.infer<
									z.ZodObject<
										{
											path: z.ZodString;
											sitemap: z.ZodOptional<
												z.ZodObject<
													{
														exclude: z.ZodOptional<z.ZodBoolean>;
														priority: z.ZodOptional<z.ZodNumber>;
														changefreq: z.ZodOptional<
															z.ZodEnum<{
																never: 'never';
																always: 'always';
																hourly: 'hourly';
																daily: 'daily';
																weekly: 'weekly';
																monthly: 'monthly';
																yearly: 'yearly';
															}>
														>;
														lastmod: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodDate]>>;
														alternateRefs: z.ZodOptional<
															z.ZodArray<
																z.ZodObject<
																	{
																		href: z.ZodString;
																		hreflang: z.ZodString;
																	},
																	z.core.$strip
																>
															>
														>;
														images: z.ZodOptional<
															z.ZodArray<
																z.ZodObject<
																	{
																		loc: z.ZodString;
																		caption: z.ZodOptional<z.ZodString>;
																		title: z.ZodOptional<z.ZodString>;
																	},
																	z.core.$strip
																>
															>
														>;
														news: z.ZodOptional<
															z.ZodObject<
																{
																	publication: z.ZodObject<
																		{
																			name: z.ZodString;
																			language: z.ZodString;
																		},
																		z.core.$strip
																	>;
																	publicationDate: z.ZodUnion<readonly [z.ZodString, z.ZodDate]>;
																	title: z.ZodString;
																},
																z.core.$strip
															>
														>;
													},
													z.core.$strip
												>
											>;
											fromCrawl: z.ZodOptional<z.ZodBoolean>;
										},
										z.core.$strip
									>
								>;
								html: string;
						  }) => unknown)
						| undefined;
					headers?: Record<string, string> | undefined;
				};
		  }
		| undefined;
	importProtection?:
		| {
				enabled?: boolean | undefined;
				behavior?:
					| 'error'
					| 'mock'
					| {
							dev?: 'error' | 'mock' | undefined;
							build?: 'error' | 'mock' | undefined;
					  }
					| undefined;
				mockAccess?: 'error' | 'warn' | 'off' | undefined;
				onViolation?:
					((violation: unknown) => boolean | void | Promise<boolean | void>) | undefined;
				include?: (string | RegExp)[] | undefined;
				exclude?: (string | RegExp)[] | undefined;
				client?:
					| {
							specifiers?: (string | RegExp)[] | undefined;
							files?: (string | RegExp)[] | undefined;
							excludeFiles?: (string | RegExp)[] | undefined;
					  }
					| undefined;
				server?:
					| {
							specifiers?: (string | RegExp)[] | undefined;
							files?: (string | RegExp)[] | undefined;
							excludeFiles?: (string | RegExp)[] | undefined;
					  }
					| undefined;
				ignoreImporters?: (string | RegExp)[] | undefined;
				maxTraceDepth?: number | undefined;
				log?: 'always' | 'once' | undefined;
		  }
		| undefined;
};
export type TanStackStartViteInputConfig = z.input<typeof tanstackStartViteOptionsSchema> & {
	server?: {
		build?: {
			inlineCss?: InlineCssInputOptions;
		};
	};
};
