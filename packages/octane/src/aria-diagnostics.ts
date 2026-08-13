/** Development-only ARIA naming diagnostics shared by the DOM and SSR runtimes. */

const VALID_ARIA_ATTRIBUTES = new Set([
	'aria-activedescendant',
	'aria-atomic',
	'aria-autocomplete',
	'aria-braillelabel',
	'aria-brailleroledescription',
	'aria-busy',
	'aria-checked',
	'aria-colcount',
	'aria-colindex',
	'aria-colindextext',
	'aria-colspan',
	'aria-controls',
	'aria-current',
	'aria-describedby',
	'aria-description',
	'aria-details',
	'aria-disabled',
	'aria-dropeffect',
	'aria-errormessage',
	'aria-expanded',
	'aria-flowto',
	'aria-grabbed',
	'aria-haspopup',
	'aria-hidden',
	'aria-invalid',
	'aria-keyshortcuts',
	'aria-label',
	'aria-labelledby',
	'aria-level',
	'aria-live',
	'aria-modal',
	'aria-multiline',
	'aria-multiselectable',
	'aria-orientation',
	'aria-owns',
	'aria-placeholder',
	'aria-posinset',
	'aria-pressed',
	'aria-readonly',
	'aria-relevant',
	'aria-required',
	'aria-roledescription',
	'aria-rowcount',
	'aria-rowindex',
	'aria-rowindextext',
	'aria-rowspan',
	'aria-selected',
	'aria-setsize',
	'aria-sort',
	'aria-valuemax',
	'aria-valuemin',
	'aria-valuenow',
	'aria-valuetext',
]);

/** Return whether an authored property belongs to the ARIA naming surface. */
export function isAriaAttributeName(name: string): boolean {
	if (name === 'aria') return true;
	if (name.length < 5 || name.slice(0, 4) !== 'aria') return false;
	const next = name.charCodeAt(4);
	return next === 45 || (next >= 65 && next <= 90);
}

/** Unknown lowercase aria-* names aggregate by host; casing errors do not. */
export function isUnknownAriaAttribute(name: string): boolean {
	return name.startsWith('aria-') && !VALID_ARIA_ATTRIBUTES.has(name.toLowerCase());
}

/** Build Octane's actionable development diagnostic without changing serialization. */
export function ariaAttributeWarning(name: string, tag: string): string | null {
	if (name === 'aria') {
		return 'The `aria` attribute is reserved for future use. Pass individual `aria-*` attributes instead.';
	}
	if (name.length < 5 || name.slice(0, 4) !== 'aria') return null;
	if (name.charCodeAt(4) === 45) {
		const lowercase = name.toLowerCase();
		if (VALID_ARIA_ATTRIBUTES.has(lowercase)) {
			return name === lowercase
				? null
				: `Unknown ARIA attribute \`${name}\`. Did you mean \`${lowercase}\`?`;
		}
		return `Invalid aria prop \`${name}\` on <${tag}> tag. ARIA attributes must use valid, lowercase aria-* names.`;
	}
	const next = name.charCodeAt(4);
	if (next < 65 || next > 90) return null;
	const correctName = 'aria-' + name.slice(4).toLowerCase();
	return VALID_ARIA_ATTRIBUTES.has(correctName)
		? `Invalid ARIA attribute \`${name}\`. Did you mean \`${correctName}\`?`
		: `Invalid ARIA attribute \`${name}\`. ARIA attributes follow the pattern aria-* and must be lowercase.`;
}

/** Group separately unknown lowercase names into React's singular/plural form. */
export function unknownAriaAttributeWarning(names: readonly string[], tag: string): string {
	const noun = names.length === 1 ? 'prop' : 'props';
	const quoted = names.map((name) => `\`${name}\``).join(', ');
	return `Invalid aria ${noun} ${quoted} on <${tag}> tag. ARIA attributes must use valid, lowercase aria-* names.`;
}
