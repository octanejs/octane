import { ServerFn } from './types.js';
interface GenerateServerFnResolverModuleOptions {
    serverFnsById: Record<string, ServerFn>;
    includeClientReferencedCheck: boolean;
    useStaticImports?: boolean;
}
export declare function generateServerFnResolverModule(opts: GenerateServerFnResolverModuleOptions): string;
export {};
