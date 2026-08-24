import { AutoAnimateOptions, AutoAnimationPlugin } from "../index";
import { Setter, Accessor } from "solid-js";
declare module "solid-js" {
    namespace JSX {
        interface Directives {
            autoAnimate: Partial<AutoAnimateOptions> | AutoAnimationPlugin | true;
        }
    }
}
export declare const createAutoAnimate: <T extends HTMLElement>(options?: Partial<AutoAnimateOptions> | AutoAnimationPlugin) => [Setter<T | null>, (enabled: boolean) => void];
export declare const createAutoAnimateDirective: () => (el: HTMLElement, options: Accessor<Partial<AutoAnimateOptions> | AutoAnimationPlugin | true>) => void;
