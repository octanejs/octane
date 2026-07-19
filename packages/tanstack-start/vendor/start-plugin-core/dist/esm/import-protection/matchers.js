import picomatch from "picomatch";
//#region src/import-protection/matchers.ts
var globLikePatternRE = /[*?![\]{}()]/;
function isLiteralMatcherPattern(pattern) {
	return !globLikePatternRE.test(pattern);
}
/**
* Compile a Pattern (string glob or RegExp) into a fast test function.
* String patterns use picomatch for full glob support (**, *, ?, braces, etc.).
* RegExp patterns are used as-is.
*/
function compileMatcher(pattern) {
	if (pattern instanceof RegExp) return {
		pattern,
		test: (value) => {
			pattern.lastIndex = 0;
			return pattern.test(value);
		}
	};
	if (isLiteralMatcherPattern(pattern)) return {
		pattern,
		literal: pattern,
		test: (value) => value === pattern
	};
	return {
		pattern,
		test: picomatch(pattern, { dot: true })
	};
}
function compileMatchers(patterns) {
	return patterns.map(compileMatcher);
}
function matchesAny(value, matchers) {
	for (const matcher of matchers) if (matcher.test(value)) return matcher;
}
//#endregion
export { compileMatchers, matchesAny };

//# sourceMappingURL=matchers.js.map