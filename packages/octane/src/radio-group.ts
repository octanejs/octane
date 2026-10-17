/** Native lookup candidates; consumers still filter exact radio/name/form matches. */
export function radioGroupCandidates(input: HTMLInputElement): ArrayLike<Node> {
	const name = input.name;
	// Nameless and isolated radios still need their own staged state synchronized.
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
