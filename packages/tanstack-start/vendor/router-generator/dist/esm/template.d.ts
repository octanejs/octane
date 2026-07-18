import { Config } from './config.js';
type TemplateTag = 'tsrImports' | 'tsrPath' | 'tsrExportStart' | 'tsrExportEnd';
export declare function fillTemplate(config: Config, template: string, values: Record<TemplateTag, string>, formatter?: (source: string) => string | Promise<string>): string | Promise<string>;
export type TargetTemplate = {
    fullPkg: string;
    subPkg: string;
    rootRoute: {
        template: () => string;
        imports: {
            tsrImports: () => string;
            tsrExportStart: () => string;
            tsrExportEnd: () => string;
        };
    };
    route: {
        template: () => string;
        imports: {
            tsrImports: () => string;
            tsrExportStart: (routePath: string) => string;
            tsrExportEnd: () => string;
        };
    };
    lazyRoute: {
        template: () => string;
        imports: {
            tsrImports: () => string;
            tsrExportStart: (routePath: string) => string;
            tsrExportEnd: () => string;
        };
    };
};
export declare function getTargetTemplate(config: Config): TargetTemplate;
export {};
