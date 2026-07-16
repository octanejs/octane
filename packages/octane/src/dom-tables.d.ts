// Hand-written declarations for dom-tables.js (a plain-JS module so the
// verbatim-shipped compiler can import it — see the module header). Keep in
// step with the runtime exports; `constants.ts` re-exports the public tables
// with these same types.
export const VOID_ELEMENTS: Set<string>;
export const BOOLEAN_ATTR_PROPS: Set<string>;
export const MUST_USE_PROPERTY_PROPS: Set<string>;
export const POSITIVE_NUMERIC_ATTR_PROPS: Set<string>;
export const SVG_ONLY_TAGS: Set<string>;
export const ATTRIBUTE_ALIASES: Map<string, string>;
export function isEnumeratedBooleanAttr(name: string): boolean;
export function isUnitlessStyleProp(name: string): boolean;
export function cssStyleValue(name: string, value: unknown): string;
export function hyphenateStyleName(name: string): string;
