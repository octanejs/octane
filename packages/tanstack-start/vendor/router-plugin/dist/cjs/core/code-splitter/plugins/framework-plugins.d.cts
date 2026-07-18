import { ReferenceRouteCompilerPlugin, VirtualRouteCompilerPlugin } from '../plugins.cjs';
import { Config, HmrStyle } from '../../config.cjs';
export declare function getReferenceRouteCompilerPlugins(opts: {
    targetFramework: Config['target'];
    addHmr?: boolean;
    hmrStyle?: HmrStyle;
}): Array<ReferenceRouteCompilerPlugin> | undefined;
export declare function getVirtualRouteCompilerPlugins(opts: {
    targetFramework: Config['target'];
    addHmr?: boolean;
    hmrStyle?: HmrStyle;
}): Array<VirtualRouteCompilerPlugin> | undefined;
