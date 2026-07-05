// Ported verbatim from .base-ui/packages/utils/src/getDefaultFormSubmitter.ts. Returns the
// button a browser would use for implicit (Enter-key) form submission.
export type DefaultFormSubmitter = HTMLButtonElement | HTMLInputElement;

export function getDefaultFormSubmitter(form: HTMLFormElement | null): DefaultFormSubmitter | null {
	if (!form) {
		return null;
	}
	for (const candidate of Array.from(form.elements)) {
		const tagName = candidate.tagName;
		if (tagName === 'BUTTON' || tagName === 'INPUT') {
			const button = candidate as HTMLButtonElement | HTMLInputElement;
			if (button.type === 'submit') {
				return button;
			}
		}
	}
	return null;
}
