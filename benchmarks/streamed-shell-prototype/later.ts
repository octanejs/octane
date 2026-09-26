// A dynamic dependency makes eventual client reachability measurable, in
// addition to the initial static import closure.
export function increment(value: number) {
	return value + 1;
}
