export declare function invalidHtmlNestingWithAncestor(
	childTag: string,
	ancestors: string[],
	childLocation?: string,
	ancestorLocation?: string,
): string | null;
export declare function invalidHtmlNestingWithParent(
	childTag: string,
	parentTag: string,
	childLocation?: string,
	parentLocation?: string,
): string | null;
export declare function invalidHtmlTextNesting(
	text: string,
	parentTag: string,
	parentLocation?: string,
): string | null;
