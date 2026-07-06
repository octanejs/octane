// Ported from @base-ui/utils/inertValue. octane targets React-19 semantics, where `inert` is a
// real boolean attribute, so the value passes through unchanged.
export function inertValue(value?: boolean): boolean | undefined {
	return value;
}
