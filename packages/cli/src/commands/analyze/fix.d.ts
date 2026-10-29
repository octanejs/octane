interface Edit {
	start: number;
	end: number;
	text: string;
}
interface Fix {
	code: string;
	edits: Edit[];
}
export declare function applyFixes(
	source: string,
	fixes: readonly Fix[],
): { text: string; applied: Fix[] };
export declare function pruneImports(text: string): string;
