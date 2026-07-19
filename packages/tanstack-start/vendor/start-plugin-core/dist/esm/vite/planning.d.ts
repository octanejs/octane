import { ENTRY_POINTS } from '../constants.js';
import { CompileStartFrameworkOptions } from '../types.js';
import { ResolvedStartEntryPlan } from '../planning.js';
import type * as vite from 'vite';
export interface ViteResolvedEntryAliases {
    client: string;
    server: string;
    start: string;
    router: string;
    alias: Record<(typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS], string>;
}
export declare function createViteResolvedEntryAliases(opts: {
    entryPaths: ResolvedStartEntryPlan['entryPaths'];
}): ViteResolvedEntryAliases;
export declare function createViteConfigPlan(opts: {
    viteConfig: vite.UserConfig;
    command: 'serve' | 'build';
    framework: CompileStartFrameworkOptions;
    entryAliases: ViteResolvedEntryAliases;
    clientOutputDirectory: string;
    serverOutputDirectory: string;
    serverFnProviderEnv: string;
    optimizeDepsExclude: Array<string>;
    noExternal: Array<string>;
}): {
    environments: {
        client: {
            consumer: "client";
            build: {
                rollupOptions: {
                    input: {
                        index: string;
                    };
                };
                rolldownOptions: {
                    input: {
                        index: string;
                    };
                };
                outDir: string;
            };
            optimizeDeps: {
                exclude: string[];
                entries: string[];
            };
        };
        ssr: {
            consumer: "server";
            build: {
                outDir: string;
                commonjsOptions: {
                    include: RegExp[];
                };
                copyPublicDir: boolean;
                rollupOptions: {
                    input: any;
                };
                rolldownOptions: {
                    input: any;
                };
                ssr: true;
            };
            optimizeDeps: {
                entries: string[];
            };
        };
    };
    resolve: {
        noExternal: string[];
        alias: {
            "virtual:tanstack-start-client-entry": string;
            "virtual:tanstack-start-server-entry": string;
            "#tanstack-start-entry": string;
            "#tanstack-router-entry": string;
        };
    };
};
export declare function createViteDefineConfig(opts: {
    command: 'serve' | 'build';
    mode: string | undefined;
    serverFnBase: string;
    routerBasepath: string;
    spaEnabled: boolean | undefined;
    devSsrStylesEnabled: boolean;
    devSsrStylesBasepath: string;
    inlineCssEnabled: boolean;
    staticNodeEnv: boolean;
    disableCsrfMiddlewareWarning: boolean;
}): {
    'process.env.NODE_ENV'?: string | undefined;
    "process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false" | "true";
    "import.meta.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING": "false" | "true";
    "process.env.TSS_INLINE_CSS_ENABLED": "false" | "true";
    "import.meta.env.TSS_INLINE_CSS_ENABLED": "false" | "true";
    "process.env.TSS_DEV_SSR_STYLES_BASEPATH": string;
    "import.meta.env.TSS_DEV_SSR_STYLES_BASEPATH": string;
    "process.env.TSS_DEV_SSR_STYLES_ENABLED": "false" | "true";
    "import.meta.env.TSS_DEV_SSR_STYLES_ENABLED": "false" | "true";
    "process.env.TSS_DEV_SERVER": "false" | "true";
    "import.meta.env.TSS_DEV_SERVER": "false" | "true";
    "process.env.TSS_SHELL"?: "false" | "true" | undefined;
    "import.meta.env.TSS_SHELL"?: "false" | "true" | undefined;
    "process.env.TSS_ROUTER_BASEPATH": string;
    "import.meta.env.TSS_ROUTER_BASEPATH": string;
    "process.env.TSS_SERVER_FN_BASE": string;
    "import.meta.env.TSS_SERVER_FN_BASE": string;
};
export declare function buildStartViteEnvironments(opts: {
    builder: vite.ViteBuilder;
    providerEnvironmentName: string;
    ssrIsProvider: boolean;
}): Promise<void>;
