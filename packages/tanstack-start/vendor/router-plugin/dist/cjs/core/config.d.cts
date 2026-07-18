import { z } from 'zod';
import { CreateFileRoute, RegisteredRouter, RouteIds } from '@tanstack/router-core';
import { CodeSplitGroupings } from './constants.cjs';
export declare const splitGroupingsSchema: z.ZodArray<z.ZodArray<z.ZodUnion<readonly [z.ZodLiteral<"loader">, z.ZodLiteral<"component">, z.ZodLiteral<"pendingComponent">, z.ZodLiteral<"errorComponent">, z.ZodLiteral<"notFoundComponent">]>>>;
export type CodeSplittingOptions = {
    /**
     * Use this function to programmatically control the code splitting behavior
     * based on the `routeId` for each route.
     *
     * If you just need to change the default behavior, you can use the `defaultBehavior` option.
     * @param params
     */
    splitBehavior?: (params: {
        routeId: RouteIds<RegisteredRouter['routeTree']>;
    }) => CodeSplitGroupings | undefined | void;
    /**
     * The default/global configuration to control your code splitting behavior per route.
     * @default [['component'],['pendingComponent'],['errorComponent'],['notFoundComponent']]
     */
    defaultBehavior?: CodeSplitGroupings;
    /**
     * The nodes that shall be deleted from the route.
     * @default undefined
     */
    deleteNodes?: Array<DeletableNodes>;
    /**
     * @default true
     */
    addHmr?: boolean;
};
export type HmrStyle = 'vite' | 'webpack';
export type HmrOptions = {
    /**
     * Selects the HMR runtime style to emit code for.
     * - `'vite'` (default): ESM `import.meta.hot` with Vite accept-callback semantics.
     * - `'webpack'`: `import.meta.webpackHot` with webpack / Rspack `module.hot` re-execution semantics.
     *
     * Bundler-specific plugin entries (e.g. `rspack.ts`, `webpack.ts`) set this explicitly.
     */
    style?: HmrStyle;
};
type FileRouteKeys = keyof (Parameters<CreateFileRoute<any, any, any, any, any>>[0] & {});
export type DeletableNodes = FileRouteKeys | (string & {});
export declare const configSchema: z.ZodObject<{
    target: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        vue: "vue";
        react: "react";
        solid: "solid";
        octane: "octane";
    }>>>;
    virtualRouteConfig: z.ZodOptional<z.ZodUnion<[z.ZodType<import('@tanstack/virtual-file-routes').VirtualRootRoute, unknown, z.core.$ZodTypeInternals<import('@tanstack/virtual-file-routes').VirtualRootRoute, unknown>>, z.ZodString]>>;
    routeFilePrefix: z.ZodOptional<z.ZodString>;
    routeFileIgnorePrefix: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    routeFileIgnorePattern: z.ZodOptional<z.ZodString>;
    routesDirectory: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    quoteStyle: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        single: "single";
        double: "double";
    }>>>;
    semicolons: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    disableLogging: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    routeTreeFileHeader: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>;
    indexToken: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>, z.ZodObject<{
        regex: z.ZodString;
        flags: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>>;
    routeToken: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>, z.ZodObject<{
        regex: z.ZodString;
        flags: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>>;
    pathParamsAllowedCharacters: z.ZodOptional<z.ZodArray<z.ZodEnum<{
        ":": ":";
        $: "$";
        ";": ";";
        "@": "@";
        "&": "&";
        "=": "=";
        "+": "+";
        ",": ",";
    }>>>;
    generatedRouteTree: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    disableTypes: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    addExtensions: z.ZodPipe<z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodString]>>>, z.ZodTransform<string | boolean, string | boolean>>;
    enableRouteTreeFormatting: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    routeTreeFileFooter: z.ZodOptional<z.ZodUnion<readonly [z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString>>>, z.ZodCustom<() => Array<string>, () => Array<string>>]>>;
    autoCodeSplitting: z.ZodOptional<z.ZodBoolean>;
    customScaffolding: z.ZodOptional<z.ZodObject<{
        routeTemplate: z.ZodOptional<z.ZodString>;
        lazyRouteTemplate: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    experimental: z.ZodOptional<z.ZodObject<{
        enableCodeSplitting: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    plugins: z.ZodOptional<z.ZodArray<z.ZodCustom<import('@tanstack/router-generator').GeneratorPlugin, import('@tanstack/router-generator').GeneratorPlugin>>>;
    tmpDir: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    importRoutesUsingAbsolutePaths: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    enableRouteGeneration: z.ZodOptional<z.ZodBoolean>;
    codeSplittingOptions: z.ZodOptional<z.ZodCustom<CodeSplittingOptions, CodeSplittingOptions>>;
    plugin: z.ZodOptional<z.ZodObject<{
        hmr: z.ZodOptional<z.ZodObject<{
            style: z.ZodOptional<z.ZodEnum<{
                vite: "vite";
                webpack: "webpack";
            }>>;
        }, z.core.$strip>>;
        vite: z.ZodOptional<z.ZodObject<{
            environmentName: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const getConfig: (inlineConfig: Partial<Config>, root: string) => {
    target: "vue" | "react" | "solid" | "octane";
    routeFileIgnorePrefix: string;
    routesDirectory: string;
    quoteStyle: "single" | "double";
    semicolons: boolean;
    disableLogging: boolean;
    routeTreeFileHeader: string[];
    indexToken: string | RegExp | {
        regex: string;
        flags?: string | undefined;
    };
    routeToken: string | RegExp | {
        regex: string;
        flags?: string | undefined;
    };
    generatedRouteTree: string;
    disableTypes: boolean;
    addExtensions: string | boolean;
    enableRouteTreeFormatting: boolean;
    tmpDir: string;
    importRoutesUsingAbsolutePaths: boolean;
    virtualRouteConfig?: string | import('@tanstack/virtual-file-routes').VirtualRootRoute | undefined;
    routeFilePrefix?: string | undefined;
    routeFileIgnorePattern?: string | undefined;
    pathParamsAllowedCharacters?: (":" | "$" | ";" | "@" | "&" | "=" | "+" | ",")[] | undefined;
    routeTreeFileFooter?: string[] | (() => Array<string>) | undefined;
    autoCodeSplitting?: boolean | undefined;
    customScaffolding?: {
        routeTemplate?: string | undefined;
        lazyRouteTemplate?: string | undefined;
    } | undefined;
    experimental?: {
        enableCodeSplitting?: boolean | undefined;
    } | undefined;
    plugins?: import('@tanstack/router-generator').GeneratorPlugin[] | undefined;
    enableRouteGeneration?: boolean | undefined;
    codeSplittingOptions?: CodeSplittingOptions | undefined;
    plugin?: {
        hmr?: {
            style?: "vite" | "webpack" | undefined;
        } | undefined;
        vite?: {
            environmentName?: string | undefined;
        } | undefined;
    } | undefined;
};
export type Config = z.infer<typeof configSchema>;
export type ConfigInput = z.input<typeof configSchema>;
export type ConfigOutput = z.output<typeof configSchema>;
export {};
