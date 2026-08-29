import { GeneratorPlugin } from '@octanejs/tanstack-router/router-generator';
export declare function composeGeneratorPlugins(opts: {
	frameworkPlugins?: ReadonlyArray<GeneratorPlugin> | undefined;
	userPlugins?: ReadonlyArray<GeneratorPlugin> | undefined;
	builtInPlugins: ReadonlyArray<GeneratorPlugin>;
}): Array<GeneratorPlugin>;
