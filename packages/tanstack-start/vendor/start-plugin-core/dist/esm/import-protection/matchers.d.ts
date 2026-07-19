import { Pattern } from './utils.js';
export interface CompiledMatcher {
    pattern: Pattern;
    literal?: string;
    test: (value: string) => boolean;
}
export declare function isLiteralMatcherPattern(pattern: string): boolean;
/**
 * Compile a Pattern (string glob or RegExp) into a fast test function.
 * String patterns use picomatch for full glob support (**, *, ?, braces, etc.).
 * RegExp patterns are used as-is.
 */
export declare function compileMatcher(pattern: Pattern): CompiledMatcher;
export declare function compileMatchers(patterns: Array<Pattern>): Array<CompiledMatcher>;
export declare function matchesAny(value: string, matchers: Array<CompiledMatcher>): CompiledMatcher | undefined;
