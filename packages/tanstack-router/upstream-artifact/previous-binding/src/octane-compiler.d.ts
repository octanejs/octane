declare module 'octane/compiler/volar' {
	export interface VolarCompileResult {
		code: string;
		mappings: Array<unknown>;
		cssMappings: Array<unknown>;
		scriptMappings: Array<unknown>;
		sourceAst: unknown;
		errors: Array<unknown>;
	}

	export function compileToVolarMappings(source: string, filename?: string): VolarCompileResult;
}
