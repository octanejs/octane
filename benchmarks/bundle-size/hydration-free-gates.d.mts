export interface DeniedDeclaration {
	name: string;
	/** Path below packages/octane/src/. */
	source: string;
	foldOnly?: boolean;
}

export interface DeclarationRange extends DeniedDeclaration {
	startLine: number;
	startColumn: number;
	endLine: number;
	endColumn: number;
}

export interface SourceMapLike {
	sources: readonly (string | null)[];
	mappings: string;
}

export const HYDRATION_ONLY_DECLARATIONS: readonly DeniedDeclaration[];
export const HYDRATION_ONLY_MODULES: readonly RegExp[];

export function deniedRangesFor(
	bundler: 'rolldown' | 'esbuild',
	ranges: readonly DeclarationRange[],
): DeclarationRange[];
export function topLevelDeclarations(program: unknown): Map<string, { start: number; end: number }>;
export function resolveDeclarationRanges(
	readSource: (source: string) => string,
	parse: (text: string, source: string) => unknown,
	denied?: readonly DeniedDeclaration[],
): DeclarationRange[];
export function mappedSourcePositions(mappings: string): Generator<[number, number, number]>;
export function retainedDeclarations(
	map: SourceMapLike,
	ranges: readonly DeclarationRange[],
): Set<string>;
export function verifyHydrationFree(
	label: string,
	bundle: { retained: Set<string>; modules?: readonly string[] },
	ranges: readonly DeclarationRange[],
	deniedModules?: readonly RegExp[],
): void;
export function verifyControlCoverage(
	controls: Map<string, Set<string>>,
	ranges: readonly DeclarationRange[],
): void;
