import { Config } from '../config.cjs';
type FrameworkOptions = {
    package: string;
    idents: {
        createFileRoute: string;
        lazyFn: string;
        lazyRouteComponent: string;
    };
};
export declare function getFrameworkOptions(framework: Config['target']): FrameworkOptions;
export {};
