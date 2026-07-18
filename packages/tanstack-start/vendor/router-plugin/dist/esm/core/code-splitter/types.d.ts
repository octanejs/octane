import { SplitRouteIdentNodes } from '../constants.js';
export type SplitStrategy = 'lazyFn' | 'lazyRouteComponent';
export type SplitNodeMeta = {
    routeIdent: SplitRouteIdentNodes;
    splitStrategy: SplitStrategy;
    localImporterIdent: string;
    exporterIdent: string;
    localExporterIdent: string;
};
