/** Octane's virtual TSX compiler with the native StyleX attribute contract. */
export declare const compileToVolarMappings: typeof import('octane/compiler/volar').compileToVolarMappings;

/** Babel plugin placed after StyleX; generated modules are in metadata.octaneStylexSharedConstants. */
export declare function stylexBindingConstants(
	api: unknown,
	options: {
		bindingConstants?: import('octane/compiler').CompileResult['bindingConstants'];
		dev?: boolean;
		importSources?: readonly (string | { from: string; as: string })[];
		inputSourceMap?: object;
	},
): { name: string };
