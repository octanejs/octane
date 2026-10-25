// Native form-control helpers shared by the renderer's controlled inputs
// (runtime/forms.ts) and the optional signal control binding, which must not
// import the renderer.

/** Native lookup candidates; consumers still filter exact radio/name/form matches. */
export function radioGroupCandidates(input: HTMLInputElement): ArrayLike<Node> {
	const name = input.name;
	// Nameless radios are independent, but still publish their own checked state.
	if (name === '') return [input];
	const form = input.form;
	if (form !== null) {
		const named = form.elements.namedItem(name);
		return named === null ? [] : 'nodeType' in named ? [named] : named;
	}
	const root = input.getRootNode();
	if (root === input) return [input];
	return root.nodeType === 9
		? (root as Document).getElementsByName(name)
		: (root as Element | DocumentFragment).querySelectorAll('input[type="radio"]');
}

/** The string a control presents for a rendered value (nullish never reaches here). */
export function toControlledString(value: unknown): string {
	return typeof value === 'string'
		? value
		: typeof value === 'function' || typeof value === 'symbol'
			? ''
			: String(value);
}
