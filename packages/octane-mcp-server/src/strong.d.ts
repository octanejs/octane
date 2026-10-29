export declare const STRONG_CATALOG: {
	$comment: string;
	docsUrl: string;
	sections: { id: string; title: string }[];
	diagnostics: {
		code: string;
		section: string;
		severity: string;
		detects: string;
		replacement: string;
		url: string;
		primitives?: string[];
	}[];
	recipes: {
		id: string;
		title: string;
		react: string;
		strong: string;
		codes: string[];
		before: string;
		after: string;
		note: string;
	}[];
};
export declare const STRONG_EXPLAIN_TOOL: {
	name: string;
	title: string;
	description: string;
	codeDescription: string;
	recipeDescription: string;
};
export declare function strongRecipeUrl(id: string): string;
export declare function strongDiagnosticUrl(code: string): string | undefined;
export declare function resolveStrongCode(input: string): string | null;
export declare function closeStrongCodes(input: string, limit?: number): string[];
export declare function explainStrong(input?: { code?: string; recipe?: string }): {
	ok: boolean;
	text: string;
};
