import { z } from 'zod';
import { GeneratorPlugin } from './plugin/types.cjs';
declare const tokenJsonRegexSchema: z.ZodObject<{
    regex: z.ZodString;
    flags: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const tokenMatcherSchema: z.ZodUnion<readonly [z.ZodString, z.ZodCustom<RegExp, RegExp>, z.ZodObject<{
    regex: z.ZodString;
    flags: z.ZodOptional<z.ZodString>;
}, z.core.$strip>]>;
export type TokenMatcherJson = string | z.infer<typeof tokenJsonRegexSchema>;
export type TokenMatcher = z.infer<typeof tokenMatcherSchema>;
export declare const routerFrameworks: readonly ["react", "solid", "vue", "octane"];
export declare const baseConfigSchema: z.ZodObject<{
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
}, z.core.$strip>;
export type BaseConfig = z.infer<typeof baseConfigSchema>;
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
    plugins: z.ZodOptional<z.ZodArray<z.ZodCustom<GeneratorPlugin, GeneratorPlugin>>>;
    tmpDir: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    importRoutesUsingAbsolutePaths: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type Config = z.infer<typeof configSchema>;
type ResolveParams = {
    configDirectory: string;
};
export declare function resolveConfigPath({ configDirectory }: ResolveParams): string;
export declare function getConfig(inlineConfig?: Partial<Config>, configDirectory?: string): Config;
export {};
