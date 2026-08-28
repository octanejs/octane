// TypeScript's declaration emit from volar.js JSDoc is checked against this
// formatted file at build time, before the standalone entry is bundled.
export function compileToVolarMappings(
	source: string,
	filename?: string,
	options?: { loose?: boolean; renderers?: unknown; strong?: boolean; nativeReads?: boolean },
): import('./index.js').VolarCompileResult;

/** Virtual TSX and authored ranges used by compiler inspection tooling. */
export function compileTypesInspection(
	source: string,
	filename?: string,
	options?: { renderers?: unknown },
): {
	code: string;
	sourceAst: import('./index.js').CompilerProgram;
	generatedAst: import('./index.js').CompilerProgram;
	segments: (import('./index.js').CompileInspection['segments'][number] & { exact?: true })[];
};
