/**
 * Pristine-suite stub for `vitest/browser` so InView.test.tsx can load under
 * jsdom. The typed-input case exercises DOM events, not Vitest's browser provider.
 */
export const userEvent = {
	async type(element: Element, text: string) {
		const input = element as HTMLInputElement;
		input.focus();
		input.value = `${input.value}${text}`;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('change', { bubbles: true }));
	},
};
